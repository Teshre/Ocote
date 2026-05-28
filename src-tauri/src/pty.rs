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

/// Crea un ZDOTDIR temporal con wrappers .zshenv/.zshrc que:
///  1. cargan la config real del usuario (aliases, PATH, funciones),
///  2. cargan el prompt nativo de Ocote (si el preset != "mine"),
///  3. cargan zsh-syntax-highlighting al final (orden correcto).
/// Devuelve el path del ZDOTDIR, o None si no se pudo preparar.
#[cfg(not(target_os = "windows"))]
fn setup_zsh_env(window: &tauri::Window, prompt: &str) -> Option<String> {
    let hl_script = resolve_resource(
        window,
        "resources/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
    )?;
    // El prompt es opcional: si no se resuelve, el wrapper simplemente no lo carga.
    let prompt_script = resolve_resource(window, "resources/ocote-prompt/prompt.zsh")
        .map(|p| p.display().to_string())
        .unwrap_or_default();

    let zdotdir = std::env::temp_dir().join("ocote-zdotdir");
    std::fs::create_dir_all(&zdotdir).ok()?;

    // .zshenv: delegar al del usuario + desactivar instant prompt de p10k cuando
    // Ocote controla el prompt (evita el flash/fantasma del instant prompt).
    let zshenv = format!(
        "# Ocote ZDOTDIR wrapper — generado automáticamente.\n\
         [[ -f \"${{_OCOTE_ZDOTDIR}}/.zshenv\" ]] && source \"${{_OCOTE_ZDOTDIR}}/.zshenv\"\n\
         [[ -n \"$_OCOTE_PROMPT\" && \"$_OCOTE_PROMPT\" != \"mine\" ]] && export POWERLEVEL9K_INSTANT_PROMPT=off\n"
    );
    std::fs::write(zdotdir.join(".zshenv"), zshenv).ok()?;

    // .zshrc: restaurar ZDOTDIR → config del usuario → prompt Ocote → highlighting.
    let zshrc = format!(
        "# Ocote ZDOTDIR wrapper — generado automáticamente.\n\
         ZDOTDIR=\"${{_OCOTE_ZDOTDIR}}\"\n\
         [[ -f \"${{_OCOTE_ZDOTDIR}}/.zshrc\" ]] && source \"${{_OCOTE_ZDOTDIR}}/.zshrc\"\n\
         # Prompt nativo de Ocote (no hace nada si _OCOTE_PROMPT es \"mine\").\n\
         [[ -f \"{prompt}\" ]] && source \"{prompt}\"\n\
         # Syntax highlighting al final (después de oh-my-zsh y autosuggestions).\n\
         ZSH_HIGHLIGHT_HIGHLIGHTERS=(main brackets)\n\
         [[ -f \"{hl}\" ]] && source \"{hl}\"\n",
        prompt = prompt_script,
        hl = hl_script.display()
    );
    std::fs::write(zdotdir.join(".zshrc"), zshrc).ok()?;

    // prompt param actualmente solo decide el comportamiento vía _OCOTE_PROMPT
    // (lo pasa create_shell); aquí solo dejamos el wrapper listo.
    let _ = prompt;
    Some(zdotdir.to_string_lossy().to_string())
}

/// Crea un rcfile temporal para bash que carga el ~/.bashrc del usuario y luego
/// el prompt nativo de Ocote. Se pasa a bash con `--rcfile`. Devuelve su path.
#[cfg(not(target_os = "windows"))]
fn setup_bash_rcfile(window: &tauri::Window) -> Option<String> {
    let prompt_script = resolve_resource(window, "resources/ocote-prompt/prompt.bash")?;

    let dir = std::env::temp_dir().join("ocote-bash");
    std::fs::create_dir_all(&dir).ok()?;
    let rcfile = dir.join("bashrc");

    let content = format!(
        "# Ocote bash wrapper — generado automáticamente.\n\
         [[ -f \"$HOME/.bashrc\" ]] && source \"$HOME/.bashrc\"\n\
         # Prompt nativo de Ocote (no hace nada si _OCOTE_PROMPT es \"mine\").\n\
         [[ -f \"{ps}\" ]] && source \"{ps}\"\n",
        ps = prompt_script.display()
    );
    std::fs::write(&rcfile, content).ok()?;
    Some(rcfile.to_string_lossy().to_string())
}

// ── create_shell ──────────────────────────────────────────────────────────

/// Crear una nueva sesión PTY. Devuelve el shell_id asignado.
#[tauri::command]
pub fn create_shell(
    window:  tauri::Window,
    state:   tauri::State<PtyState>,
    rows:    Option<u16>,
    cols:    Option<u16>,
    prompt:  Option<String>,
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

    // Ocote: inyectar prompt nativo + syntax highlighting sin tocar la config
    // del usuario. Preset por defecto "git" (Ocote de fábrica); "mine" respeta
    // el prompt del usuario (p10k, etc.). Todo fail-safe: si algo falla, el
    // usuario obtiene su shell normal.
    #[cfg(not(target_os = "windows"))]
    {
        let prompt_preset = prompt.unwrap_or_else(|| "git".to_string());

        if shell_cmd.contains("zsh") {
            // zsh: técnica ZDOTDIR wrapper.
            if let Some(zdotdir) = setup_zsh_env(&window, &prompt_preset) {
                let real_zdotdir = std::env::var("ZDOTDIR")
                    .unwrap_or_else(|_| std::env::var("HOME").unwrap_or_default());
                cmd.env("_OCOTE_ZDOTDIR", real_zdotdir);
                cmd.env("ZDOTDIR", zdotdir);
                cmd.env("_OCOTE_PROMPT", &prompt_preset);
            }
        } else if shell_cmd.contains("bash") {
            // bash: técnica --rcfile (bash no lee ZDOTDIR).
            if let Some(rcfile) = setup_bash_rcfile(&window) {
                cmd.env("_OCOTE_PROMPT", &prompt_preset);
                cmd.arg("--rcfile");
                cmd.arg(&rcfile);
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
    create_shell(window, state, None, None, None)?;
    Ok(())
}
