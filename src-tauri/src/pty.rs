// pty.rs — Manejo del proceso terminal (PTY = Pseudo-Terminal)
//
// Un PTY es una terminal "falsa" que le hace creer a bash/zsh que está
// corriendo en una terminal real. Así capturamos colores y control de cursor,
// tal como los vería el usuario en cualquier terminal normal.

use portable_pty::{native_pty_system, CommandBuilder, PtySize};
use std::io::{Read, Write};
use std::sync::Mutex;

// Estado global de la sesión PTY.
// Tauri lo administra en memoria y lo inyecta automáticamente en los comandos.
pub struct PtyState {
    // El escritor al PTY: por aquí le mandamos input al proceso bash.
    // Mutex<Option<...>> porque:
    //   - Mutex: puede ser accedido desde múltiples threads de forma segura
    //   - Option: empieza en None (ninguna shell activa), se llena al spawnear
    writer: Mutex<Option<Box<dyn Write + Send>>>,

    // El proceso hijo (bash/zsh/cmd.exe).
    // IMPORTANTE: si este valor se droppea, el proceso recibe SIGKILL.
    // Lo guardamos aquí solo para mantenerlo vivo, nunca lo leemos.
    child: Mutex<Option<Box<dyn portable_pty::Child + Send + Sync>>>,
}

impl PtyState {
    pub fn new() -> Self {
        PtyState {
            writer: Mutex::new(None),
            child:  Mutex::new(None),
        }
    }
}

// Comando Tauri: el frontend lo llama UNA VEZ al iniciar la app.
// Spawna bash y lanza el thread lector de output.
#[tauri::command]
pub fn spawn_shell(
    window: tauri::Window,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    // 1. Obtener el sistema PTY nativo del SO.
    //    macOS/Linux → openpty() | Windows → ConPTY
    let pty_system = native_pty_system();

    // 2. Abrir el par (master, slave).
    //    slave = el lado del proceso bash (lo que bash "ve" como su terminal)
    //    master = el lado que nosotros controlamos (leer output, escribir input)
    let pair = pty_system
        .openpty(PtySize {
            rows: 24,        // filas iniciales de la terminal
            cols: 80,        // columnas iniciales
            pixel_width: 0,  // sin información de píxeles (no la necesitamos)
            pixel_height: 0,
        })
        .map_err(|e| e.to_string())?;

    // 3. Detectar la shell del usuario.
    //    En macOS/Linux leemos $SHELL. Si no existe, usamos /bin/bash.
    //    En Windows usamos cmd.exe.
    #[cfg(target_os = "windows")]
    let shell = "cmd.exe".to_string();
    #[cfg(not(target_os = "windows"))]
    let shell = std::env::var("SHELL")
        .unwrap_or_else(|_| "/bin/bash".to_string());

    // 4. Configurar y spawnear la shell dentro del slave PTY.
    let mut cmd = CommandBuilder::new(&shell);
    // TERM le dice a la shell qué capacidades tiene la terminal.
    cmd.env("TERM", "xterm-256color");
    // COLORTERM indica soporte de 24-bit color (true color)
    cmd.env("COLORTERM", "truecolor");
    // Locale UTF-8: evita que herramientas como eza URL-encoden nombres con acentos
    cmd.env("LANG", "en_US.UTF-8");
    cmd.env("LC_ALL", "en_US.UTF-8");

    // zsh-autosuggestions escribe la sugerencia en el mismo stream de output
    // que el texto tipado. Sin un screen buffer real no podemos distinguirlos:
    // al escribir "c" se veía "ccd Obsidian" (texto real + sugerencia mezclados).
    // Fix: color fg=0 = #1a1a1a = igual al fondo → sugerencias invisibles.
    // El mecanismo ZLE sigue activo: Tab y → aceptan la sugerencia correctamente.
    cmd.env("ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE", "fg=0");
    // Fish shell usa una variable distinta para el mismo efecto.
    cmd.env("fish_color_autosuggestion", "000000");

    let child = pair.slave
        .spawn_command(cmd)
        .map_err(|e| e.to_string())?;

    // Guardamos el proceso hijo para que no muera al salir de esta función.
    // pair.slave se droppea aquí — bash ya tiene sus propios file descriptors.
    *state.child.lock().unwrap() = Some(child);

    // 5. Extraer lector y escritor del lado master.
    //    try_clone_reader() duplica el FD → el reader es independiente del master
    //    take_writer() mueve el escritor fuera del master
    let mut reader = pair.master
        .try_clone_reader()
        .map_err(|e| e.to_string())?;
    let writer = pair.master
        .take_writer()
        .map_err(|e| e.to_string())?;

    // 6. Guardar el escritor en el estado global.
    //    write_to_shell lo usará cada vez que el usuario presione Enter.
    *state.writer.lock().unwrap() = Some(writer);

    // 7. Thread lector: corre indefinidamente en background.
    //    Lee el output de bash y lo emite como evento Tauri al frontend.
    //    `move` transfiere la propiedad de `reader` y `window` al thread.
    std::thread::spawn(move || {
        let mut buf = [0u8; 4096]; // buffer de lectura: 4 KB por chunk
        loop {
            match reader.read(&mut buf) {
                Ok(0) => {
                    // EOF: bash terminó (el usuario escribió 'exit' o cerró la sesión)
                    window.emit("pty-exit", ()).ok();
                    break;
                }
                Ok(n) => {
                    // Convertir los bytes leídos a String.
                    // from_utf8_lossy reemplaza bytes inválidos con U+FFFD en vez de fallar.
                    let output = String::from_utf8_lossy(&buf[..n]).to_string();
                    window.emit("pty-output", output).ok();
                }
                Err(_) => break, // error de lectura: salir del loop limpiamente
            }
        }
    });

    Ok(())
}

// Comando Tauri: el frontend lo llama cada vez que el usuario presiona Enter
// (o Ctrl+C, o cualquier tecla de control).
#[tauri::command]
pub fn write_to_shell(
    input: String,
    state: tauri::State<PtyState>,
) -> Result<(), String> {
    let mut guard = state.writer.lock().unwrap();
    if let Some(writer) = guard.as_mut() {
        // Escribir los bytes al stdin del proceso bash
        writer.write_all(input.as_bytes()).map_err(|e| e.to_string())?;
        // flush() garantiza que los bytes lleguen inmediatamente (sin buffering)
        writer.flush().map_err(|e| e.to_string())?;
    }
    Ok(())
}
