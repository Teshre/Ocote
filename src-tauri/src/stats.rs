// stats.rs — Estadísticas de uso (100% offline, sin enviar nada a ningún lado)
//
// Dos fuentes de datos:
//   1. Historial del shell (~/.zsh_history, ~/.bash_history, fish_history):
//      da "top comandos all-time" — lo que el usuario ya ha hecho. Se lee en
//      cada consulta, no se persiste.
//   2. Log propio (SQLite): cada comando ejecutado DENTRO de Ocote se registra
//      con hora, exit code y duración (vía OSC 133 desde el frontend). Permite
//      stats que el historial plano no tiene: hora pico, % de errores, comando
//      más lento, días activos.

use rusqlite::Connection;
use serde::Serialize;
use std::collections::HashMap;
use std::path::Path;
use std::sync::Mutex;

// Estado manejado por Tauri: la conexión SQLite del log de comandos.
pub struct StatsState(pub Mutex<Connection>);

impl StatsState {
    pub fn new(conn: Connection) -> Self {
        Self(Mutex::new(conn))
    }
}

/// Abre (o crea) la base de datos del log de comandos y asegura el esquema.
pub fn open_db(path: &Path) -> rusqlite::Result<Connection> {
    let conn = Connection::open(path)?;
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS command_log (
            id            INTEGER PRIMARY KEY AUTOINCREMENT,
            command       TEXT    NOT NULL,
            program       TEXT    NOT NULL,
            exit_code     INTEGER NOT NULL,
            duration_secs INTEGER NOT NULL,
            ts            INTEGER NOT NULL,
            cwd           TEXT
         );
         CREATE INDEX IF NOT EXISTS idx_log_ts      ON command_log(ts);
         CREATE INDEX IF NOT EXISTS idx_log_program ON command_log(program);",
    )?;
    Ok(conn)
}

// ── Estructuras de respuesta ──────────────────────────────────────────────────

#[derive(Serialize)]
pub struct CountItem {
    pub name: String,
    pub count: usize,
}

#[derive(Serialize)]
pub struct SlowItem {
    pub command: String,
    pub duration_secs: i64,
}

#[derive(Serialize)]
pub struct Stats {
    // ── Desde el historial del shell ──
    pub history_total: usize,
    pub history_unique: usize,
    pub top_programs: Vec<CountItem>,
    pub top_commands: Vec<CountItem>,
    pub shell: String,
    // ── Desde el log propio de Ocote ──
    pub log_total: i64,
    pub log_success: i64,
    pub log_error: i64,
    pub by_hour: Vec<i64>, // 24 buckets (hora local)
    pub slowest: Option<SlowItem>,
    pub active_days: i64,
}

// ── Comando Tauri: registrar un comando ejecutado ──────────────────────────────

/// Registra un comando que terminó. Llamado desde terminal.js en OSC 133 D.
/// Silencioso ante errores (no queremos romper el flujo del terminal por stats).
#[tauri::command]
pub fn log_command(
    state: tauri::State<StatsState>,
    command: String,
    exit_code: i64,
    duration_secs: i64,
    cwd: Option<String>,
) -> Result<(), String> {
    let trimmed = command.trim();
    if trimmed.is_empty() {
        return Ok(());
    }
    // El "programa" es la primera palabra (git, cd, npm, cargo...).
    let program = trimmed.split_whitespace().next().unwrap_or("").to_string();
    if program.is_empty() {
        return Ok(());
    }

    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs() as i64)
        .unwrap_or(0);

    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO command_log (command, program, exit_code, duration_secs, ts, cwd)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![trimmed, program, exit_code, duration_secs, ts, cwd],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

// ── Comando Tauri: obtener todas las estadísticas ──────────────────────────────

#[tauri::command]
pub fn get_stats(state: tauri::State<StatsState>) -> Result<Stats, String> {
    // ── 1. Historial del shell ──
    let (shell, commands) = parse_shell_history();
    let history_total = commands.len();

    let mut program_counts: HashMap<String, usize> = HashMap::new();
    let mut command_counts: HashMap<String, usize> = HashMap::new();
    for cmd in &commands {
        let prog = cmd.split_whitespace().next().unwrap_or("").to_string();
        if !prog.is_empty() {
            *program_counts.entry(prog).or_insert(0) += 1;
        }
        *command_counts.entry(cmd.clone()).or_insert(0) += 1;
    }
    let history_unique = command_counts.len();
    let top_programs = top_n(&program_counts, 12);
    let top_commands = top_n(&command_counts, 10);

    // ── 2. Log propio (SQLite) ──
    let conn = state.0.lock().map_err(|e| e.to_string())?;

    let log_total: i64 = conn
        .query_row("SELECT COUNT(*) FROM command_log", [], |r| r.get(0))
        .unwrap_or(0);
    let log_error: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM command_log WHERE exit_code != 0",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);
    let log_success = log_total - log_error;

    // Distribución por hora local (0-23)
    let mut by_hour = vec![0i64; 24];
    if let Ok(mut stmt) = conn.prepare(
        "SELECT CAST(strftime('%H', ts, 'unixepoch', 'localtime') AS INTEGER) AS h, COUNT(*)
         FROM command_log GROUP BY h",
    ) {
        let rows = stmt.query_map([], |r| Ok((r.get::<_, i64>(0)?, r.get::<_, i64>(1)?)));
        if let Ok(rows) = rows {
            for row in rows.flatten() {
                let (h, c) = row;
                if (0..24).contains(&h) {
                    by_hour[h as usize] = c;
                }
            }
        }
    }

    // Comando más lento registrado
    let slowest = conn
        .query_row(
            "SELECT command, duration_secs FROM command_log ORDER BY duration_secs DESC LIMIT 1",
            [],
            |r| {
                Ok(SlowItem {
                    command: r.get(0)?,
                    duration_secs: r.get(1)?,
                })
            },
        )
        .ok()
        // Ignorar comandos triviales (duración 0) — no aportan
        .filter(|s| s.duration_secs > 0);

    // Días distintos con actividad
    let active_days: i64 = conn
        .query_row(
            "SELECT COUNT(DISTINCT date(ts, 'unixepoch', 'localtime')) FROM command_log",
            [],
            |r| r.get(0),
        )
        .unwrap_or(0);

    Ok(Stats {
        history_total,
        history_unique,
        top_programs,
        top_commands,
        shell,
        log_total,
        log_success,
        log_error,
        by_hour,
        slowest,
        active_days,
    })
}

// ── Helpers ────────────────────────────────────────────────────────────────────

/// Ordena un mapa de conteos y devuelve el top N (mayor a menor).
fn top_n(counts: &HashMap<String, usize>, n: usize) -> Vec<CountItem> {
    let mut items: Vec<CountItem> = counts
        .iter()
        .map(|(name, &count)| CountItem {
            name: name.clone(),
            count,
        })
        .collect();
    // Orden: por conteo desc, luego nombre asc para estabilidad
    items.sort_by(|a, b| b.count.cmp(&a.count).then_with(|| a.name.cmp(&b.name)));
    items.truncate(n);
    items
}

/// Lee y parsea el archivo de historial del shell del usuario.
/// Devuelve (nombre_shell, lista_de_comandos). Best-effort: si no existe, vacío.
fn parse_shell_history() -> (String, Vec<String>) {
    // HOME en Unix, USERPROFILE en Windows.
    let home = std::env::var("HOME")
        .or_else(|_| std::env::var("USERPROFILE"))
        .unwrap_or_default();
    let shell_env = std::env::var("SHELL").unwrap_or_default().to_lowercase();

    // ── Detección de shell + ruta del historial ──
    // Nota: en macOS/Linux $SHELL es el login shell (lo más representativo).
    // El log propio de Ocote (vía OSC 133) sí captura el shell real usado,
    // sin importar cuál sea — esto es solo para el "top comandos all-time".
    let (shell_name, path): (&str, String) = if shell_env.contains("bash") {
        ("bash", format!("{}/.bash_history", home))
    } else if shell_env.contains("fish") {
        ("fish", format!("{}/.local/share/fish/fish_history", home))
    } else if shell_env.contains("pwsh")
        || shell_env.contains("powershell")
        || cfg!(target_os = "windows")
    {
        // PowerShell (PSReadLine)
        #[cfg(target_os = "windows")]
        let p = {
            let appdata = std::env::var("APPDATA").unwrap_or_default();
            format!(
                "{}\\Microsoft\\Windows\\PowerShell\\PSReadLine\\ConsoleHost_history.txt",
                appdata
            )
        };
        #[cfg(not(target_os = "windows"))]
        let p = format!(
            "{}/.local/share/powershell/PSReadLine/ConsoleHost_history.txt",
            home
        );
        ("powershell", p)
    } else {
        ("zsh", format!("{}/.zsh_history", home))
    };

    // Leer como BYTES + from_utf8_lossy (los historiales no son UTF-8 puro;
    // read_to_string fallaría con un solo byte inválido — ver fix sesión 18).
    let bytes = std::fs::read(&path).unwrap_or_default();
    let content = String::from_utf8_lossy(&bytes);
    let mut cmds = Vec::new();

    if shell_name == "fish" {
        // Formato YAML-ish: líneas "- cmd: <comando>" (ya es 1 línea por comando)
        for line in content.lines() {
            if let Some(rest) = line.trim_start().strip_prefix("- cmd: ") {
                let c = rest.trim();
                if !c.is_empty() {
                    cmds.push(c.to_string());
                }
            }
        }
    } else if shell_name == "powershell" {
        // PowerShell: 1 comando por línea (multilínea usa backtick, raro). Simple.
        for line in content.lines() {
            let c = line.trim();
            if !c.is_empty() {
                cmds.push(c.to_string());
            }
        }
    } else {
        // zsh / bash: unir comandos multilínea (continuación con `\` al final).
        // Sin esto, código pegado (heredocs, scripts) se parte en líneas sueltas
        // y contamina las stats con `\`, `import json\`, `def main():\`, etc.
        let mut buffer = String::new();
        for raw in content.lines() {
            let mut seg = raw.to_string();

            // Solo al inicio de un comando (buffer vacío):
            if buffer.is_empty() {
                // bash: líneas "#<timestamp>" son marcas de tiempo, no comandos
                if shell_name == "bash" && seg.trim_start().starts_with('#') {
                    continue;
                }
                // zsh extended history: ": <epoch>:<elapsed>;<comando>"
                if seg.starts_with(": ") {
                    if let Some(idx) = seg.find(';') {
                        seg = seg[idx + 1..].to_string();
                    }
                }
            }

            // ¿Continúa en la siguiente línea? (termina en un solo `\`)
            if seg.ends_with('\\') && !seg.ends_with("\\\\") {
                buffer.push_str(&seg[..seg.len() - 1]);
                buffer.push('\n');
                continue;
            }

            buffer.push_str(&seg);
            let cmd = buffer.trim().to_string();
            buffer.clear();
            if !cmd.is_empty() {
                cmds.push(cmd);
            }
        }
        // Resto pendiente (por si el archivo termina en continuación)
        let tail = buffer.trim().to_string();
        if !tail.is_empty() {
            cmds.push(tail);
        }
    }

    (shell_name.to_string(), cmds)
}
