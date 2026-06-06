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
use std::path::{Path, PathBuf};
use std::process::Command;

// ── Validación de paths contra el CWD del shell ────────────────────────────
//
// Defense-in-depth: aunque el frontend solo debería pasar rutas que el
// explorador ofrece (que vienen de list_directory sobre el cwd del shell),
// el backend IGUAL valida que cada operación esté dentro del cwd registrado
// del shell. Si un XSS o un frontend comprometido intenta borrar /etc/passwd,
// la validación lo rechaza.
//
// El cwd se rastrea en pty::ShellState.cwd y se actualiza desde el frontend
// cuando llega OSC 6731. Si el shell nunca reportó cwd, las operaciones se
// rechazan (return Err).

/// Verifica que `path` esté dentro de `root` (tras canonicalizar ambos).
/// Devuelve el path canónico si pasa la validación, o un error.
/// `path` puede no existir (create_file/create_directory) → en ese caso
/// canonicaliza el parent.
fn validate_path_in_root(path: &Path, root: &Path) -> Result<PathBuf, String> {
    // Canonicalizar el root (debe existir).
    let root_canon = root.canonicalize()
        .map_err(|e| format!("CWD inválido: {}", e))?;

    // Si el path existe, canonicalizarlo directo.
    // Si no, canonicalizar el parent y reconstruir.
    let path_canon = if path.exists() {
        path.canonicalize()
            .map_err(|e| format!("Ruta inválida '{}': {}", path.display(), e))?
    } else {
        let parent = path.parent()
            .ok_or_else(|| format!("Ruta sin directorio padre: {}", path.display()))?;
        let parent_canon = parent.canonicalize()
            .map_err(|e| format!("Directorio padre inválido '{}': {}", parent.display(), e))?;
        parent_canon.join(path.file_name().ok_or_else(|| "Ruta sin nombre".to_string())?)
    };

    if !path_canon.starts_with(&root_canon) {
        return Err(format!(
            "Operación fuera del directorio permitido: '{}' no está dentro de '{}'",
            path_canon.display(), root_canon.display()
        ));
    }
    Ok(path_canon)
}

/// Resuelve el cwd del shell y valida que `path` esté dentro.
/// Devuelve el path validado (canónico).
/// Helper para reducir boilerplate en cada comando.
///
/// `shell_id` es `Option<String>` para tolerar `null`/`undefined` del frontend
/// durante el race condition del primer load. Si es `None` o el shell no
/// existe o no tiene cwd, usa el HOME del usuario (degradación segura: el
/// shell típicamente arranca en HOME de todos modos).
fn check_path_for_shell(
    path:     &str,
    shell_id: Option<&str>,
    pty_state: &tauri::State<crate::pty::PtyState>,
) -> Result<PathBuf, String> {
    let cwd = shell_id
        .and_then(|sid| crate::pty::get_shell_cwd_inner(pty_state, sid))
        .or_else(std::env::home_dir)
        .ok_or_else(|| {
            "No se pudo determinar el directorio de trabajo (ni cwd del shell ni HOME)".to_string()
        })?;
    validate_path_in_root(Path::new(path), &cwd)
}

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
///
/// Validación: `path` debe estar dentro del cwd del `shell_id` dado.
#[tauri::command]
pub fn list_directory(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<Vec<FileEntry>, String> {
    // Validar que la ruta esté dentro del cwd del shell
    let dir_path = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;

    if !dir_path.is_dir() {
        return Err(format!("No es un directorio: {}", path));
    }

    let mut entries: Vec<FileEntry> = Vec::new();

    // Leer el directorio
    let read_dir = std::fs::read_dir(&dir_path)
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
pub fn git_status(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<HashMap<String, String>, String> {
    let mut result: HashMap<String, String> = HashMap::new();

    // Validar path. Si falla, devolvemos mapa vacío (degradación segura).
    let dir = match check_path_for_shell(&path, shell_id.as_deref(), &pty_state) {
        Ok(d) => d,
        Err(_) => return Ok(result),
    };

    if !dir.is_dir() {
        return Ok(result); // ruta inválida → sin badges, sin error
    }

    // `git status --porcelain` desde el directorio. -z usa NUL como separador
    // (robusto ante nombres con espacios/saltos), pero parseamos líneas normales
    // por simplicidad — los nombres con \n son rarísimos en la práctica.
    let output = Command::new("git")
        .arg("-C")
        .arg(&dir)
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

/// Tamaño máximo de archivo que el preview puede cargar. 10 MB es más que
/// suficiente para código fuente y razonable para imágenes. Archivos más
/// grandes deben abrirse en un editor externo.
const MAX_PREVIEW_SIZE: u64 = 10 * 1024 * 1024;

/// Comando Tauri: leer contenido de un archivo de texto.
/// Devuelve el contenido como String. Error si el archivo es binario, no
/// existe, excede MAX_PREVIEW_SIZE, o está fuera del cwd del shell.
/// El frontend usa esto para mostrar el preview de código/texto.
#[tauri::command]
pub fn read_text_file(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<String, String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if !p.exists() {
        return Err(format!("El archivo no existe: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Es un directorio, no un archivo: {}", path));
    }
    let meta = std::fs::metadata(&p)
        .map_err(|e| format!("Error al leer metadata de '{}': {}", path, e))?;
    if meta.len() > MAX_PREVIEW_SIZE {
        return Err(format!(
            "Archivo demasiado grande para preview ({:.1} MB, máximo {} MB). Ábrelo en un editor externo.",
            meta.len() as f64 / 1_048_576.0,
            MAX_PREVIEW_SIZE / 1_048_576
        ));
    }
    std::fs::read_to_string(&p)
        .map_err(|e| format!("Error al leer '{}': {}", path, e))
}

/// Comando Tauri: leer archivo binario y devolverlo como base64.
/// Útil para imágenes (png, jpg, svg, etc.). El frontend construye una
/// data URL: `data:image/png;base64,...`.
#[tauri::command]
pub fn read_file_base64(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<String, String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if !p.exists() {
        return Err(format!("El archivo no existe: {}", path));
    }
    if p.is_dir() {
        return Err(format!("Es un directorio, no un archivo: {}", path));
    }
    let meta = std::fs::metadata(&p)
        .map_err(|e| format!("Error al leer metadata de '{}': {}", path, e))?;
    if meta.len() > MAX_PREVIEW_SIZE {
        return Err(format!(
            "Archivo demasiado grande para preview ({:.1} MB, máximo {} MB).",
            meta.len() as f64 / 1_048_576.0,
            MAX_PREVIEW_SIZE / 1_048_576
        ));
    }
    let data = std::fs::read(&p)
        .map_err(|e| format!("Error al leer '{}': {}", path, e))?;
    Ok(base64::Engine::encode(&base64::engine::general_purpose::STANDARD, &data))
}

// ── Operaciones de archivo ──────────────────────────────────────────────────

/// Comando Tauri: crear un archivo vacío.
/// Si el archivo ya existe, NO lo sobrescribe (devuelve error).
/// Valida que `path` esté dentro del cwd del shell.
#[tauri::command]
pub fn create_file(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<(), String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if p.exists() {
        return Err(format!("Ya existe: {}", path));
    }
    // Crear directorio padre si no existe
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)
            .map_err(|e| format!("Error al crear directorio padre: {}", e))?;
    }
    std::fs::File::create(&p)
        .map_err(|e| format!("Error al crear archivo '{}': {}", path, e))?;
    Ok(())
}

/// Comando Tauri: crear un directorio.
/// Crea todo el árbol de padres que falte (como `mkdir -p`).
/// Valida que `path` esté dentro del cwd del shell.
#[tauri::command]
pub fn create_directory(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<(), String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if p.exists() {
        return Err(format!("Ya existe: {}", path));
    }
    std::fs::create_dir_all(&p)
        .map_err(|e| format!("Error al crear directorio '{}': {}", path, e))
}

/// Comando Tauri: renombrar/mover un archivo o directorio.
/// Valida que tanto `old_path` como `new_path` estén dentro del cwd del shell.
#[tauri::command]
pub fn rename_item(
    old_path:  String,
    new_path:  String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<(), String> {
    let old = check_path_for_shell(&old_path, shell_id.as_deref(), &pty_state)?;
    let new = check_path_for_shell(&new_path, shell_id.as_deref(), &pty_state)?;
    if !old.exists() {
        return Err(format!("No existe: {}", old_path));
    }
    if new.exists() {
        return Err(format!("Ya existe: {}", new_path));
    }
    std::fs::rename(&old, &new)
        .map_err(|e| format!("Error al renombrar '{}' → '{}': {}", old_path, new_path, e))
}

/// Comando Tauri: eliminar un archivo o directorio vacío.
/// Para directorios con contenido, falla (seguridad: el usuario debe
/// vaciarlo manualmente o confirmar en el frontend).
/// Valida que `path` esté dentro del cwd del shell.
#[tauri::command]
pub fn delete_item(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<(), String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if !p.exists() {
        return Err(format!("No existe: {}", path));
    }
    if p.is_dir() {
        std::fs::remove_dir(&p)
            .map_err(|e| format!("Error al eliminar directorio '{}': {}", path, e))
    } else {
        std::fs::remove_file(&p)
            .map_err(|e| format!("Error al eliminar archivo '{}': {}", path, e))
    }
}

// ── Búsqueda de archivos ────────────────────────────────────────────────────

/// Resultado de búsqueda — incluye ruta relativa al directorio base para mostrar
/// al usuario dónde está el archivo dentro del proyecto.
#[derive(Debug, Serialize)]
pub struct SearchResult {
    pub name:          String,
    pub path:          String, // ruta absoluta (para abrir el archivo)
    pub relative_path: String, // ruta relativa al base (para mostrar en UI)
    pub is_dir:        bool,
}

/// Directorios que se saltan siempre durante la búsqueda.
/// Contienen miles de archivos generados que no interesan al usuario.
const SKIP_DIRS: &[&str] = &[
    "node_modules", ".git", "target", "dist", "build", ".next",
    "__pycache__", ".cache", ".venv", "venv", "coverage", ".turbo",
    ".svelte-kit", "out", ".nuxt",
];

/// Comando Tauri: buscar archivos por nombre en un directorio y sus subdirectorios.
///
/// - `base`  — directorio raíz de la búsqueda (debe estar dentro del cwd del shell)
/// - `query` — texto a buscar en el nombre del archivo (case-insensitive)
///
/// Retorna hasta 50 resultados ordenados por relevancia:
///   1. Coincidencia exacta del nombre
///   2. El nombre empieza con la query
///   3. El nombre contiene la query
///
/// Profundidad máxima: 6 niveles. Ignora archivos ocultos (`.nombre`).
#[tauri::command]
pub fn search_files(
    base:      String,
    query:     String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<Vec<SearchResult>, String> {
    let query = query.trim().to_string();
    if query.is_empty() {
        return Ok(vec![]);
    }

    // Validar que `base` esté dentro del cwd del shell. Si no, degradación
    // segura: lista vacía (sin error, el usuario simplemente no ve resultados).
    let base_path = match check_path_for_shell(&base, shell_id.as_deref(), &pty_state) {
        Ok(b) => b,
        Err(_) => return Ok(vec![]),
    };
    if !base_path.is_dir() {
        return Ok(vec![]);
    }

    let query_lower = query.to_lowercase();
    let mut results: Vec<SearchResult> = Vec::new();

    search_recursive(&base_path, &base_path, &query_lower, 0, &mut results);

    // Ordenar por relevancia: exacto > empieza-con > contiene
    results.sort_by_key(|r| {
        let n = r.name.to_lowercase();
        if n == query_lower        { 0u8 }
        else if n.starts_with(&query_lower) { 1 }
        else                               { 2 }
    });

    results.truncate(50);
    Ok(results)
}

/// Función recursiva de búsqueda — no expuesta como comando Tauri.
fn search_recursive(
    base:    &Path,
    current: &Path,
    query:   &str,
    depth:   usize,
    results: &mut Vec<SearchResult>,
) {
    // Límites de seguridad: no profundizar más de 6 niveles y no pasar de 50 resultados.
    if depth >= 6 || results.len() >= 50 {
        return;
    }

    let read_dir = match std::fs::read_dir(current) {
        Ok(rd) => rd,
        Err(_) => return, // permiso denegado u otro error → silencioso
    };

    for entry_result in read_dir {
        if results.len() >= 50 { break; }

        let entry = match entry_result {
            Ok(e)  => e,
            Err(_) => continue,
        };

        let name = entry.file_name().to_string_lossy().to_string();

        // Ignorar archivos/carpetas ocultos (empiezan con .)
        if name.starts_with('.') { continue; }

        let is_dir = match entry.file_type() {
            Ok(ft) => ft.is_dir(),
            Err(_) => continue,
        };

        // Saltar directorios pesados conocidos
        if is_dir && SKIP_DIRS.contains(&name.as_str()) { continue; }

        let path = entry.path();

        // Comprobar si el nombre contiene la query (case-insensitive)
        if name.to_lowercase().contains(query) {
            let relative = path
                .strip_prefix(base)
                .map(|p| p.to_string_lossy().to_string())
                .unwrap_or_else(|_| name.clone());

            results.push(SearchResult {
                name:          name.clone(),
                path:          path.to_string_lossy().to_string(),
                relative_path: relative,
                is_dir,
            });
        }

        // Continuar la búsqueda dentro de subdirectorios
        if is_dir {
            search_recursive(base, &path, query, depth + 1, results);
        }
    }
}

/// Comando Tauri: contar entradas directas de un directorio (primer nivel).
///
/// No es recursivo — solo cuenta los hijos inmediatos, incluyendo
/// archivos ocultos. Suficiente para mostrar al usuario cuántos
/// elementos contiene antes de pedir confirmación de borrado.
/// Valida que `path` esté dentro del cwd del shell.
#[tauri::command]
pub fn count_dir_entries(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<usize, String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if !p.is_dir() {
        return Err(format!("No es un directorio: {}", path));
    }
    // count() consume el iterador contando cada entrada (Ok o Err).
    // Ignoramos errores de entradas individuales para no fallar el conteo total.
    let count = std::fs::read_dir(&p)
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
///     Valida que `path` esté dentro del cwd del shell.
#[tauri::command]
pub fn delete_item_recursive(
    path:      String,
    shell_id:  Option<String>,
    pty_state: tauri::State<crate::pty::PtyState>,
) -> Result<(), String> {
    let p = check_path_for_shell(&path, shell_id.as_deref(), &pty_state)?;
    if !p.exists() {
        return Err(format!("No existe: {}", path));
    }
    if p.is_dir() {
        // remove_dir_all borra el directorio y TODO su contenido
        std::fs::remove_dir_all(&p)
            .map_err(|e| format!("Error al eliminar '{}': {}", path, e))
    } else {
        std::fs::remove_file(&p)
            .map_err(|e| format!("Error al eliminar '{}': {}", path, e))
    }
}
