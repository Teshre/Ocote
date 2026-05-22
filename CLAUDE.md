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

## Estado actual — 2026-05-21
**Fase 1 completada.** Terminal interactiva funcional con PTY real.

- zsh/bash conectado al PTY (`pty.rs` con `portable-pty`) ✅
- Output ANSI/VT renderizado en DOM (`vt_parser.js` v7) ✅
- Input carácter a carácter directo al PTY (`terminal.js` v2) ✅
- Tab-completion, historial, inline editing, Ctrl+C/D/L vía ZLE ✅
- Colores ANSI 16/256/truecolor, bold, italic, underline ✅
- Cursor parpadeante naranja en línea activa ✅
- Scroll automático al final ✅
- 10 commits en `main`, rama sin PRs pendientes

**Notas importantes para próximo agente:**
- `vt_parser.js` v7: CHA (`\x1b[G]`) está **ignorado completamente**. No revertir. Solo `\x1b[K]` y `\r` limpian líneas.
- `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0` en `pty.rs`: hace sugerencias invisibles. No remover — es intencional.
- Backspace usa `\x08` (no `\x7f`). No cambiar sin probar con p10k.
- El "comando desaparece después de Enter" es el transient prompt de p10k — es comportamiento esperado, no un bug.
- No hay screen buffer 2D todavía; apps TUI (vim, htop, fzf) no funcionarán bien hasta Fase 2.

**Próximo paso:** Fase 2
- Explorador de archivos lateral (`explorer.js` + `fs_explorer.rs`)
- Command Knowledge Base en SQLite (`ckb.rs` + `ckb/commands.json` → DB)
- Autocompletado visual con descripción del comando
- Screen buffer 2D para soporte de apps TUI

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
