// main.rs — Punto de entrada de la aplicación Tauri
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

// Manager expone get_window() en AppHandle (usado en Win/Linux para set_icon).
// En macOS el ícono se cambia vía objc (set_macos_dock_icon), sin get_window.
#[cfg(not(target_os = "macos"))]
use tauri::Manager;

mod pty;
mod vt_parser;
mod ckb;
mod fs_explorer;
mod context;

/// Cambia el ícono del dock/app en runtime. `variant` = "light" | "dark".
/// Los PNG están en resources/icons/ y se bundlean con la app.
///
/// macOS: `window.set_icon()` de Tauri NO afecta el dock (en macOS no hay
/// íconos por-ventana). Hay que llamar `NSApplication.setApplicationIconImage:`
/// vía objc. Windows/Linux: `set_icon` sí funciona.
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

    #[cfg(target_os = "macos")]
    {
        set_macos_dock_icon(&path)
    }

    #[cfg(not(target_os = "macos"))]
    {
        let bytes = std::fs::read(&path)
            .map_err(|e| format!("Error al leer ícono '{}': {}", icon_file, e))?;
        app.get_window("main")
            .ok_or_else(|| "Ventana principal no encontrada".to_string())?
            .set_icon(tauri::Icon::Raw(bytes))
            .map_err(|e| format!("Error al aplicar ícono: {}", e))
    }
}

/// macOS: setea el ícono del dock vía NSApplication.setApplicationIconImage:.
/// Dura solo la sesión (al reiniciar vuelve al .icns del bundle); el frontend
/// re-aplica la preferencia guardada al arrancar.
#[cfg(target_os = "macos")]
fn set_macos_dock_icon(path: &std::path::Path) -> Result<(), String> {
    use cocoa::base::{id, nil};
    use cocoa::foundation::NSString;
    use objc::{class, msg_send, sel, sel_impl};

    let path_str = path.to_string_lossy();
    unsafe {
        // NSImage *img = [[NSImage alloc] initWithContentsOfFile:path];
        let ns_path: id = NSString::alloc(nil).init_str(&path_str);
        let image: id = msg_send![class!(NSImage), alloc];
        let image: id = msg_send![image, initWithContentsOfFile: ns_path];
        if image == nil {
            return Err(format!("No se pudo cargar la imagen: {}", path_str));
        }
        // [[NSApplication sharedApplication] setApplicationIconImage:img];
        let ns_app: id = msg_send![class!(NSApplication), sharedApplication];
        let _: () = msg_send![ns_app, setApplicationIconImage: image];
    }
    Ok(())
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
