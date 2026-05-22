// pty.rs — Manejo del proceso terminal (PTY = Pseudo-Terminal)
//
// Un PTY es una terminal "falsa" que le hace creer a bash/zsh que está
// corriendo en una terminal real. Así capturamos colores y control de cursor,
// tal como los vería el usuario en cualquier terminal normal.
//
// El frontend usa xterm.js, que maneja todas las secuencias VT/ANSI internamente
// (incluyendo zsh-autosuggestions, p10k, bash readline, vim, htop, etc.).

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;

// Estado global de la sesión PTY.
pub struct PtyState {
    writer: Mutex<Option<Box<dyn Write + Send>>>,
    child:  Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>,
    // PID del proceso shell (zsh/bash), usado para obtener el CWD actual
    shell_pid: Mutex<Option<u32>>,
}

impl PtyState {
    pub fn new() -> Self {
        PtyState {
            writer: Mutex::new(None),
            child:  Mutex::new(None),
            shell_pid: Mutex::new(None),
        }
    }
}

#[tauri::command]
pub fn spawn_shell(
    window: tauri::Window,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Detectar shell del usuario.
    #[cfg(target_os = "windows")]
    let shell = "cmd.exe".to_string();
    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL")
        .unwrap_or_else(|_| "/bin/bash".to_string());

    let mut cmd = CommandBuilder::new(&shell);
    cmd.env("TERM", "xterm-256color");
    cmd.env("COLORTERM", "truecolor");
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    let child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Guardar el PID del proceso shell para poder obtener su CWD después
    #[cfg(unix)]
    {
        use portable_pty::Child;
        if let Some(pid) = child.process_id() {
            *state.shell_pid.lock().unwrap() = Some(pid);
        }
    }

    *state.child.lock().unwrap() = Some(child);

    let mut reader = pair.master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master
        .take_writer()
        .map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);

    std::thread::spawn(move || {
        let mut buf = [0u8; 4096];
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    window.emit("pty-exit", ()).ok();
                    break;
                }
                Ok(n) => {
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    window.emit("pty-output", output).ok();
                }
                Err(_) => break,
            }
        }
    });

    Ok(())
}

#[tauri::command]
pub fn write_to_shell(
    input: String,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    let mut guard = state.writer.lock().unwrap();
    if let Some(writer) = guard.as_mut() {
        writer.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// Obtener el directorio de trabajo actual (CWD) del proceso shell.
///
/// Usado para sincronizar el explorador de archivos con la terminal
/// cuando el usuario hace `cd` manualmente en la shell.
#[tauri::command]
pub fn get_shell_cwd(state: tauri::State<PtyState>) -> Result<String, String> {
    let pid_guard = state.shell_pid.lock().unwrap();
    let pid = pid_guard.ok_or("No hay shell activa")?;

    #[cfg(target_os = "macos")]
    {
        // macOS: usar lsof para obtener el CWD del proceso
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
        // Linux: leer el symlink /proc/<pid>/cwd
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
