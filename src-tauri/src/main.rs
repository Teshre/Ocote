// main.rs — Punto de entrada de la aplicación Tauri
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod pty;
mod vt_parser;
mod ckb;
mod fs_explorer;
mod context;

fn main() {
    tauri::Builder::default()
        .manage(pty::PtyState::new())
        .manage(ckb::CkbState::new().expect("error al inicializar CKB"))
        .invoke_handler(tauri::generate_handler![
            // Fase 1 — activos
            pty::spawn_shell,
            pty::write_to_shell,
            pty::resize_pty,
            // Fase 2 — activos
            fs_explorer::list_directory,
            fs_explorer::get_home_directory,
            ckb::get_suggestions,
            ckb::get_command_info,
            pty::get_shell_cwd,
            // Fase 3 — activos
            context::detect_context,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Ocote");
}
