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
use std::path::{Path, PathBuf};
use std::sync::Mutex;
// Manager se necesita en todas las plataformas para resolve_resource + set_icon
use tauri::Manager;
use unicode_normalization::UnicodeNormalization;

// ── Estado de un shell individual ────────────────────────────────────────

struct ShellState {
    writer:    Mutex<Option<Box<dyn Write + Send>>>,
    child:     Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>,
    shell_pid: Mutex<Option<u32>>,
    master:    Mutex<Option<Box<dyn MasterPty + Send>>>,
    /// CWD (directorio de trabajo) del shell. Es la autoridad para validar
    /// que las operaciones de archivos (preview, search, create, delete) se
    /// hagan DENTRO de este directorio. Se actualiza desde el frontend cada
    /// vez que llega un OSC 6731 con un cwd nuevo.
    /// Si es None, el shell no ha reportado cwd todavía y las operaciones
    /// de archivo se rechazan.
    cwd:       Mutex<Option<PathBuf>>,
}

impl ShellState {
    fn new() -> Self {
        ShellState {
            writer:    Mutex::new(None),
            child:     Mutex::new(None),
            shell_pid: Mutex::new(None),
            master:    Mutex::new(None),
            cwd:       Mutex::new(None),
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

/// Ruta (relativa a src-tauri/) del binario fzf según plataforma y arquitectura.
/// El binario se llama literalmente `fzf` (o `fzf.exe`) dentro de un subdir por
/// plataforma, para que al añadir ese dir al PATH `fzf` sea un comando real —
/// requisito de la integración de fish (`command -q fzf`) y más limpio en todas.
/// Devuelve cadena vacía si la combinación no está soportada.
fn fzf_binary_name() -> &'static str {
    match (std::env::consts::OS, std::env::consts::ARCH) {
        ("macos",   "aarch64") => "resources/bin/darwin-arm64/fzf",
        ("macos",   "x86_64")  => "resources/bin/darwin-x64/fzf",
        ("linux",   "x86_64")  => "resources/bin/linux-x64/fzf",
        ("linux",   "aarch64") => "resources/bin/linux-arm64/fzf",
        ("windows", "x86_64")  => "resources/bin/win-x64/fzf.exe",
        _ => "",
    }
}

/// Información de rutas de recursos bundleados de Ocote para inyectar al shell.
/// Los archivos son ESTÁTICOS (no se generan en runtime) — Tauri los bundlea.
struct ShellResources {
    shell_dir:       std::path::PathBuf,
    zsh_hook:        Option<std::path::PathBuf>,
    zsh_hl:          Option<std::path::PathBuf>,
    bash_hook:       Option<std::path::PathBuf>,
    /// Hook de prompt para fish (prompt.fish).
    fish_hook:       Option<std::path::PathBuf>,
    /// Hook de prompt para PowerShell (prompt.ps1).
    ps1_hook:        Option<std::path::PathBuf>,
    /// Binario de fzf para la plataforma actual.
    fzf_bin:         Option<std::path::PathBuf>,
    /// Plugin zsh-autosuggestions (archivo .zsh principal).
    zsh_autosuggest: Option<std::path::PathBuf>,
}

/// Resuelve los recursos bundleados de shell. Devuelve None si el directorio
/// principal (resources/shell) no existe — caso de degradación segura.
fn resolve_shell_resources(window: &tauri::Window) -> Option<ShellResources> {
    let shell_dir = resolve_resource(window, "resources/shell")?;
    let zsh_hook  = resolve_resource(window, "resources/shell/prompt.zsh");
    let zsh_hl    = resolve_resource(
        window, "resources/zsh-syntax-highlighting/zsh-syntax-highlighting.zsh",
    );
    let bash_hook = resolve_resource(window, "resources/shell/bash-hook.bash");
    let fish_hook = resolve_resource(window, "resources/shell/prompt.fish");
    let ps1_hook  = resolve_resource(window, "resources/shell/prompt.ps1");

    // fzf: seleccionar el binario correcto para esta plataforma/arquitectura
    let fzf_name = fzf_binary_name();
    let fzf_bin  = if fzf_name.is_empty() {
        None
    } else {
        resolve_resource(window, fzf_name)
    };

    // zsh-autosuggestions: el archivo principal (no el .plugin.zsh)
    let zsh_autosuggest = resolve_resource(
        window, "resources/zsh-autosuggestions/zsh-autosuggestions.zsh",
    );

    Some(ShellResources { shell_dir, zsh_hook, zsh_hl, bash_hook, fish_hook, ps1_hook, fzf_bin, zsh_autosuggest })
}

/// Windows: elige el shell. Prefiere PowerShell 7 (pwsh) si está instalado;
/// si no, Windows PowerShell 5.1 (powershell.exe, siempre presente en Win10+).
/// Ambos cargan nuestro prompt.ps1; pwsh tiene mejores autosuggestions (PSReadLine).
#[cfg(target_os = "windows")]
fn windows_shell() -> String {
    use std::process::Command;
    // Probar pwsh: si responde, usarlo. Output rápido y silencioso.
    let pwsh_ok = Command::new("pwsh")
        .arg("-NoProfile").arg("-Command").arg("exit")
        .output()
        .is_ok();
    if pwsh_ok { "pwsh.exe".to_string() } else { "powershell.exe".to_string() }
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
    let shell_cmd = windows_shell();   // pwsh.exe si existe, si no powershell.exe
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
    // Unix (zsh): ZDOTDIR → resources/shell/ (.zshenv + .zshrc bootstrap)
    // Unix (bash): --rcfile → bash-hook.bash
    // Windows (cmd/PowerShell): inyectar OCOTE_FZF_BIN al PATH para uso manual;
    //   el prompt completo se implementará en una futura actualización.
    //
    // Fail-safe: si resolve_shell_resources() devuelve None, el shell arranca normal.
    {
        let preset = prompt.as_deref().unwrap_or("pill").to_string();
        let accent_val = accent.as_deref().unwrap_or("E8843A").to_string();

        cmd.env("OCOTE_PROMPT_PRESET", &preset);
        cmd.env("OCOTE_ACCENT", &accent_val);

        // Aliases del editor de Ocote: apuntar al archivo generado del shell
        // correspondiente (ver aliases.rs). Las configs bundleadas lo sourcean.
        if let Some(data_dir) = window.app_handle().path_resolver().app_data_dir() {
            let alias_file = if shell_cmd.contains("fish") {
                "aliases.fish"
            } else if shell_cmd.contains("pwsh") || shell_cmd.contains("powershell") {
                "aliases.ps1"
            } else {
                "aliases.sh" // zsh + bash
            };
            let p = data_dir.join(alias_file);
            cmd.env("OCOTE_ALIASES", p.to_string_lossy().to_string());
        }

        if let Some(res) = resolve_shell_resources(&window) {
            // fzf: disponible en macOS, Linux y Windows.
            // El binario se llama `fzf` dentro de un subdir por plataforma.
            // Añadimos ese dir al PATH para que `fzf` sea un comando real en
            // TODAS las shells (requisito de la integración de fish, que valida
            // `command -q fzf`; y más limpio que la función wrapper anterior).
            // El dir de la plataforma contiene fzf, zoxide y bat. Añadirlo al PATH
            // hace que los 3 sean comandos reales en todas las shells.
            if let Some(fzf) = &res.fzf_bin {
                cmd.env("OCOTE_FZF_BIN", fzf.to_string_lossy().to_string());
                if let Some(dir) = fzf.parent() {
                    cmd.env("OCOTE_BIN_DIR", dir.to_string_lossy().to_string());
                    let cur = std::env::var("PATH").unwrap_or_default();
                    #[cfg(target_os = "windows")]
                    let sep = ";";
                    #[cfg(not(target_os = "windows"))]
                    let sep = ":";
                    cmd.env("PATH", format!("{}{}{}", dir.to_string_lossy(), sep, cur));
                }
            }

            // PowerShell — aplica en Windows (shell por defecto) y en unix si el
            // usuario puso SHELL=pwsh. -NoExit -Command corre tras los $PROFILE
            // del usuario → nuestra función prompt y keybindings ganan.
            if shell_cmd.contains("pwsh") || shell_cmd.contains("powershell") {
                if let Some(ps1) = &res.ps1_hook {
                    cmd.arg("-NoExit");
                    cmd.arg("-Command");
                    cmd.arg(format!(". '{}'", ps1.to_string_lossy()));
                }
            }

            // Integraciones Unix-only (zsh/bash hooks, syntax highlighting, autosuggestions)
            #[cfg(not(target_os = "windows"))]
            {
                let real_zdotdir = std::env::var("ZDOTDIR")
                    .unwrap_or_else(|_| std::env::var("HOME").unwrap_or_default());
                cmd.env("_OCOTE_ZDOTDIR", real_zdotdir);

                if let Some(hook) = &res.zsh_hook {
                    cmd.env("OCOTE_PROMPT_HOOK", hook.to_string_lossy().to_string());
                }
                if let Some(hl) = &res.zsh_hl {
                    cmd.env("OCOTE_ZSH_HL", hl.to_string_lossy().to_string());
                }
                if let Some(autosuggest) = &res.zsh_autosuggest {
                    cmd.env("OCOTE_ZSH_AUTOSUGGEST", autosuggest.to_string_lossy().to_string());
                }

                if shell_cmd.contains("zsh") {
                    cmd.env("ZDOTDIR", res.shell_dir.to_string_lossy().to_string());
                } else if shell_cmd.contains("bash") {
                    if let Some(bash_hook) = &res.bash_hook {
                        cmd.arg("--rcfile");
                        cmd.arg(bash_hook.to_string_lossy().to_string());
                    }
                } else if shell_cmd.contains("fish") {
                    // fish no tiene --rcfile. Usamos -C "source <hook>", que corre
                    // DESPUÉS de config.fish del usuario → nuestro fish_prompt gana.
                    if let Some(fish_hook) = &res.fish_hook {
                        cmd.arg("-C");
                        cmd.arg(format!("source '{}'", fish_hook.to_string_lossy()));
                    }
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

    // Inicializar el cwd en HOME hasta que llegue el primer OSC 6731. Esto da
    // una base razonable: si el usuario hace algo en el explorador antes del
    // primer prompt, las operaciones estarán restringidas a su HOME (no a /).
    *shell.cwd.lock().unwrap() = std::env::home_dir();

    // Clonar shell_id para el thread
    let sid = shell_id.clone();
    let sid_exit = shell_id.clone();

    // Thread lector
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        let mut first_error: Option<std::io::Error> = None;
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF normal: el shell terminó (exit, Ctrl+D, etc.).
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
                Err(e) => {
                    // Error I/O del PTY. En algunas plataformas (macOS) la primera
                    // lectura puede fallar con EAGAIN antes de que el shell escriba
                    // algo; solo rompemos el loop si ya recibimos datos previos.
                    // Si nunca recibimos nada, también salimos (no tiene sentido
                    // quedarse en un loop con errores).
                    eprintln!("[pty] error de lectura: {}", e);
                    first_error = Some(e);
                    break;
                }
            }
        }
        // Si salimos por error (no por EOF), notificar al frontend con un evento
        // distinto para que pueda mostrar un mensaje en vez de un cierre silencioso.
        if let Some(err) = first_error {
            window.emit("pty-error", PtyExit {
                shell_id: sid_exit.clone(),
            }).ok();
            eprintln!("[pty] shell {} terminó por error I/O: {}", sid_exit, err);
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
        // BUG de acentos en producción: lsof bajo locale C escapa los bytes
        // no-ASCII como TEXTO literal `\xNN` (p. ej. "Café" → "Caf\xc3\xa9").
        // El .app lanzado desde Finder no hereda LANG (locale C), mientras que
        // en dev (lanzado desde terminal) sí — por eso solo fallaba empaquetado.
        // Fix doble: (1) forzar locale UTF-8 al proceso lsof, (2) decodificar
        // los escapes `\xNN` por si el locale no estuviera disponible.
        let output = std::process::Command::new("lsof")
            .args(&["-a", "-p", &pid.to_string(), "-d", "cwd", "-Fn"])
            .env("LC_ALL", "en_US.UTF-8")
            .env("LANG", "en_US.UTF-8")
            .output()
            .map_err(|e| format!("Error ejecutando lsof: {}", e))?;

        let text = String::from_utf8_lossy(&output.stdout);
        for line in text.lines() {
            if let Some(raw) = line.strip_prefix('n') {
                return Ok(decode_lsof_escapes(raw));
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

/// Decodifica los escapes `\xNN` que lsof produce bajo locale C de vuelta a
/// bytes reales, y `\\` a backslash. Si no hay escapes, devuelve el str igual.
///
/// Ejemplo: "Caf\xc3\xa9 Divergente" (18 chars ASCII) → "Café Divergente".
/// Los pares \xNN se acumulan como bytes y se reinterpretan como UTF-8 al
/// final (un é son DOS bytes escapados: \xc3\xa9).
#[cfg(target_os = "macos")]
fn decode_lsof_escapes(s: &str) -> String {
    if !s.contains('\\') {
        return s.to_string();
    }
    let b = s.as_bytes();
    let mut out: Vec<u8> = Vec::with_capacity(b.len());
    let mut i = 0;
    while i < b.len() {
        if b[i] == b'\\' && i + 3 < b.len() && b[i + 1] == b'x'
            && b[i + 2].is_ascii_hexdigit() && b[i + 3].is_ascii_hexdigit()
        {
            let hi = (b[i + 2] as char).to_digit(16).unwrap() as u8;
            let lo = (b[i + 3] as char).to_digit(16).unwrap() as u8;
            out.push(hi * 16 + lo);
            i += 4;
        } else if b[i] == b'\\' && i + 1 < b.len() && b[i + 1] == b'\\' {
            out.push(b'\\');
            i += 2;
        } else {
            out.push(b[i]);
            i += 1;
        }
    }
    String::from_utf8_lossy(&out).to_string()
}

#[cfg(all(test, target_os = "macos"))]
mod lsof_escape_tests {
    use super::decode_lsof_escapes;

    #[test]
    fn decodifica_nfc() {
        // "Café" NFC: é = \xc3\xa9
        assert_eq!(
            decode_lsof_escapes(r"/Users/acala/Caf\xc3\xa9 Divergente-Hub"),
            "/Users/acala/Café Divergente-Hub"
        );
    }

    #[test]
    fn decodifica_nfd() {
        // "Café" NFD: e + acento combinante U+0301 = e\xcc\x81.
        // El decode restaura los bytes EXACTOS (forma NFD) — la tolerancia de
        // normalización la maneja después resolve_existing en fs_explorer.
        assert_eq!(
            decode_lsof_escapes(r"/Users/acala/Cafe\xcc\x81 Divergente"),
            "/Users/acala/Cafe\u{0301} Divergente"
        );
    }

    #[test]
    fn sin_escapes_queda_igual() {
        assert_eq!(decode_lsof_escapes("/Users/acala/normal"), "/Users/acala/normal");
        assert_eq!(decode_lsof_escapes("/Users/acala/Café"), "/Users/acala/Café");
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

// ── CWD tracking (autoridad para validación de paths) ──────────────────────

/// Devuelve el cwd registrado de un shell, o None si el shell no existe o
/// nunca reportó su cwd. Usado por `fs_explorer.rs` para validar que las
/// operaciones de archivo se hagan dentro del directorio del shell.
pub fn get_shell_cwd_inner(state: &tauri::State<PtyState>, shell_id: &str) -> Option<PathBuf> {
    let shells = state.shells.lock().ok()?;
    let shell  = shells.get(shell_id)?;
    let cwd_guard = shell.cwd.lock().ok()?;
    cwd_guard.clone()
}

/// Expande un `~` o `~/...` al directorio HOME del usuario. El shell envía
/// `~` literal como cwd (porque `print -P '%~'` lo abrevía), pero canónicalizar
/// un `~` literal falla con "No such file or directory".
fn expand_home(p: &Path) -> PathBuf {
    let s = p.to_string_lossy();
    if s == "~" {
        if let Some(home) = std::env::home_dir() {
            return home;
        }
    } else if let Some(rest) = s.strip_prefix("~/") {
        if let Some(home) = std::env::home_dir() {
            return home.join(rest);
        }
    } else if let Some(rest) = s.strip_prefix("~") {
        // ~/user/foo o similar — ignorar, no es un caso soportado en macOS.
    }
    p.to_path_buf()
}

/// Comando Tauri: actualizar el cwd registrado de un shell.
/// El frontend llama esto desde el handler de OSC 6731 cada vez que el shell
/// emite un cwd nuevo. Es PISTA (no autoridad): si el shell nunca emite
/// OSC 6731, el cwd queda en None y las operaciones se rechazan.
#[tauri::command]
pub fn set_shell_cwd(
    shell_id: String,
    cwd:      String,
    state:    tauri::State<PtyState>,
) -> Result<(), String> {
    let shells = state.shells.lock().unwrap();
    let shell  = shells.get(&shell_id)
        .ok_or_else(|| format!("Shell {} no encontrado", shell_id))?;

    // Expandir `~` → HOME antes de canónicalizar (el shell emite `~` literal
    // por `print -P '%~'` y canónicalizar un `~` falla con ENOENT).
    let expanded = expand_home(Path::new(&cwd));
    // Canonicalizar resuelve symlinks. Si falla (path no existe), guardar la
    // ruta tal cual — la validación happens en fs_explorer.rs al usar el path.
    let resolved = expanded.canonicalize().unwrap_or(expanded);
    // Normalizar a NFC para que coincida con la normalización en fs_explorer.rs
    let normalized: PathBuf = resolved.to_string_lossy().nfc().collect::<String>().into();

    *shell.cwd.lock().unwrap() = Some(normalized);
    Ok(())
}
