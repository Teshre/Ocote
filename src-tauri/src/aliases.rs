// aliases.rs — Editor de aliases de Ocote
//
// Fuente de verdad: app_data_dir/aliases.json — lista de {name, command}.
// De ahí se generan archivos por-shell que las configs bundleadas sourcean
// vía la env var OCOTE_ALIASES (ver pty.rs). NO toca el .zshrc del usuario.
//
//   aliases.sh   → zsh + bash   →  alias name='command'
//   aliases.fish → fish          →  alias name 'command'
//   aliases.ps1  → PowerShell    →  function name { command @args }
//                                   (Set-Alias de PS NO acepta argumentos)

use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

#[derive(Serialize, Deserialize, Clone)]
pub struct Alias {
    pub name: String,
    pub command: String,
}

fn data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path_resolver()
        .app_data_dir()
        .unwrap_or_else(|| std::env::temp_dir().join("ocote"))
}

fn json_path(app: &tauri::AppHandle) -> PathBuf {
    data_dir(app).join("aliases.json")
}

// ── Comandos Tauri ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_aliases(app: tauri::AppHandle) -> Vec<Alias> {
    std::fs::read_to_string(json_path(&app))
        .ok()
        .and_then(|s| serde_json::from_str(&s).ok())
        .unwrap_or_default()
}

#[tauri::command]
pub fn save_aliases(app: tauri::AppHandle, aliases: Vec<Alias>) -> Result<(), String> {
    // Validar y sanear: nombre válido + comando no vacío.
    let cleaned: Vec<Alias> = aliases
        .into_iter()
        .map(|a| Alias {
            name: a.name.trim().to_string(),
            command: a.command.trim().to_string(),
        })
        .filter(|a| is_valid_name(&a.name) && !a.command.is_empty())
        .collect();

    let dir = data_dir(&app);
    std::fs::create_dir_all(&dir).ok();

    let json = serde_json::to_string_pretty(&cleaned).map_err(|e| e.to_string())?;
    std::fs::write(json_path(&app), json).map_err(|e| e.to_string())?;

    regenerate_files(&dir, &cleaned)
}

/// Regenera los archivos por-shell desde el JSON en disco.
/// Se llama en el setup de la app para que los aliases existentes apliquen
/// al primer shell tras un reinicio.
pub fn regenerate_from_disk(app: &tauri::AppHandle) {
    let dir = data_dir(app);
    let aliases = get_aliases(app.clone());
    std::fs::create_dir_all(&dir).ok();
    let _ = regenerate_files(&dir, &aliases);
}

// ── Generación de archivos por shell ───────────────────────────────────────

fn regenerate_files(dir: &Path, aliases: &[Alias]) -> Result<(), String> {
    // sh (zsh + bash)
    let mut sh = String::from("# Generado por Ocote — no editar a mano.\n");
    for a in aliases {
        sh.push_str(&format!("alias {}='{}'\n", a.name, sh_escape(&a.command)));
    }
    std::fs::write(dir.join("aliases.sh"), sh).map_err(|e| e.to_string())?;

    // fish
    let mut fish = String::from("# Generado por Ocote — no editar a mano.\n");
    for a in aliases {
        fish.push_str(&format!("alias {} '{}'\n", a.name, fish_escape(&a.command)));
    }
    std::fs::write(dir.join("aliases.fish"), fish).map_err(|e| e.to_string())?;

    // PowerShell — funciones (Set-Alias no acepta argumentos)
    let mut ps = String::from("# Generado por Ocote — no editar a mano.\n");
    for a in aliases {
        ps.push_str(&format!("function {} {{ {} @args }}\n", a.name, a.command));
    }
    std::fs::write(dir.join("aliases.ps1"), ps).map_err(|e| e.to_string())?;

    Ok(())
}

// ── Validación y escape ────────────────────────────────────────────────────

/// Un nombre de alias válido: alfanumérico/_/- y no empieza con dígito.
fn is_valid_name(n: &str) -> bool {
    if n.is_empty() {
        return false;
    }
    let first = n.chars().next().unwrap();
    if first.is_numeric() {
        return false;
    }
    n.chars().all(|c| c.is_alphanumeric() || c == '_' || c == '-')
}

/// Escape para comillas simples en sh: ' → '\''
fn sh_escape(s: &str) -> String {
    s.replace('\'', "'\\''")
}

/// Escape para comillas simples en fish: \ → \\, ' → \'
fn fish_escape(s: &str) -> String {
    s.replace('\\', "\\\\").replace('\'', "\\'")
}
