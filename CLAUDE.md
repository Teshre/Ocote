# Ocote — Contexto del proyecto para Claude

## Qué es Ocote
Terminal de línea de comandos construida con Rust + Tauri. El objetivo es ser la terminal más accesible del mercado, desde principiantes absolutos hasta desarrolladores.

**Posicionamiento:** Anti-IA, determinista, offline-first. Toda la ayuda es local.  
**Mercado objetivo:** América Latina primero (español como lengua primaria).

## Stack técnico
- **Backend:** Rust (crates: `portable-pty`, `vte`, `rusqlite`, `serde`)
- **Frontend/UI:** Tauri + HTML/CSS/JS vanilla (sin frameworks)
- **Base de datos:** SQLite local vía `rusqlite`
- **Plataformas:** macOS, Windows, Linux

## Estructura del proyecto
```
src-tauri/src/
  main.rs          ← entry point Tauri, registra comandos
  pty.rs           ← PTY con portable-pty (Fase 1)
  vt_parser.rs     ← parser ANSI/VT con vte (Fase 1)
  ckb.rs           ← Command Knowledge Base / SQLite (Fase 2)
  fs_explorer.rs   ← árbol de archivos (Fase 2)
  context.rs       ← detección de contexto: git, node, etc. (Fase 3)
src-tauri/
  Cargo.toml       ← dependencias Rust
  tauri.conf.json  ← config de la app Tauri
frontend/
  index.html       ← layout principal
  terminal.js      ← render output + input handling
  explorer.js      ← panel lateral de archivos
  autocomplete.js  ← popup de sugerencias
  tooltip.js       ← card educativa de comandos
  theme.css        ← estilos
ckb/
  commands.json    ← fuente de datos de la CKB (~12 comandos de muestra, llegar a 80-200)
```

## Roadmap (4 fases, 12-18 meses)
- **Fase 1 (Meses 1-3):** Fundamentos Rust + PTY + parser VT + primera ventana Tauri
- **Fase 2 (Meses 4-7):** Renderer, explorador de archivos, CKB, autocompletado
- **Fase 3 (Meses 8-12):** Tooltip educativo, sugerencias contextuales, onboarding, distribución
- **Fase 4 (Meses 12-18):** Comunidad, devlog, lanzamiento, credibilidad técnica

## Estado actual
**Día 0 — Esqueleto creado, Rust no instalado todavía.**  
Próximo paso: instalar Rust con `rustup` y completar semanas 1-2 del roadmap (Rust Book caps. 1-6 + Rustlings).

## Cómo ayudar al desarrollador
- Es developer en aprendizaje, usa IA como asistente principal
- Tiene cero experiencia previa con Rust
- Prefiere explicaciones con código concreto comentado en Rust
- Si hay múltiples enfoques, explicar trade-offs brevemente
- **Importante:** señalar problemas de diseño ANTES de escribir código
- El código Rust debe tener comentarios explicando qué hace cada parte importante

## Diferenciadores clave
1. Sin IA en runtime — todo offline
2. Command Knowledge Base (CKB) en SQLite local
3. Explorador de archivos integrado con breadcrumb
4. Autocompletado visual con descripción del comando
5. Tooltip educativo (no invasivo, Esc para cerrar)
6. Sugerencias contextuales por heurísticas puras (sin ML)
