// ckb.rs — Command Knowledge Base
//
// Base de datos SQLite local con ~80-200 comandos, sus descripciones,
// flags y ejemplos. Es el corazón del diferencial de Ocote:
// ayuda offline, sin IA, sin internet.
//
// Al arrancar la app, cargamos commands.json en SQLite.
// El frontend consulta esta BD para el autocompletado y los tooltips.
//
// FASE 2 — Semanas 20-22

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use std::sync::Mutex;

// ── Estructuras de datos ─────────────────────────────────────────────────

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Command {
    pub name: String,
    pub description_es: String,
    pub description_en: String,
    pub flags: Vec<Flag>,
    pub examples: Vec<Example>,
    pub category: String,
}

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

// ── Estado de la CKB ─────────────────────────────────────────────────────

pub struct CkbState {
    conn: Mutex<Connection>,
}

impl CkbState {
    pub fn new() -> Result<Self, String> {
        // Por ahora usamos base en memoria. En Fase 3 podemos persistir
        // en un archivo en el directorio de datos de la app.
        let conn = Connection::open_in_memory()
            .map_err(|e| format!("Error abriendo SQLite: {}", e))?;

        Self::init_schema(&conn)?;
        Self::load_commands(&conn)?;

        Ok(CkbState {
            conn: Mutex::new(conn),
        })
    }

    /// Crear tablas si no existen.
    fn init_schema(conn: &Connection) -> Result<(), String> {
        conn.execute(
            "CREATE TABLE IF NOT EXISTS commands (
                name TEXT PRIMARY KEY,
                description_es TEXT NOT NULL,
                description_en TEXT NOT NULL,
                category TEXT NOT NULL
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS flags (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_name TEXT NOT NULL,
                flag TEXT NOT NULL,
                description TEXT NOT NULL,
                FOREIGN KEY(command_name) REFERENCES commands(name)
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS examples (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                command_name TEXT NOT NULL,
                command TEXT NOT NULL,
                description TEXT NOT NULL,
                FOREIGN KEY(command_name) REFERENCES commands(name)
            )",
            [],
        )
        .map_err(|e| e.to_string())?;

        // Índice para búsquedas por prefijo (autocompletado)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_commands_name ON commands(name)",
            [],
        )
        .map_err(|e| e.to_string())?;

        Ok(())
    }

    /// Cargar commands.json en la base de datos.
    fn load_commands(conn: &Connection) -> Result<(), String> {
        // include_str incluye el JSON en tiempo de compilación.
        // La ruta es relativa a src-tauri/src/ckb.rs → ../../ckb/commands.json
        let json_str = include_str!("../../ckb/commands.json");
        let commands: Vec<Command> = serde_json::from_str(json_str)
            .map_err(|e| format!("Error parseando commands.json: {}", e))?;

        for cmd in commands {
            conn.execute(
                "INSERT OR REPLACE INTO commands (name, description_es, description_en, category)
                 VALUES (?1, ?2, ?3, ?4)",
                [
                    &cmd.name,
                    &cmd.description_es,
                    &cmd.description_en,
                    &cmd.category,
                ],
            )
            .map_err(|e| format!("Error insertando comando: {}", e))?;

            for flag in &cmd.flags {
                conn.execute(
                    "INSERT INTO flags (command_name, flag, description) VALUES (?1, ?2, ?3)",
                    [&cmd.name, &flag.flag, &flag.description],
                )
                .map_err(|e| format!("Error insertando flag: {}", e))?;
            }

            for example in &cmd.examples {
                conn.execute(
                    "INSERT INTO examples (command_name, command, description) VALUES (?1, ?2, ?3)",
                    [&cmd.name, &example.command, &example.description],
                )
                .map_err(|e| format!("Error insertando ejemplo: {}", e))?;
            }
        }

        Ok(())
    }
}

// ── Comandos Tauri ───────────────────────────────────────────────────────

/// Devuelve comandos cuyo nombre empieza con el prefijo dado.
/// Usado para autocompletado visual.
#[tauri::command]
pub fn get_suggestions(
    prefix: String,
    state: tauri::State<CkbState>,
) -> Result<Vec<Command>, String> {
    let conn = state.conn.lock().unwrap();
    let pattern = format!("{}%", prefix);

    let mut stmt = conn
        .prepare(
            "SELECT name, description_es, description_en, category
             FROM commands
             WHERE name LIKE ?1
             ORDER BY name
             LIMIT 10",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([&pattern], |row| {
            Ok(Command {
                name: row.get(0)?,
                description_es: row.get(1)?,
                description_en: row.get(2)?,
                category: row.get(3)?,
                flags: vec![],
                examples: vec![],
            })
        })
        .map_err(|e| e.to_string())?;

    let mut commands = Vec::new();
    for row in rows {
        commands.push(row.map_err(|e| e.to_string())?);
    }

    Ok(commands)
}

/// Devuelve información completa de un comando (con flags y ejemplos).
/// Usado para el tooltip educativo.
#[tauri::command]
pub fn get_command_info(
    name: String,
    state: tauri::State<CkbState>,
) -> Result<Option<Command>, String> {
    let conn = state.conn.lock().unwrap();

    // 1. Comando base
    let mut stmt = conn
        .prepare(
            "SELECT name, description_es, description_en, category
             FROM commands WHERE name = ?1",
        )
        .map_err(|e| e.to_string())?;

    let mut rows = stmt
        .query_map([&name], |row| {
            Ok(Command {
                name: row.get(0)?,
                description_es: row.get(1)?,
                description_en: row.get(2)?,
                category: row.get(3)?,
                flags: vec![],
                examples: vec![],
            })
        })
        .map_err(|e| e.to_string())?;

    let mut cmd = match rows.next() {
        Some(Ok(cmd)) => cmd,
        _ => return Ok(None),
    };

    // 2. Flags
    let mut stmt = conn
        .prepare("SELECT flag, description FROM flags WHERE command_name = ?1")
        .map_err(|e| e.to_string())?;

    let flag_rows = stmt
        .query_map([&name], |row| {
            Ok(Flag {
                flag: row.get(0)?,
                description: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    for row in flag_rows {
        cmd.flags.push(row.map_err(|e| e.to_string())?);
    }

    // 3. Examples
    let mut stmt = conn
        .prepare("SELECT command, description FROM examples WHERE command_name = ?1")
        .map_err(|e| e.to_string())?;

    let example_rows = stmt
        .query_map([&name], |row| {
            Ok(Example {
                command: row.get(0)?,
                description: row.get(1)?,
            })
        })
        .map_err(|e| e.to_string())?;

    for row in example_rows {
        cmd.examples.push(row.map_err(|e| e.to_string())?);
    }

    Ok(Some(cmd))
}
