// ckb.rs — Command Knowledge Base (multilenguaje)
//
// Base de datos SQLite local con 150+ comandos en 5 idiomas.
// Es el corazón diferencial de Ocote: ayuda offline, sin IA, sin internet.
//
// Idiomas soportados: es · en · pt · fr · de
// El frontend pasa el idioma activo en cada consulta. El backend
// devuelve una descripción única ya resuelta — el frontend no sabe
// qué columna se consultó, solo recibe `description`.

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// ── Struct interno (deserialización de commands.json) ────────────────────

// Contiene todas las traducciones. Solo se usa al cargar el JSON en SQLite.
#[derive(Debug, Deserialize, Clone)]
struct CommandRaw {
    pub name: String,
    pub category: String,
    pub description_es: String,
    pub description_en: String,
    // Los campos PT/FR/DE son opcionales para no romper entradas antiguas
    #[serde(default)]
    pub description_pt: String,
    #[serde(default)]
    pub description_fr: String,
    #[serde(default)]
    pub description_de: String,
    pub flags: Vec<Flag>,
    pub examples: Vec<Example>,
}

// ── Structs públicos (lo que enviamos al frontend) ───────────────────────

// Flag: el `description` queda en el idioma base (ES) por ahora.
// Las traducciones de flags se pueden agregar en una versión futura.
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Flag {
    pub flag: String,
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Example {
    pub command: String,
    pub description: String,
}

// Lo que devolvemos al frontend: una descripción ya resuelta al idioma pedido.
// El frontend usa siempre `cmd.description` — no sabe qué idioma es.
#[derive(Debug, Serialize, Clone)]
pub struct CommandResponse {
    pub name: String,
    pub description: String,   // ya resuelta según el lang pedido
    pub category: String,
    pub flags: Vec<Flag>,
    pub examples: Vec<Example>,
}

// ── Estado de la CKB ─────────────────────────────────────────────────────

pub struct CkbState {
    conn: Mutex<Connection>,
}

impl CkbState {
    pub fn new() -> Result<Self, String> {
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Error abriendo SQLite: {}", e))?;

        Self::init_schema(&conn)?;
        Self::load_commands(&conn)?;

        Ok(CkbState {
            conn: Mutex::new(conn),
        })
    }

    fn init_schema(conn: &Connection) -> Result<(), String> {
        // Tabla de comandos con las 5 columnas de descripción.
        // DEFAULT '' para compatibilidad con entradas que no tengan todas las traducciones.
        conn.execute(
            "CREATE TABLE IF NOT EXISTS commands (
                name            TEXT PRIMARY KEY,
                description_es  TEXT NOT NULL,
                description_en  TEXT NOT NULL DEFAULT '',
                description_pt  TEXT NOT NULL DEFAULT '',
                description_fr  TEXT NOT NULL DEFAULT '',
                description_de  TEXT NOT NULL DEFAULT '',
                category        TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS flags (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                command_name TEXT NOT NULL,
                flag         TEXT NOT NULL,
                description  TEXT NOT NULL,
                FOREIGN KEY(command_name) REFERENCES commands(name)
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS examples (
                id           INTEGER PRIMARY KEY AUTOINCREMENT,
                command_name TEXT NOT NULL,
                command      TEXT NOT NULL,
                description  TEXT NOT NULL,
                FOREIGN KEY(command_name) REFERENCES commands(name)
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_commands_name ON commands(name)",
            [],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    fn load_commands(conn: &Connection) -> Result<(), String> {
        let json_str = include_str!("../../ckb/commands.json");
        let commands: Vec<CommandRaw> = serde_json::from_str(json_str)
            .map_err(|e| format!("Error parseando commands.json: {}", e))?;

        for cmd in commands {
            conn.execute(
                "INSERT OR REPLACE INTO commands
                 (name, description_es, description_en, description_pt, description_fr, description_de, category)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                rusqlite::params![
                    &cmd.name,
                    &cmd.description_es,
                    &cmd.description_en,
                    &cmd.description_pt,
                    &cmd.description_fr,
                    &cmd.description_de,
                    &cmd.category,
                ],
            )
            .map_err(|e| format!("Error insertando '{}': {}", cmd.name, e))?;

            for flag in &cmd.flags {
                conn.execute(
                    "INSERT INTO flags (command_name, flag, description) VALUES (?1, ?2, ?3)",
                    [&cmd.name, &flag.flag, &flag.description],
                )
                .map_err(|e| format!("Error insertando flag de '{}': {}", cmd.name, e))?;
            }

            for example in &cmd.examples {
                conn.execute(
                    "INSERT INTO examples (command_name, command, description) VALUES (?1, ?2, ?3)",
                    [&cmd.name, &example.command, &example.description],
                )
                .map_err(|e| format!("Error insertando ejemplo de '{}': {}", cmd.name, e))?;
            }
        }

        Ok(())
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

// Mapea el código de idioma a la columna SQL correspondiente.
// Si el idioma no está soportado, cae a español.
// Whitelist explícita: nunca interpolamos directamente lang en el SQL
// para evitar inyección — solo devolvemos literales conocidos.
fn lang_column(lang: &str) -> &'static str {
    match lang {
        "en" => "description_en",
        "pt" => "description_pt",
        "fr" => "description_fr",
        "de" => "description_de",
        _    => "description_es",   // default: español
    }
}

// ── Comandos Tauri ────────────────────────────────────────────────────────

/// Devuelve comandos cuyo nombre empieza con el prefijo dado.
/// `lang` puede ser "es", "en", "pt", "fr" o "de".
/// La descripción devuelta ya está en el idioma solicitado.
#[tauri::command]
pub fn get_suggestions(
    prefix: String,
    lang: String,
    state: tauri::State<CkbState>,
) -> Result<Vec<CommandResponse>, String> {
    let conn = state.conn.lock().unwrap();
    let col = lang_column(&lang);
    let pattern = format!("{}%", prefix.to_lowercase());

    // Construimos la query con el nombre de columna resuelto.
    // No interpolamos `lang` directamente (solo `col`, que es un literal).
    let sql = format!(
        "SELECT name, {col}, category
         FROM commands
         WHERE LOWER(name) LIKE ?1
         ORDER BY name
         LIMIT 10"
    );

    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&pattern], |row| {
            Ok(CommandResponse {
                name:        row.get(0)?,
                description: row.get(1)?,
                category:    row.get(2)?,
                flags:       vec![],
                examples:    vec![],
            })
        })
        .map_err(|e| e.to_string())?;

    rows.map(|r| r.map_err(|e| e.to_string())).collect()
}

/// Devuelve información completa de un comando (flags + ejemplos).
/// Usado para el tooltip educativo.
#[tauri::command]
pub fn get_command_info(
    name: String,
    lang: String,
    state: tauri::State<CkbState>,
) -> Result<Option<CommandResponse>, String> {
    let conn = state.conn.lock().unwrap();
    let col = lang_column(&lang);

    // 1. Comando base
    let sql = format!(
        "SELECT name, {col}, category FROM commands WHERE name = ?1"
    );
    let mut stmt = conn.prepare(&sql).map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map([&name], |row| {
            Ok(CommandResponse {
                name:        row.get(0)?,
                description: row.get(1)?,
                category:    row.get(2)?,
                flags:       vec![],
                examples:    vec![],
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = match rows.next() {
        Some(Ok(c)) => c,
        _ => return Ok(None),
    };

    // 2. Flags
    let mut stmt = conn
        .prepare("SELECT flag, description FROM flags WHERE command_name = ?1")
        .map_err(|e| e.to_string())?;

    cmd.flags = stmt
        .query_map([&name], |row| {
            Ok(Flag { flag: row.get(0)?, description: row.get(1)? })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    // 3. Examples
    let mut stmt = conn
        .prepare("SELECT command, description FROM examples WHERE command_name = ?1")
        .map_err(|e| e.to_string())?;

    cmd.examples = stmt
        .query_map([&name], |row| {
            Ok(Example { command: row.get(0)?, description: row.get(1)? })
        })
        .map_err(|e| e.to_string())?
        .map(|r| r.map_err(|e| e.to_string()))
        .collect::<Result<Vec<_>, _>>()?;

    Ok(Some(cmd))
}
