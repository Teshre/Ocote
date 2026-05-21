// main.rs — Punto de entrada de la aplicación Tauri
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;
mod vt_parser;
mod ckb;
mod fs_explorer;
mod context;

fn main() {
    tauri::Builder::default()
        // Registrar el estado global del PTY.
        // Tauri lo inyecta automáticamente en cualquier comando que lo declare
        // en su firma como `state: tauri::State<PtyState>`.
        .manage(pty::PtyState::new())
        .invoke_handler(tauri::generate_handler![
            // Fase 1 — activos
            pty::spawn_shell,
            pty::write_to_shell,
            // Fase 2 — descomentar cuando se implementen
            // ckb::get_suggestions,
            // ckb::get_command_info,
            // fs_explorer::list_directory,
            // Fase 3
            // context::detect_context,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Ocote");
}
