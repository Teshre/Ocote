// ckb.rs — Command Knowledge Base
//
// La CKB es la base de datos SQLite local que contiene ~80-200 comandos
// con sus descripciones, flags y ejemplos. Es el corazón del diferencial
// de Ocote: ayuda offline, sin IA, sin internet.
//
// Al arrancar la app, cargamos commands.json en SQLite.
// El frontend consulta esta BD para el autocompletado y los tooltips.
//
// FASE 2 — Semanas 20-22

use serde::{Deserialize, Serialize};

// Estructura de un comando en la CKB
#[derive(Debug, Serialize, Deserialize)]
pub struct Command {
    pub name: String,
    pub description_es: String,
    pub description_en: String,
    pub flags: Vec<Flag>,
    pub examples: Vec<Example>,
    pub category: String,  // "filesystem", "git", "network", etc.
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Flag {
    pub flag: String,       // "-r" o "--recursive"
    pub description: String,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct Example {
    pub command: String,    // "ls -la ~/Documents"
    pub description: String, // "Listar archivos ocultos en Documentos"
}

// Comando Tauri: sugerencias para autocompletado
// #[tauri::command]
// pub fn get_suggestions(prefix: String, lang: String) -> Vec<Command> {
//     // SELECT * FROM commands WHERE name LIKE '{prefix}%'
//     todo!("Fase 2, Semanas 20-22")
// }

// Comando Tauri: info completa de un comando para el tooltip
// #[tauri::command]
// pub fn get_command_info(name: String) -> Option<Command> {
//     // SELECT * FROM commands WHERE name = '{name}'
//     todo!("Fase 2, Semanas 20-22")
// }
