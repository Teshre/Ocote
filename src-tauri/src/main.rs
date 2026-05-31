// main.rs — Punto de entrada de la aplicación Tauri
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Manager expone get_window() en AppHandle — necesario para cambiar el ícono
use tauri::Manager;

mod pty;
mod vt_parser;
mod ckb;
mod fs_explorer;
mod context;

/// Cambia el ícono de la ventana/dock en runtime.
/// `variant` puede ser "light" o "dark".
/// Los archivos PNG están en src-tauri/resources/icons/ y se bundlean con la app.
#[tauri::command]
fn set_app_icon(app: tauri::AppHandle, variant: String) -> Result<(), String> {
    let icon_file = match variant.as_str() {
        "light" => "icon-light.png",
        "dark"  => "icon-dark.png",
        other   => return Err(format!("Variante de ícono inválida: {}", other)),
    };

    let path = app
        .path_resolver()
        .resolve_resource(format!("resources/icons/{}", icon_file))
        .ok_or_else(|| format!("Ícono '{}' no encontrado en recursos", icon_file))?;

    // Leer los bytes del PNG y pasarlos como Icon::Raw.
    // Icon::Raw requiere el feature "icon-png" en Cargo.toml (ya habilitado).
    // En macOS esto llama NSApp.setApplicationIconImage — cambia el dock en runtime.
    let bytes = std::fs::read(&path)
        .map_err(|e| format!("Error al leer ícono '{}': {}", icon_file, e))?;

    app.get_window("main")
        .ok_or_else(|| "Ventana principal no encontrada".to_string())?
        .set_icon(tauri::Icon::Raw(bytes))
        .map_err(|e| format!("Error al aplicar ícono: {}", e))
}

fn main() {
    tauri::Builder::default()
        .manage(pty::PtyState::new())
        .manage(ckb::CkbState::new().expect("error al inicializar CKB"))
        .invoke_handler(tauri::generate_handler![
            // PTY — múltiples shells
            pty::create_shell,
            pty::write_to_shell,
            pty::resize_pty,
            pty::get_shell_cwd,
            pty::close_shell,
            pty::list_shells,
            // Backward compat
            pty::spawn_shell,
            // Fase 2 — activos
            fs_explorer::list_directory,
            fs_explorer::get_home_directory,
            ckb::get_suggestions,
            ckb::get_command_info,
            // Fase 3 — activos
            context::detect_context,
            // Settings
            set_app_icon,
        ])
        .run(tauri::generate_context!())
        .expect("error al iniciar Ocote");
}
