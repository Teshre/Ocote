// workspaces.rs — Persistencia de workspaces (layouts guardados)
//
// Un workspace guarda el layout: pestañas + árbol de paneles + cwd de cada
// panel. El frontend construye y restaura la estructura (conoce tabs/panes);
// Rust solo guarda/lee el JSON, que es OPACO para el backend (serde_json::Value).
//
// Almacenamiento: app_data_dir/workspaces.json — array de workspaces con nombre.

use serde_json::Value;
use std::path::PathBuf;

fn workspaces_path(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("ocote"))
        .join("workspaces.json")
}

/// Devuelve el array de workspaces guardados (o `[]` si no hay).
#[tauri::command]
pub fn get_workspaces(app: tauri::AppHandle) -> Value {
    std::fs::read_to_string(workspaces_path(&app))
        .ok()
        .and_then(|s| serde_json::from_str::<Value>(&s).ok())
        .filter(|v| v.is_array())
        .unwrap_or_else(|| Value::Array(vec![]))
}

/// Guarda el array completo de workspaces (el frontend manda la lista entera).
#[tauri::command]
pub fn save_workspaces(app: tauri::AppHandle, workspaces: Value) -> Result<(), String> {
    let path = workspaces_path(&app);
    if let Some(dir) = path.parent() {
        std::fs::create_dir_all(dir).ok();
    }
    let json = serde_json::to_string_pretty(&workspaces).map_err(|e| e.to_string())?;
    std::fs::write(&path, json).map_err(|e| e.to_string())
}
