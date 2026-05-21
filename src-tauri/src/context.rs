// context.rs — Detección de contexto del directorio actual
//
// Sin IA. Sin red. Solo mira qué archivos existen en el directorio
// y deduce qué tipo de proyecto es para sugerir comandos relevantes.
//
// Ejemplos:
//   ¿Hay .git/?          → sugiere: git status, git log --oneline
//   ¿Hay package.json?   → sugiere: pnpm install, pnpm dev
//   ¿Hay Cargo.toml?     → sugiere: cargo build, cargo run
//   ¿Hay requirements.txt? → sugiere: pip install -r requirements.txt
//
// FASE 3 — Semanas 34-38

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ContextInfo {
    pub project_type: ProjectType,
    pub suggestions: Vec<String>,  // comandos recomendados
}

#[derive(Debug, Serialize)]
pub enum ProjectType {
    Git,
    Node,
    Rust,
    Python,
    Unknown,
}

// Comando Tauri: detectar contexto del directorio
// #[tauri::command]
// pub fn detect_context(path: String) -> ContextInfo {
//     // Revisar qué archivos existen con std::path::Path::exists()
//     todo!("Fase 3, Semanas 34-38")
// }
