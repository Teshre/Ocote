// pty.rs — Manejo del proceso terminal (PTY = Pseudo-Terminal)
//
// Un PTY es una terminal "falsa" que le hace creer a bash/zsh que está
// corriendo en una terminal real. Así capturamos colores y control de cursor,
// tal como los vería el usuario en cualquier terminal normal.
//
// El frontend usa xterm.js, que maneja todas las secuencias VT/ANSI internamente
// (incluyendo zsh-autosuggestions, p10k, bash readline, vim, htop, etc.).
//
// ── Soporte TUI (vim, htop, fzf, etc.) ──────────────────────────────────────
// Los apps TUI necesitan saber exactamente cuántas filas y columnas tiene la
// terminal para dibujar su interfaz (ncurses llama a ioctl(TIOCGWINSZ)).
//
// Problema: el PTY se abre con un tamaño inicial fijo (24×80). Si xterm.js
// ocupa, digamos, 55 filas × 220 columnas, htop igual renderiza en 24 líneas.
//
// Solución: PtyState guarda una referencia al "master" del PTY (el extremo que
// controlamos nosotros). El comando resize_pty() llama a master.resize() con el
// tamaño real de xterm.js. El kernel envía SIGWINCH al proceso hijo, que se
// redibuja con las dimensiones correctas.

use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;

// Estado global de la sesión PTY.
// Tauri lo administra en memoria y lo inyecta automáticamente en los comandos.
pub struct PtyState {
    // El escritor al PTY: por aquí le mandamos input al proceso bash.
    writer: Mutex<Option<Box<dyn Write + Send>>>,

    // El proceso hijo (bash/zsh/cmd.exe).
    // Si este valor se droppea, el proceso recibe SIGKILL.
    child: Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>,

    // PID del proceso shell, usado para leer el CWD actual vía lsof/proc.
    shell_pid: Mutex<Option<u32>>,

    // El lado master del PTY.
    // Lo guardamos para poder llamar master.resize() cuando xterm.js cambie
    // de tamaño. PtyPair.master ya es Box<dyn MasterPty + Send>, así que
    // podemos almacenarlo sin problemas de thread-safety.
    master: Mutex<Option<Box<dyn MasterPty + Send>>>,
}

impl PtyState {
    pub fn new() -> Self {
        PtyState {
            writer:    Mutex::new(None),
            child:     Mutex::new(None),
            shell_pid: Mutex::new(None),
            master:    Mutex::new(None),
        }
    }
}

// ── spawn_shell ───────────────────────────────────────────────────────────────

// Comando Tauri: el frontend lo llama UNA VEZ al iniciar la app.
// Spawna bash y lanza el thread lector de output.
#[tauri::command]
pub fn spawn_shell(
    window: tauri::Window,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    let pty_system = native_pty_system();

    // Abrir el par (master, slave) con tamaño inicial 24×80.
    // El frontend enviará resize_pty() inmediatamente después con el tamaño real.
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,
            cols: 80,
            pixel_width: 0,
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // Detectar la shell del usuario.
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

    // Guardar PID para get_shell_cwd()
    #[cfg(unix)]
    {
        if let Some(pid) = child.process_id() {
            *state.shell_pid.lock().unwrap() = Some(pid);
        }
    }

    *state.child.lock().unwrap() = Some(child);

    // Extraer reader y writer del master.
    // try_clone_reader() duplica el FD — el reader es independiente del master.
    // take_writer() mueve el escritor fuera, pero el master sigue siendo válido
    // para llamar resize() después.
    let mut reader = pair.master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master
        .take_writer()
        .map_err(|e| e.to_string())?;

    *state.writer.lock().unwrap() = Some(writer);

    // Guardar el master para poder redimensionar el PTY desde resize_pty().
    // pair.master es Box<dyn MasterPty + Send>, así que podemos moverlo aquí.
    *state.master.lock().unwrap() = Some(pair.master);

    // Thread lector: corre indefinidamente en background.
    // Lee el output de bash y lo emite como evento Tauri al frontend.
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

// ── write_to_shell ────────────────────────────────────────────────────────────

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

// ── resize_pty ────────────────────────────────────────────────────────────────

// Comando Tauri: el frontend lo llama cada vez que xterm.js cambia de tamaño.
//
// Flujo completo:
//   1. fitAddon.fit() calcula cuántas filas/cols caben en el contenedor HTML
//   2. xterm.js dispara el evento onResize con { rows, cols }
//   3. terminal.js llama invoke('resize_pty', { rows, cols })
//   4. Este comando llama master.resize() → el kernel actualiza TIOCGWINSZ
//   5. El kernel envía SIGWINCH al proceso hijo (bash/vim/htop)
//   6. El proceso TUI llama ioctl(TIOCGWINSZ) de nuevo → recibe las nuevas dims
//   7. El proceso se redibuja con el tamaño correcto
//
// Sin este paso, vim siempre renderizaría en 24 líneas aunque xterm.js tenga 55.
#[tauri::command]
pub fn resize_pty(
    rows: u16,
    cols: u16,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    let guard = state.master.lock().unwrap();
    if let Some(master) = guard.as_ref() {
        master.resize(PtySize {
            rows,
            cols,
            pixel_width: 0,
            pixel_height: 0,
        }).map_err(|e| e.to_string())?;
    }
    Ok(())
}

// ── get_shell_cwd ─────────────────────────────────────────────────────────────

/// Obtener el directorio de trabajo actual (CWD) del proceso shell.
/// Usado para sincronizar el explorador de archivos con la terminal.
#[tauri::command]
pub fn get_shell_cwd(state: tauri::State<PtyState>) -> Result<String, String> {
    let pid_guard = state.shell_pid.lock().unwrap();
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
