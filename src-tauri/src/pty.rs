// pty.rs — Manejo de múltiples sesiones PTY (Pseudo-Terminal)
//
// Cada shell es una PTY independiente con su propio proceso zsh/bash.
// El frontend crea tabs, cada uno con un shell_id único.
//
// Eventos Tauri:
//   - "pty-output" → { shell_id: String, data: String }
//   - "pty-exit"   → { shell_id: String }
//
// Comandos:
//   - create_shell(name) → shell_id
//   - write_to_shell(shell_id, input)
//   - resize_pty(shell_id, rows, cols)
//   - get_shell_cwd(shell_id) → path
//   - close_shell(shell_id)

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::collections::HashMap;
use std::io::{Read, Write};
use std::sync::Mutex;
#[cfg(not(target_os = "windows"))]
use tauri::Manager; // trait que provee window.app_handle()

// ── Estado de un shell individual ────────────────────────────────────────

struct ShellState {
    writer:    Mutex<Option<Box<dyn Write + Send>>>,
    child:     Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>,
    shell_pid: Mutex<Option<u32>>,
    master:    Mutex<Option<Box<dyn MasterPty + Send>>>,
}

impl ShellState {
    fn new() -> Self {
        ShellState {
            writer:    Mutex::new(None),
            child:     Mutex::new(None),
            shell_pid: Mutex::new(None),
            master:    Mutex::new(None),
        }
    }
}

// ── Manager de shells ───────────────────────────────────────────────────

pub struct PtyState {
    shells:  Mutex<HashMap<String, ShellState>>,
    next_id: Mutex<u32>,
}

impl PtyState {
    pub fn new() -> Self {
        PtyState {
            shells:  Mutex::new(HashMap::new()),
            next_id: Mutex::new(1),
        }
    }

    fn generate_id(&self) -> String {
        let mut id = self.next_id.lock().unwrap();
        let result = format!("shell-{}", *id);
        *id += 1;
        result
    }
}

// Payloads para eventos Tauri (deben ser serializables)
#[derive(serde::Serialize, Clone)]
struct PtyOutput {
    shell_id: String,
    data:     String,
}

#[derive(serde::Serialize, Clone)]
struct PtyExit {
    shell_id: String,
}

// ── zsh-syntax-highlighting (inyección no invasiva) ────────────────────────

/// Encuentra el directorio del plugin zsh-syntax-highlighting bundleado.
/// Prod: recurso del bundle (resuelto vía path_resolver).
/// Dev:  relativo a CARGO_MANIFEST_DIR (src-tauri/).
#[cfg(not(target_os = "windows"))]
fn find_highlight_dir(window: &tauri::Window) -> Option<std::path::PathBuf> {
    // Producción: recurso bundleado dentro del .app
    if let Some(p) = window
        .app_handle()
        .path_resolver()
        .resolve_resource("resources/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh")
    {
        if p.exists() {
            return p.parent().map(|d| d.to_path_buf());
        }
    }
    // Desarrollo: relativo al manifiesto de Cargo
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("resources/zsh-syntax-highlighting");
    if dev.join("zsh-syntax-highlighting.zsh").exists() {
        return Some(dev);
    }
    None
}

/// Crea un ZDOTDIR temporal con wrappers .zshenv/.zshrc que cargan la config
/// real del usuario y luego el plugin de highlighting. Devuelve el path del
/// ZDOTDIR, o None si no se pudo preparar (entonces no se inyecta nada).
#[cfg(not(target_os = "windows"))]
fn setup_zsh_highlight(window: &tauri::Window) -> Option<String> {
    let hl_dir = find_highlight_dir(window)?;
    let hl_script = hl_dir.join("zsh-syntax-highlighting.zsh");

    // Dir estable para el ZDOTDIR de Ocote (se regenera en cada arranque).
    let zdotdir = std::env::temp_dir().join("ocote-zdotdir");
    std::fs::create_dir_all(&zdotdir).ok()?;

    // .zshenv: delegar al del usuario. _OCOTE_ZDOTDIR lo pasa pty.rs vía env.
    let zshenv = "# Ocote ZDOTDIR wrapper — generado automáticamente.\n\
                  # Carga el .zshenv real del usuario sin alterar su configuración.\n\
                  [[ -f \"${_OCOTE_ZDOTDIR}/.zshenv\" ]] && source \"${_OCOTE_ZDOTDIR}/.zshenv\"\n";
    std::fs::write(zdotdir.join(".zshenv"), zshenv).ok()?;

    // .zshrc: restaurar ZDOTDIR, sourcear el .zshrc del usuario, luego el plugin.
    // El plugin DEBE cargarse al final (después de oh-my-zsh y autosuggestions).
    let zshrc = format!(
        "# Ocote ZDOTDIR wrapper — generado automáticamente.\n\
         # Restaura ZDOTDIR para que oh-my-zsh/p10k se comporten normal.\n\
         ZDOTDIR=\"${{_OCOTE_ZDOTDIR}}\"\n\
         # Carga la configuración real del usuario.\n\
         [[ -f \"${{_OCOTE_ZDOTDIR}}/.zshrc\" ]] && source \"${{_OCOTE_ZDOTDIR}}/.zshrc\"\n\
         # Ocote: syntax highlighting al final (orden correcto del plugin).\n\
         # Resaltadores: main (comandos válidos/inválidos, strings, paths) +\n\
         # brackets (paréntesis/llaves/corchetes emparejados).\n\
         ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)\n\
         [[ -f \"{hl}\" ]] && source \"{hl}\"\n",
        hl = hl_script.display()
    );
    std::fs::write(zdotdir.join(".zshrc"), zshrc).ok()?;

    Some(zdotdir.to_string_lossy().to_string())
}

// ── create_shell ──────────────────────────────────────────────────────────

/// Crear una nueva sesión PTY. Devuelve el shell_id asignado.
#[tauri::command]
pub fn create_shell(
    window:  tauri::Window,
    state:   tauri::State<PtyState>,
    rows:    Option<u16>,
    cols:    Option<u16>,
) -> Result<String, String> {
    let shell_id = state.generate_id();
    let shell = ShellState::new();

    let pty_system = native_pty_system();
    // Abrir el PTY al tamaño que el frontend ya midió (si lo pasó). Así zsh/p10k
    // dibujan el prompt una sola vez al tamaño correcto y se evita el "fantasma"
    // del resize inicial. Fallback a 24×80 si no se especifica.
    let pair = pty_system
        .openpty(PtySize {
            rows: rows.unwrap_or(24),
            cols: cols.unwrap_or(80),
            pixel_width:  0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Shell del usuario
    #[cfg(target_os = "windows")]
    let shell_cmd = "cmd.exe".to_string();
    #[cfg(not(target_os = "windows"))]
    let shell_cmd = std::env::var("SHELL")
        .unwrap_or_else(|_| "/bin/bash".to_string());

    let mut cmd = CommandBuilder::new(&shell_cmd);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    // Ocote: inyectar zsh-syntax-highlighting sin tocar el ~/.zshrc del usuario.
    // Técnica ZDOTDIR wrapper — apuntamos ZDOTDIR a un dir temporal cuyo .zshrc
    // (1) sourcea el .zshrc real del usuario y (2) carga el plugin al final
    // (orden correcto: después de oh-my-zsh y zsh-autosuggestions).
    // Si algo falla, el usuario obtiene su shell normal (fail-safe).
    #[cfg(not(target_os = "windows"))]
    if shell_cmd.contains("zsh") {
        if let Some(zdotdir) = setup_zsh_highlight(&window) {
            // Preservar el ZDOTDIR original (o $HOME) para sourcear la config real.
            let real_zdotdir = std::env::var("ZDOTDIR")
                .unwrap_or_else(|_| std::env::var("HOME").unwrap_or_default());
            cmd.env("_OCOTE_ZDOTDIR", real_zdotdir);
            cmd.env("ZDOTDIR", zdotdir);
        }
    }

    let child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Guardar PID
    #[cfg(unix)]
    {
        if let Some(pid) = child.process_id() {
            *shell.shell_pid.lock().unwrap() = Some(pid);
        }
    }

    *shell.child.lock().unwrap() = Some(child);

    // Extraer reader / writer / master
    let mut reader = pair.master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master
        .take_writer()
        .map_err(|e| e.to_string())?;

    *shell.writer.lock().unwrap() = Some(writer);
    *shell.master.lock().unwrap() = Some(pair.master);

    // Clonar shell_id para el thread
    let sid = shell_id.clone();
    let sid_exit = shell_id.clone();

    // Thread lector
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    window.emit("pty-exit", PtyExit {
                        shell_id: sid_exit.clone(),
                    }).ok();
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    window.emit("pty-output", PtyOutput {
                        shell_id: sid.clone(),
                        data:     output,
                    }).ok();
                }
                Err(_) => break,
            }
        }
    });

    // Guardar en el manager
    state.shells.lock().unwrap().insert(shell_id.clone(), shell);

    Ok(shell_id)
}

// ── write_to_shell ────────────────────────────────────────────────────────

#[tauri::command]
pub fn write_to_shell(
    shell_id: String,
    input:    String,
    state:    tauri::State<PtyState>,
) -> Result<(), String> {
    let shells = state.shells.lock().unwrap();
    let shell = shells.get(&shell_id)
        .ok_or(format!("Shell {} no encontrado", shell_id))?;

    let mut guard = shell.writer.lock().unwrap();
    if let Some(writer) = guard.as_mut() {
        writer.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── resize_pty ────────────────────────────────────────────────────────────

#[tauri::command]
pub fn resize_pty(
    shell_id: String,
    rows:     u16,
    cols:     u16,
    state:    tauri::State<PtyState>,
) -> Result<(), String> {
    let shells = state.shells.lock().unwrap();
    let shell = shells.get(&shell_id)
        .ok_or(format!("Shell {} no encontrado", shell_id))?;

    let guard = shell.master.lock().unwrap();
    if let Some(master) = guard.as_ref() {
        master.resize(PtySize {
            rows,
            cols,
            pixel_width:  0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── get_shell_cwd ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_shell_cwd(
    shell_id: String,
    state:    tauri::State<PtyState>,
) -> Result<String, String> {
    let shells = state.shells.lock().unwrap();
    let shell = shells.get(&shell_id)
        .ok_or(format!("Shell {} no encontrado", shell_id))?;

    let pid_guard = shell.shell_pid.lock().unwrap();
    let pid = pid_guard.ok_or("No hay shell activa")?;

    #[cfg(target_os = "macos")]
    {
        let output = std::process::Command::new("lsof")
            .args(&["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .output()
            .map_err(|e| format!("Error ejecutando lsof: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if line.starts_with('n') {
                return Ok(line[1..].to_string());
            }
        }
        Err("No se pudo determinar el CWD del shell".to_string())
    }

    #[cfg(target_os = "linux")]
    {
        let path = format!("/proc/{}/cwd", pid);
        std::fs::read_link(&path)
            .map(|p| p.to_string_lossy().to_string())
            .map_err(|e| format!("Error leyendo /proc/{}/cwd: {}", pid, e))
    }

    #[cfg(target_os = "windows")]
    {
        Err("get_shell_cwd no implementado en Windows".to_string())
    }
}

// ── close_shell ───────────────────────────────────────────────────────────

/// Cerrar un shell específico. Mata el proceso y libera recursos.
#[tauri::command]
pub fn close_shell(
    shell_id: String,
    state:    tauri::State<PtyState>,
) -> Result<(), String> {
    let mut shells = state.shells.lock().unwrap();
    let shell = shells.remove(&shell_id)
        .ok_or(format!("Shell {} no encontrado", shell_id))?;

    // Al hacer drop del child, el proceso recibe SIGKILL
    drop(shell);

    Ok(())
}

// ── list_shells ───────────────────────────────────────────────────────────

/// Listar todos los shells activos (para restaurar estado al frontend).
#[tauri::command]
pub fn list_shells(
    state: tauri::State<PtyState>,
) -> Result<Vec<String>, String> {
    let shells = state.shells.lock().unwrap();
    Ok(shells.keys().cloned().collect())
}

// ── spawn_shell (backward compatibility) ────────────────────────────────────
// DEPRECATED: usa create_shell() desde el frontend.
// Mantiene la firma anterior por si acaso, pero solo delega a create_shell.

#[tauri::command]
pub fn spawn_shell(
    window: tauri::Window,
    state:  tauri::State<PtyState>,
) -> Result<(), String> {
    // Crear shell por defecto con id "shell-1" para compatibilidad.
    // Sin tamaño explícito → usa el fallback 24×80.
    create_shell(window, state, None, None)?;
    Ok(())
}
