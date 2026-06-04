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
use std::collections::HashMap;
use std::path::Path;
use std::process::Command;

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

        let name = entry.file_name()
            .to_string_lossy()
            .to_string();

        // Ignorar archivos ocultos (empiezan con .)
        if name.starts_with('.') {
            continue;
        }

        // file_type() es más rápido que metadata() — no lee tamaño, permisos, etc.
        let is_dir = match entry.file_type() {
            Ok(ft) => ft.is_dir(),
            Err(e) => {
                eprintln!("Warning: no se pudo leer tipo de {:?}: {}", entry.path(), e);
                continue;
            }
        };

        let path_str = entry.path()
            .to_string_lossy()
            .to_string();

        entries.push(FileEntry {
            name,
            path: path_str,
            is_dir,
            size: 0, // El frontend no muestra tamaño actualmente
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

/// Comando Tauri: estado git de los archivos de un directorio.
///
/// Corre `git status --porcelain` desde `path` y devuelve un mapa
/// `{ nombre_entrada_en_este_dir → estado }` donde estado es uno de:
///   "modified"   — cambios sin stage o ya staged (M)
///   "added"      — archivo nuevo agregado al index (A)
///   "untracked"  — archivo nuevo sin trackear (??)
///   "deleted"    — borrado (D)
///   "renamed"    — renombrado (R)
///
/// Para una entrada que es un directorio, si CUALQUIER archivo dentro tiene
/// cambios, el directorio se marca como "modified" (badge en la carpeta).
///
/// Degradación segura: si `path` no está dentro de un repo git, o git no está
/// instalado, devuelve un mapa VACÍO (no es error — el explorador simplemente
/// no muestra badges).
#[tauri::command]
pub fn git_status(path: String) -> Result<HashMap<String, String>, String> {
    let mut result: HashMap<String, String> = HashMap::new();

    let dir = Path::new(&path);
    if !dir.is_dir() {
        return Ok(result); // ruta inválida → sin badges, sin error
    }

    // `git status --porcelain` desde el directorio. -z usa NUL como separador
    // (robusto ante nombres con espacios/saltos), pero parseamos líneas normales
    // por simplicidad — los nombres con \n son rarísimos en la práctica.
    let output = Command::new("git")
        .arg("-C")
        .arg(&path)
        .arg("status")
        .arg("--porcelain")
        .arg("--untracked-files=all")
        .output();

    let output = match output {
        Ok(o) if o.status.success() => o,
        // No es repo git, git no instalado, o falló → sin badges (silencioso)
        _ => return Ok(result),
    };

    let stdout = String::from_utf8_lossy(&output.stdout);

    // Cada línea: "XY ruta/relativa/al/root-del-repo"
    //   XY = dos chars de estado (index + working tree).
    // Las rutas son relativas a la RAÍZ del repo, no a `path`. Pero como corrimos
    // git con -C path, git las da relativas a path. Tomamos solo el PRIMER
    // segmento de la ruta para mapear a una entrada visible en este directorio:
    // un archivo "foo.rs" → entrada "foo.rs"; "sub/bar.rs" → entrada "sub" (dir).
    for line in stdout.lines() {
        if line.len() < 4 {
            continue;
        }
        let code = &line[0..2];
        let mut rel = line[3..].to_string();

        // Renombrados vienen como "old -> new"; tomamos el destino.
        if let Some(idx) = rel.find(" -> ") {
            rel = rel[(idx + 4)..].to_string();
        }
        // Quitar comillas que git agrega a nombres con caracteres especiales.
        rel = rel.trim_matches('"').to_string();

        // Primer segmento de la ruta = la entrada visible en este directorio.
        let first_seg = rel.split('/').next().unwrap_or(&rel).to_string();
        let is_nested = rel.contains('/');

        // Mapear el código XY a un estado simple.
        let status = if code.contains('?') {
            "untracked"
        } else if code.contains('D') {
            "deleted"
        } else if code.contains('A') {
            "added"
        } else if code.contains('R') {
            "renamed"
        } else if code.contains('M') {
            "modified"
        } else {
            "modified"
        };

        // Si el cambio está dentro de un subdirectorio, marcar el DIRECTORIO
        // como modificado (no pisar un estado más específico ya asignado).
        if is_nested {
            result.entry(first_seg).or_insert_with(|| "modified".to_string());
        } else {
            // Archivo directo en este dir → estado específico (pisa "modified" de dir).
            result.insert(first_seg, status.to_string());
        }
    }

    Ok(result)
}

// ── Lectura de archivos ─────────────────────────────────────────────────────

/// Comando Tauri: leer contenido de un archivo de texto.
/// Devuelve el contenido como String. Error si el archivo es binario o no
/// existe. El frontend usa esto para mostrar el preview de código/texto.
#[tauri::command]
pub fn read_text_file(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("El archivo no existe: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Es un directorio, no un archivo: {}", path));
    }
    std::fs::read_to_string(p)
        .map_err(|e| format!("Error al leer '{}': {}", path, e))
}

/// Comando Tauri: leer archivo binario y devolverlo como base64.
/// Útil para imágenes (png, jpg, svg, etc.). El frontend construye una
/// data URL: `data:image/png;base64,...`.
#[tauri::command]
pub fn read_file_base64(path: String) -> Result<String, String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("El archivo no existe: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Es un directorio, no un archivo: {}", path));
    }
    let data = std::fs::read(p)
        .map_err(|e| format!("Error al leer '{}': {}", path, e))?;
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data))
}

// ── Operaciones de archivo ──────────────────────────────────────────────────

/// Comando Tauri: crear un archivo vacío.
/// Si el archivo ya existe, NO lo sobrescribe (devuelve error).
#[tauri::command]
pub fn create_file(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("Ya existe: {}", path));
    }
    // Crear directorio padre si no existe
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Error al crear directorio padre: {}", e))?;
    }
    std::fs::File::create(p)
        .map_err(|e| format!("Error al crear archivo '{}': {}", path, e))?;
    Ok(())
}

/// Comando Tauri: crear un directorio.
/// Crea todo el árbol de padres que falte (como `mkdir -p`).
#[tauri::command]
pub fn create_directory(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if p.exists() {
        return Err(format!("Ya existe: {}", path));
    }
    std::fs::create_dir_all(p)
        .map_err(|e| format!("Error al crear directorio '{}': {}", path, e))
}

/// Comando Tauri: renombrar/mover un archivo o directorio.
#[tauri::command]
pub fn rename_item(old_path: String, new_path: String) -> Result<(), String> {
    let old = Path::new(&old_path);
    let new = Path::new(&new_path);
    if !old.exists() {
        return Err(format!("No existe: {}", old_path));
    }
    if new.exists() {
        return Err(format!("Ya existe: {}", new_path));
    }
    std::fs::rename(old, new)
        .map_err(|e| format!("Error al renombrar '{}' → '{}': {}", old_path, new_path, e))
}

/// Comando Tauri: eliminar un archivo o directorio vacío.
/// Para directorios con contenido, falla (seguridad: el usuario debe
/// vaciarlo manualmente o confirmar en el frontend).
#[tauri::command]
pub fn delete_item(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("No existe: {}", path));
    }
    if p.is_dir() {
        std::fs::remove_dir(p)
            .map_err(|e| format!("Error al eliminar directorio '{}': {}", path, e))
    } else {
        std::fs::remove_file(p)
            .map_err(|e| format!("Error al eliminar archivo '{}': {}", path, e))
    }
}

/// Comando Tauri: contar entradas directas de un directorio (primer nivel).
///
/// No es recursivo — solo cuenta los hijos inmediatos, incluyendo
/// archivos ocultos. Suficiente para mostrar al usuario cuántos
/// elementos contiene antes de pedir confirmación de borrado.
#[tauri::command]
pub fn count_dir_entries(path: String) -> Result<usize, String> {
    let p = Path::new(&path);
    if !p.is_dir() {
        return Err(format!("No es un directorio: {}", path));
    }
    // count() consume el iterador contando cada entrada (Ok o Err).
    // Ignoramos errores de entradas individuales para no fallar el conteo total.
    let count = std::fs::read_dir(p)
        .map_err(|e| format!("Error al leer '{}': {}", path, e))?
        .filter(|e| e.is_ok()) // ignorar entradas con error de permisos
        .count();
    Ok(count)
}

/// Comando Tauri: eliminar un archivo o directorio RECURSIVAMENTE.
///
/// Para directorios usa `remove_dir_all`, que borra todo el árbol de
/// archivos sin importar si está vacío o no.
///
/// ⚠️  Esta operación es PERMANENTE e IRREVERSIBLE.
///     El frontend DEBE pedir confirmación explícita (con conteo de
///     elementos) antes de invocar este comando.
#[tauri::command]
pub fn delete_item_recursive(path: String) -> Result<(), String> {
    let p = Path::new(&path);
    if !p.exists() {
        return Err(format!("No existe: {}", path));
    }
    if p.is_dir() {
        // remove_dir_all borra el directorio y TODO su contenido
        std::fs::remove_dir_all(p)
            .map_err(|e| format!("Error al eliminar '{}': {}", path, e))
    } else {
        std::fs::remove_file(p)
            .map_err(|e| format!("Error al eliminar '{}': {}", path, e))
    }
}
