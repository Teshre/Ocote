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

// ── Inyección no invasiva: prompt nativo + syntax highlighting ─────────────

/// Resuelve un recurso bundleado por ruta relativa a src-tauri/.
/// Prod: recurso del .app (path_resolver). Dev: relativo a CARGO_MANIFEST_DIR.
#[cfg(not(target_os = "windows"))]
fn resolve_resource(window: &tauri::Window, rel: &str) -> Option<std::path::PathBuf> {
    if let Some(p) = window.app_handle().path_resolver().resolve_resource(rel) {
        if p.exists() {
            return Some(p);
        }
    }
    let dev = std::path::PathBuf::from(env!("CARGO_MANIFEST_DIR")).join(rel);
    if dev.exists() {
        return Some(dev);
    }
    None
}

/// Información de rutas de recursos bundleados de Ocote para inyectar al shell.
/// Los archivos son ESTÁTICOS (no se generan en runtime) — Tauri los bundlea.
#[cfg(not(target_os = "windows"))]
struct ShellResources {
    /// Directorio que se usará como ZDOTDIR para zsh.
    /// Contiene .zshenv y .zshrc bundleados de Ocote.
    shell_dir: std::path::PathBuf,
    /// Path al archivo principal de zsh-syntax-highlighting.
    /// Se pasa como OCOTE_ZSH_HL para que .zshrc lo sourcee al final.
    zsh_hl: Option<std::path::PathBuf>,
    /// Path al hook para bash (bash no tiene ZDOTDIR, usa --rcfile).
    bash_hook: Option<std::path::PathBuf>,
}

/// Resuelve los recursos bundleados de shell. Devuelve None si el directorio
/// principal (resources/shell) no existe — caso de degradación segura.
#[cfg(not(target_os = "windows"))]
fn resolve_shell_resources(window: &tauri::Window) -> Option<ShellResources> {
    // El directorio ZDOTDIR con los hooks de zsh
    let shell_dir = resolve_resource(window, "resources/shell")?;

    // Syntax highlighting (opcional — si no existe, el shell arranca igual)
    let zsh_hl = resolve_resource(
        window,
        "resources/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
    );

    // Hook para bash (opcional)
    let bash_hook = resolve_resource(window, "resources/shell/bash-hook.bash");

    Some(ShellResources { shell_dir, zsh_hl, bash_hook })
}

// ── create_shell ──────────────────────────────────────────────────────────

/// Crear una nueva sesión PTY. Devuelve el shell_id asignado.
///
/// # Parámetros
/// - `rows` / `cols`  — tamaño del PTY ya medido por xterm.js (evita el resize inicial).
/// - `prompt`         — preset de prompt: pill|block|minimal|ribbon|rail|passthrough.
/// - `accent`         — hex del color accent del tema activo SIN #, e.g. "E8843A".
///                      Usado por el shell para colorear el chevron ❯ en el preset minimal.
#[tauri::command]
pub fn create_shell(
    window:  tauri::Window,
    state:   tauri::State<PtyState>,
    rows:    Option<u16>,
    cols:    Option<u16>,
    prompt:  Option<String>,
    accent:  Option<String>,
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

    // Ocote: inyectar hooks de prompt via recursos estáticos bundleados.
    //
    // Técnica para zsh:  apuntar ZDOTDIR a resources/shell/ (contiene .zshenv + .zshrc).
    //                    El .zshrc sourcea primero la config del usuario, luego instala
    //                    los hooks de OSC 6731 (datos para el renderer) y el PS1.
    //
    // Técnica para bash: bash ignora ZDOTDIR; se usa --rcfile apuntando a bash-hook.bash.
    //
    // Fail-safe: si resolve_shell_resources() devuelve None (recurso no encontrado),
    //            el usuario obtiene su shell normal sin modificaciones.
    #[cfg(not(target_os = "windows"))]
    {
        let preset = prompt.as_deref().unwrap_or("pill").to_string();
        let accent_val = accent.as_deref().unwrap_or("E8843A").to_string();

        // Variables comunes a zsh y bash
        // OCOTE_PROMPT_PRESET — el preset elegido (pill/block/minimal/ribbon/rail/passthrough)
        // OCOTE_ACCENT        — hex del accent sin # (para colorear ❯ en el preset minimal)
        cmd.env("OCOTE_PROMPT_PRESET", &preset);
        cmd.env("OCOTE_ACCENT", &accent_val);

        if let Some(res) = resolve_shell_resources(&window) {
            // ZDOTDIR real del usuario (o $HOME) para que .zshrc pueda sourcearlo
            let real_zdotdir = std::env::var("ZDOTDIR")
                .unwrap_or_else(|_| std::env::var("HOME").unwrap_or_default());
            cmd.env("_OCOTE_ZDOTDIR", real_zdotdir);

            // OCOTE_ZSH_HL — path al zsh-syntax-highlighting.zsh (o vacío si no existe)
            if let Some(hl) = &res.zsh_hl {
                cmd.env("OCOTE_ZSH_HL", hl.to_string_lossy().to_string());
            }

            if shell_cmd.contains("zsh") {
                // zsh: apuntar ZDOTDIR a nuestro directorio con los hooks estáticos
                cmd.env("ZDOTDIR", res.shell_dir.to_string_lossy().to_string());

            } else if shell_cmd.contains("bash") {
                // bash: no tiene ZDOTDIR; usar --rcfile apuntando al hook de bash
                if let Some(bash_hook) = &res.bash_hook {
                    cmd.arg("--rcfile");
                    cmd.arg(bash_hook.to_string_lossy().to_string());
                }
            }
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
    // Sin tamaño ni preset → fallback 24×80 y prompt "git".
    create_shell(window, state, None, None, None, None)?;
    Ok(())
}
