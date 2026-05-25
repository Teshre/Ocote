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
  vt_parser.rs     ← parser ANSI/VT con vte (Fase 1, eliminado en v0.3.0)
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
  commands.json    ← fuente de datos de la CKB (76 comandos, objetivo 100-200)
```

## Roadmap (4 fases, 12-18 meses)
- **Fase 1 (Meses 1-3):** Fundamentos Rust + PTY + parser VT + primera ventana Tauri
- **Fase 2 (Meses 4-7):** Renderer, explorador de archivos, CKB, autocompletado
- **Fase 3 (Meses 8-12):** Tooltip educativo, sugerencias contextuales, onboarding, distribución
- **Fase 4 (Meses 12-18):** Comunidad, devlog, lanzamiento, credibilidad técnica

## Estado actual — 2026-05-24
**Fases 2 y 3 COMPLETADAS. Fase 4 iniciada.**

- zsh/bash conectado al PTY (`pty.rs` con `portable-pty`) ✅
- xterm.js renderizado (migrado desde parser VT custom) ✅
- Input carácter a carácter directo al PTY (`terminal.js` v2) ✅
- Tab-completion, historial, inline editing, Ctrl+C/D/L vía ZLE ✅
- Explorador de archivos lateral con cache (`explorer.js` + `fs_explorer.rs`) ✅
- Sincronización bidireccional terminal↔explorador (fast-path + polling) ✅
- CKB en SQLite con **153 comandos** en **5 idiomas** (ES/EN/PT/FR/DE) ✅
- Autocompletado visual posicionado debajo del cursor (`autocomplete.js` + `window.ocoteTerminal`) ✅
- Tooltip educativo funcional con argumentos (`tooltip.js`) ✅
- Selector de idioma en el breadcrumb (ES/EN/PT/FR/DE), persiste en `localStorage('ocote_lang')` ✅

**Notas importantes para próximo agente:**
- `vt_parser.js` fue eliminado por completo en v0.3.0. xterm.js maneja todo el renderizado.
- `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0` en `pty.rs`: hace sugerencias invisibles. No remover.
- Backspace usa `\x08` (no `\x7f`). No cambiar sin probar con p10k.
- El "comando desaparece después de Enter" es el transient prompt de p10k — comportamiento esperado.
- Cache de directorios en `explorer.js`: `dirCache` guarda entradas por 30s. TTL en `CACHE_TTL_MS`.
- `fs_explorer.rs` usa `file_type()` (no `metadata()`) para performance.
- Tooltip aparece al ejecutar comando (Enter). Funciona con argumentos (`cd`, `git status`) gracias a `currentCommandLine`.
- `terminal.js` expone `window.ocoteTerminal` para que `autocomplete.js` lea coordenadas del cursor (posicionamiento dinámico).
- Popup de autocompletado se posiciona dinámicamente debajo del cursor usando `cursorY` y `lineHeight` de xterm.js.
- `get_command_info(name, lang)` devuelve `Option<CommandResponse>` — `null` si no está en CKB.
- `get_suggestions(prefix, lang)` devuelve `Vec<CommandResponse>` — `description` ya resuelta en el idioma pedido.
- `lang_column(lang)` en `ckb.rs` es whitelist explícita: nunca interpola user input en SQL.
- `explorer.js` apunta a `#breadcrumb-path` (span dentro de `#breadcrumb`), no a `#breadcrumb`.
- Selector de idioma es un script inline en `index.html` (no necesita archivo separado).

**Fase 3 COMPLETADA — 2026-05-23:**

✅ **Detección de contexto** (`context.rs`): `detect_context(path)` detecta Git, Node, Rust, Python, Docker, Go, Make. 3 tests pasando.
✅ **Contexto en autocompletado**: sugerencias contextuales primero (badge naranja), luego CKB. Cache por CWD.
✅ **Onboarding**: overlay animado al primer uso, grid 2×2 de features, `localStorage`. Ctrl+Shift+? para volver a verlo.
✅ **Soporte TUI**: `resize_pty(rows, cols)` sincroniza tamaño PTY↔xterm.js vía SIGWINCH. vim, nano, htop, fzf, tmux en CKB.
✅ **Distribución**: GitHub Actions compila macOS (.dmg), Windows (.exe NSIS), Linux (.AppImage/.deb) al hacer `git tag vX.Y.Z && git push origin vX.Y.Z`.

**Fase 4 en progreso — 2026-05-24:**

✅ **CKB multilenguaje**: 153 comandos × 5 idiomas (ES/EN/PT/FR/DE) en SQLite.
✅ **Selector de idioma** en breadcrumb — botones ES/EN/PT/FR/DE, preferencia en `localStorage('ocote_lang')`.
✅ **Tooltip traducido**: `UI_STRINGS` en `tooltip.js` con las 5 lenguas. `getUI()` devuelve el mapa activo. Las etiquetas "Flags comunes", "Ejemplo" y el hint de cierre cambian con el idioma.
✅ **Sistema dual de íconos en explorador**: tema `seti` (SVGs outline de Tabler Icons) vs tema `badge` (etiquetas de texto). `getIconTheme()` lee `localStorage('ocote_icon_theme')`. `window._explorerRefresh()` re-renderiza sin ir al backend.
- `frontend/icons.js`: 15 iconos base (folder, file, fileCode, photo, music, video, zip, database, settings, pdf, terminal, table, markdown, folderOpen) con paths SVG de Tabler Icons (MIT license)
- 80+ extensiones de archivo mapeadas a icono + color por lenguaje/tipo
- 80+ nombres de carpeta con colores específicos (src→azul, node_modules→morado, test→verde, etc.)
- SVGs usan `stroke="currentColor"` + `fill="none"` (outline icons), color heredado del contenedor

**Notas adicionales para el explorador:**
- `FILE_COLORS`: ~80 pares `[fill, fold]` por extensión (.rs, .py, .js, .ts, .json, etc.) — aún usados para tema "badge"
- `SPECIAL_FILE_COLORS`: ~40 archivos especiales (Cargo.toml, package.json, .env, Dockerfile, etc.) — aún usados para tema "badge"
- `FOLDER_COLORS`: ~40 nombres de carpeta → color (src→azul, test→verde, node_modules→morado, .git→rojo)
- Funciones legacy `svgFileLegacy()` y `svgFolderLegacy()` mantenidas como fallback si `icons.js` no carga

**Próximo paso prioritario — Fase 4:**
1. Selector de tipografía desde la UI (JetBrains Mono, Fira Code, Cascadia, etc.), `localStorage('ocote_font')`
2. Ícono real de Ocote (diseño propio)
3. Landing page / sitio web
4. Firma de código macOS (Apple Developer ID) para distribuir sin Gatekeeper
5. Auto-updater (cuando el ícono y firma estén listos)

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
