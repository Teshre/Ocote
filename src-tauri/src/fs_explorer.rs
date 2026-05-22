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
use std::path::Path;

#[derive(Debug, Serialize)]
pub struct FileEntry {
    pub name: String,
    pub path: String,
    pub is_dir: bool,
    pub size: u64,         // bytes, 0 para directorios
}

/// Comando Tauri: listar contenido de un directorio.
///
/// Devuelve un Vec<FileEntry> con archivos y carpetas ordenados:
/// primero carpetas (ordenadas alfabéticamente), luego archivos.
#[tauri::command]
pub fn list_directory(path: String) -> Result<Vec<FileEntry>, String> {
    let dir_path = Path::new(&path);

    // Verificar que la ruta existe y es un directorio
    if !dir_path.exists() {
        return Err(format!("La ruta no existe: {}", path));
    }
    if !dir_path.is_dir() {
        return Err(format!("No es un directorio: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    // Leer el directorio
    let read_dir = std::fs::read_dir(dir_path)
        .map_err(|e| format!("Error al leer directorio '{}': {}", path, e))?;

    for entry_result in read_dir {
        let entry = match entry_result {
            Ok(e) => e,
            Err(e) => {
                eprintln!("Warning: error al leer entrada: {}", e);
                continue;
            }
        };

        let metadata = match entry.metadata() {
            Ok(m) => m,
            Err(e) => {
                eprintln!("Warning: no se pudo leer metadata de {:?}: {}", entry.path(), e);
                continue;
            }
        };

        let name = entry.file_name()
            .to_string_lossy()
            .to_string();

        // Ignorar archivos ocultos (empiezan con .)
        // Esto incluye ., .., .git, .zshrc, etc.
        if name.starts_with('.') {
            continue;
        }

        let path_str = entry.path()
            .to_string_lossy()
            .to_string();

        let is_dir = metadata.is_dir();
        let size = if is_dir { 0 } else { metadata.len() };

        entries.push(FileEntry {
            name,
            path: path_str,
            is_dir,
            size,
        });
    }

    // Ordenar: primero carpetas (alfabéticamente), luego archivos (alfabéticamente)
    entries.sort_by(|a, b| {
        match (a.is_dir, b.is_dir) {
            (true, false) => std::cmp::Ordering::Less,    // a es carpeta, b es archivo → a va primero
            (false, true) => std::cmp::Ordering::Greater, // a es archivo, b es carpeta → b va primero
            _ => a.name.to_lowercase().cmp(&b.name.to_lowercase()), // mismo tipo → orden alfabético
        }
    });

    Ok(entries)
}

/// Comando Tauri: obtener el directorio home del usuario.
///
/// Intenta múltiples métodos:
/// 1. Variable de entorno HOME (Unix) o USERPROFILE (Windows)
/// 2. std::env::home_dir() (funciona en la mayoría de los casos)
/// 3. Construir desde USER + /Users/ (macOS fallback)
#[tauri::command]
pub fn get_home_directory() -> Result<String, String> {
    // Método 1: variables de entorno
    if let Ok(home) = std::env::var("HOME") {
        if !home.is_empty() {
            return Ok(home);
        }
    }
    if let Ok(home) = std::env::var("USERPROFILE") {
        if !home.is_empty() {
            return Ok(home);
        }
    }

    // Método 2: home_dir() (deprecated pero funciona)
    if let Some(home) = std::env::home_dir() {
        let path = home.to_string_lossy().to_string();
        if !path.is_empty() {
            return Ok(path);
        }
    }

    // Método 3: fallback macOS /Users/<username>
    #[cfg(target_os = "macos")]
    if let Ok(user) = std::env::var("USER") {
        let path = format!("/Users/{}", user);
        if std::path::Path::new(&path).exists() {
            return Ok(path);
        }
    }

    Err("No se pudo determinar el directorio home. Verifica que las variables HOME o USER estén configuradas.".to_string())
}
