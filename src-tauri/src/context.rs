// context.rs — Detección de contexto del directorio actual (Fase 3)
//
// Sin IA. Sin red. Solo mira qué archivos existen en el directorio
// y deduce qué tipo de proyecto es para sugerir comandos relevantes.
//
// Cómo funciona:
//   1. El frontend llama detect_context(path) cuando el CWD cambia.
//   2. Revisamos si existen ciertos archivos centinela (ej. Cargo.toml → Rust).
//   3. Devolvemos un ContextInfo con el tipo de proyecto y comandos sugeridos.
//   4. El frontend puede usar esas sugerencias para priorizar el autocompletado.
//
// Ejemplos:
//   ¿Hay .git/?              → ProjectType::Git   → sugiere: git status, git log
//   ¿Hay package.json?       → ProjectType::Node  → sugiere: npm install, npm run dev
//   ¿Hay Cargo.toml?         → ProjectType::Rust  → sugiere: cargo build, cargo run
//   ¿Hay requirements.txt?   → ProjectType::Python → sugiere: pip install -r ...
//   ¿Hay docker-compose.yml? → ProjectType::Docker → sugiere: docker compose up
//   ¿Hay Makefile?           → ProjectType::Make  → sugiere: make, make install

use std::path::Path;
use serde::Serialize;

// ── Tipos públicos ─────────────────────────────────────────────────────────

// Tipo de proyecto detectado en el directorio.
// Se puede serializar a JSON para mandarlo al frontend.
#[derive(Debug, Serialize, Clone, PartialEq)]
#[serde(rename_all = "lowercase")]  // "git", "node", "rust"... en JSON
pub enum ProjectType {
    Git,
    Node,
    Rust,
    Python,
    Docker,
    Make,
    Go,
    Unknown,
}

// Resultado completo que regresa al frontend.
// `project_type`: el tipo detectado (puede ser más de uno en un directorio real,
//   pero devolvemos el de mayor prioridad para simplificar).
// `project_types`: todos los tipos encontrados (ej. un proyecto puede ser Git+Node).
// `suggestions`: comandos relevantes en orden de prioridad.
// `label`: texto corto para mostrar en UI ("Node.js", "Rust", etc.).
#[derive(Debug, Serialize)]
pub struct ContextInfo {
    // Tipo principal (el primero en la lista de prioridad)
    pub project_type: ProjectType,

    // Todos los tipos detectados — un repo puede ser Git + Rust + Docker a la vez
    pub project_types: Vec<ProjectType>,

    // Comandos sugeridos para este contexto, en orden de relevancia
    pub suggestions: Vec<String>,

    // Etiqueta legible para mostrar en el breadcrumb o UI
    // Ej: "Git · Rust", "Node.js", "Python"
    pub label: String,
}

// ── Detección ─────────────────────────────────────────────────────────────

// Verifica si un archivo o carpeta existe en el directorio dado.
// Ejemplo: file_exists("/home/user/proyecto", ".git") → true/false
fn file_exists(dir: &str, name: &str) -> bool {
    Path::new(dir).join(name).exists()
}

// Detecta todos los tipos de proyecto en un directorio.
// Devuelve un Vec ordenado por prioridad (el más específico primero).
fn detect_types(dir: &str) -> Vec<ProjectType> {
    let mut types = Vec::new();

    // Git — casi siempre va primero porque combina con otros tipos
    if file_exists(dir, ".git") {
        types.push(ProjectType::Git);
    }

    // Node.js — package.json es el marcador estándar
    if file_exists(dir, "package.json") {
        types.push(ProjectType::Node);
    }

    // Rust — Cargo.toml en la raíz del crate
    if file_exists(dir, "Cargo.toml") {
        types.push(ProjectType::Rust);
    }

    // Python — requirements.txt O pyproject.toml O setup.py
    if file_exists(dir, "requirements.txt")
        || file_exists(dir, "pyproject.toml")
        || file_exists(dir, "setup.py")
    {
        types.push(ProjectType::Python);
    }

    // Docker — docker-compose.yml O docker-compose.yaml O Dockerfile
    if file_exists(dir, "docker-compose.yml")
        || file_exists(dir, "docker-compose.yaml")
        || file_exists(dir, "Dockerfile")
    {
        types.push(ProjectType::Docker);
    }

    // Go — go.mod es el marcador de módulo Go
    if file_exists(dir, "go.mod") {
        types.push(ProjectType::Go);
    }

    // Makefile — presente en muchos proyectos C/C++ y otros
    // Lo ponemos al final: es más genérico que los anteriores
    if file_exists(dir, "Makefile") {
        types.push(ProjectType::Make);
    }

    // Si no encontramos nada específico
    if types.is_empty() {
        types.push(ProjectType::Unknown);
    }

    types
}

// Genera la lista de comandos sugeridos según los tipos detectados.
// El orden importa: las sugerencias más relevantes van primero.
fn build_suggestions(types: &[ProjectType]) -> Vec<String> {
    let mut suggestions: Vec<String> = Vec::new();

    for t in types {
        match t {
            ProjectType::Git => {
                // Los más usados día a día van primero
                suggestions.extend([
                    "git status".to_string(),
                    "git add".to_string(),
                    "git commit".to_string(),
                    "git push".to_string(),
                    "git pull".to_string(),
                    "git log --oneline".to_string(),
                    "git diff".to_string(),
                    "git branch".to_string(),
                    "git checkout".to_string(),
                    "git stash".to_string(),
                ]);
            }
            ProjectType::Node => {
                suggestions.extend([
                    "npm install".to_string(),
                    "npm run dev".to_string(),
                    "npm run build".to_string(),
                    "npm test".to_string(),
                    "npm start".to_string(),
                    "npx".to_string(),
                    "node".to_string(),
                ]);
            }
            ProjectType::Rust => {
                suggestions.extend([
                    "cargo build".to_string(),
                    "cargo run".to_string(),
                    "cargo test".to_string(),
                    "cargo check".to_string(),
                    "cargo clippy".to_string(),
                    "cargo fmt".to_string(),
                    "cargo add".to_string(),
                ]);
            }
            ProjectType::Python => {
                suggestions.extend([
                    "python3".to_string(),
                    "pip install -r requirements.txt".to_string(),
                    "pip install".to_string(),
                    "python3 -m venv venv".to_string(),
                    "source venv/bin/activate".to_string(),
                    "pytest".to_string(),
                ]);
            }
            ProjectType::Docker => {
                suggestions.extend([
                    "docker compose up".to_string(),
                    "docker compose down".to_string(),
                    "docker compose build".to_string(),
                    "docker ps".to_string(),
                    "docker logs".to_string(),
                    "docker exec -it".to_string(),
                ]);
            }
            ProjectType::Go => {
                suggestions.extend([
                    "go run .".to_string(),
                    "go build".to_string(),
                    "go test ./...".to_string(),
                    "go mod tidy".to_string(),
                    "go get".to_string(),
                ]);
            }
            ProjectType::Make => {
                suggestions.extend([
                    "make".to_string(),
                    "make install".to_string(),
                    "make clean".to_string(),
                    "make test".to_string(),
                    "make help".to_string(),
                ]);
            }
            ProjectType::Unknown => {
                // Sin contexto específico: comandos de navegación básica
                suggestions.extend([
                    "ls".to_string(),
                    "pwd".to_string(),
                    "cat".to_string(),
                    "find".to_string(),
                ]);
            }
        }
    }

    suggestions
}

// Construye la etiqueta legible para la UI.
// Ej: [Git, Node] → "Git · Node.js"
fn build_label(types: &[ProjectType]) -> String {
    let parts: Vec<&str> = types.iter().map(|t| match t {
        ProjectType::Git     => "Git",
        ProjectType::Node    => "Node.js",
        ProjectType::Rust    => "Rust",
        ProjectType::Python  => "Python",
        ProjectType::Docker  => "Docker",
        ProjectType::Go      => "Go",
        ProjectType::Make    => "Make",
        ProjectType::Unknown => "—",
    }).collect();

    parts.join(" · ")
}

// ── Comando Tauri ──────────────────────────────────────────────────────────

// El frontend llama este comando cada vez que el CWD cambia.
// Recibe la ruta absoluta del directorio actual y devuelve el contexto detectado.
//
// Ejemplo de llamada desde JS:
//   const ctx = await invoke('detect_context', { path: '/Users/me/mi-proyecto' });
//   console.log(ctx.label);        // "Git · Rust"
//   console.log(ctx.suggestions);  // ["cargo build", "cargo run", ...]
#[tauri::command]
pub fn detect_context(path: String) -> ContextInfo {
    let types = detect_types(&path);

    // El tipo "principal" es el primero en la lista de prioridad.
    // Si detect_types devolvió vacío (nunca debería), usamos Unknown.
    let primary = types.first().cloned().unwrap_or(ProjectType::Unknown);

    let suggestions = build_suggestions(&types);
    let label = build_label(&types);

    ContextInfo {
        project_type: primary,
        project_types: types,
        suggestions,
        label,
    }
}

// ── Tests ──────────────────────────────────────────────────────────────────

// `cargo test` para verificar que la detección funciona sin abrir la app.
// Los tests usan el directorio real del proyecto Ocote (tiene .git + Cargo.toml).
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_directorio_ocote_es_git_y_rust() {
        // CARGO_MANIFEST_DIR apunta a src-tauri/ (donde está Cargo.toml).
        // El .git/ está en la raíz del repo, un nivel arriba.
        // Usamos el parent para que el test encuentre ambos marcadores.
        let manifest = std::env::var("CARGO_MANIFEST_DIR")
            .unwrap_or_else(|_| ".".to_string());
        let root = std::path::Path::new(&manifest)
            .parent()
            .map(|p| p.to_string_lossy().to_string())
            .unwrap_or(manifest.clone());

        // La raíz del repo tiene .git/ y src-tauri/Cargo.toml no está en ella,
        // pero sí el Cargo.toml del workspace (si existe). Probamos la raíz para git
        // y el manifest original para Rust.
        let ctx_root = detect_context(root);
        let ctx_rust = detect_context(manifest);

        // La raíz del repo debe detectar Git
        assert!(ctx_root.project_types.contains(&ProjectType::Git),
            "La raíz del repo debería detectar Git (.git/ existe)");

        // El directorio src-tauri debe detectar Rust (tiene Cargo.toml)
        assert!(ctx_rust.project_types.contains(&ProjectType::Rust),
            "src-tauri debería detectar Rust (Cargo.toml existe)");

        // En la raíz Git es el primero
        assert_eq!(ctx_root.project_type, ProjectType::Git);

        println!("Root label:       {}", ctx_root.label);
        println!("Root tipos:       {:?}", ctx_root.project_types);
        println!("Root sugerencias: {:?}", &ctx_root.suggestions[..5]);
        println!("Rust label:       {}", ctx_rust.label);
        println!("Rust sugerencias: {:?}", &ctx_rust.suggestions[..5]);

        // La raíz tiene sugerencias de git
        assert!(ctx_root.suggestions.iter().any(|s| s.contains("git")),
            "La raíz debe tener sugerencias de git");
        // src-tauri tiene sugerencias de cargo
        assert!(ctx_rust.suggestions.iter().any(|s| s.contains("cargo")),
            "src-tauri debe tener sugerencias de cargo");
    }

    #[test]
    fn test_directorio_desconocido() {
        // Un directorio sin archivos de proyecto conocidos
        let ctx = detect_context("/tmp".to_string());
        assert_eq!(ctx.project_type, ProjectType::Unknown);
        assert!(!ctx.suggestions.is_empty(), "Siempre debe haber sugerencias básicas");
    }

    #[test]
    fn test_label_multiples_tipos() {
        // Verificar que el label combina tipos correctamente
        let types = vec![ProjectType::Git, ProjectType::Node];
        let label = build_label(&types);
        assert_eq!(label, "Git · Node.js");
    }
}
