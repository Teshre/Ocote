# Changelog — Ocote

Todos los cambios notables del proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

### En progreso
- Fase 2: explorador de archivos lateral
- Fase 2: Command Knowledge Base en SQLite
- Screen buffer 2D para soporte de apps TUI (vim, htop, etc.)

---

## [0.2.0] — 2026-05-21 — Terminal interactiva funcional

Fase 1 completada. La terminal recibe input del usuario carácter a carácter, lo envía al PTY, y muestra el output con colores y cursor correcto.

### Agregado
- **Input directo al PTY** (`terminal.js` v2): el área de output captura el teclado directamente (`tabindex="0"`); cada tecla se envía al PTY de inmediato sin pasar por un `<input>` HTML
  - Soporte completo de secuencias: Ctrl+A–Z, Enter (`\r`), Backspace (`\x08`), Delete, Tab, Escape, flechas, Home, End, PageUp/Down, Insert
  - Tab-completion, historial con ↑ ↓ e inline editing con ← → funcionan nativamente vía ZLE
  - Ctrl+L limpia el DOM además de mandar `\x0c` al PTY
- **Cursor parpadeante** en la línea activa (`▋` naranja Ocote, solo visible con foco)
- **Borde naranja** en `#terminal-output:focus` para indicar que la terminal está activa
- Variables de entorno en `pty.rs`:
  - `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0` — sugerencias invisibles (mismo color que el fondo)
  - `fish_color_autosuggestion=000000` — equivalente para Fish shell
- Callback `onResponse` en `VtParser` para responder secuencias CPR (`\x1b[6n]`)
- `_clearToEnd()` en el parser para `\x1b[0J]` (p10k redraw del prompt)
- `_advanceLine()` en el parser: reutiliza divs DOM existentes al avanzar línea, evita el gap visual

### Corregido
- **Cuadro negro / gap en output**: `_newLine()` siempre agregaba al final del DOM aunque el cursor estuviera arriba; `_advanceLine()` lo resuelve reutilizando divs existentes
- **Comandos no visibles al escribir**: input HTML acumulaba texto; ZLE no hacía echo individual de cada carácter; solucionado con arquitectura char-by-char
- **Doble carácter al escribir** (ej. `ccd` en lugar de `cd`): zsh-autosuggestions inyectaba la sugerencia en el stream del PTY; solucionado con `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0`
- **Backspace movía cursor hacia la derecha**: combinación de `\x7f` reasignado en p10k + sugerencia cambiante; solucionado con `\x08` (BS) y fix de autosuggestions
- **Contenido borrado al escribir** (v6→v7): el CHA final (`\x1b[mG]`) post-contenido también limpiaba la línea; solucionado ignorando CHA completamente — solo `\x1b[K]` y `\r` borran

### Cambiado
- `vt_parser.js` reescrito de v1 a v7 con modelo de líneas DOM completo
- `terminal.js` reescrito de v1 (HTML input) a v2 (PTY directo)
- `theme.css`: eliminado `#terminal-input-line`, agregados estilos de foco y cursor

### Decisiones técnicas
- CHA (`\x1b[G]`) ignorado completamente: la limpieza la hace exclusivamente `\x1b[K]`. Patrón ZLE: `G(ignorar) → K(limpiar) → contenido → G(ignorar)`
- `\x08` en lugar de `\x7f` para Backspace: más robusto con distintas configuraciones de readline/p10k
- Screen buffer 2D diferido a Fase 2: el modelo de líneas DOM es suficiente para Fase 1

---

## [0.1.0] — 2026-05-21 — Arranque del proyecto

Primera sesión. El proyecto pasa de idea a ventana nativa abierta en macOS.

### Agregado
- Estructura completa del proyecto (Rust + Tauri v1 + HTML/CSS/JS)
- Backend Rust con módulos placeholder para las 4 fases:
  - `pty.rs` — PTY wrapper (Fase 1)
  - `vt_parser.rs` — Parser ANSI/VT (Fase 1)
  - `ckb.rs` — Command Knowledge Base (Fase 2)
  - `fs_explorer.rs` — Explorador de archivos (Fase 2)
  - `context.rs` — Detección de contexto (Fase 3)
- Frontend con lógica base funcional:
  - Historial de comandos con flechas arriba/abajo
  - Autocompletado: navegación con teclado, Tab/Enter para aceptar, Esc para cerrar
  - Tooltip: cierre con Esc y click fuera
  - Breadcrumb de ruta actual
- CKB inicial con 12 comandos en `ckb/commands.json`:
  - `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `cat`, `grep`, `git`, `npm`, `cargo`
- Tema oscuro completo con colores ANSI estándar y naranja Ocote (`#F5A623`)
- Íconos placeholder (naranja sólido, 512×512)
- Scripts de desarrollo: `pnpm dev` y `pnpm build`
- Documentación inicial: `docs/architecture.md`, `docs/devlog.md`, `docs/ckb-guide.md`

### Decisiones técnicas
- Tauri v1 sobre v2 (más documentación disponible)
- pnpm sobre npm (seguridad y eficiencia)
- JS vanilla sobre React/Vue (UI no justifica la complejidad)

### Entorno
- Rust 1.95.0 / Cargo 1.95.0
- Node.js 25.2.1 / pnpm 11.1.2
- Tauri 1.8.3
- macOS (Apple Silicon)
