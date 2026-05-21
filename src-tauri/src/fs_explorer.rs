// fs_explorer.rs — Explorador del sistema de archivos
//
// Lee el directorio actual y devuelve una lista de archivos/carpetas
// para que el panel lateral del frontend los muestre.
//
// Cuando el usuario hace click en una carpeta en el panel,
// el frontend ejecuta `cd <ruta>` en el PTY.
//
// FASE 2 — Semanas 17-19

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,         // bytes, 0 para directorios
}

// Comando Tauri: listar contenido de un directorio
// #[tauri::command]
// pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
//     // std::fs::read_dir(&path) y convertir cada entrada a FileEntry
//     todo!("Fase 2, Semanas 17-19")
// }
