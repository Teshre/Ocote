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
  terminal.js      ← factory de instancias xterm.js + tracking de input
  tab-manager.js   ← barra de tabs, múltiples terminales (Fase 4)
  explorer.js      ← panel lateral de archivos + breadcrumb inferior
  autocomplete.js  ← popup de sugerencias
  tooltip.js       ← card educativa de comandos
  themes.js        ← paletas de color (10 temas) + applyTheme() (Fase 4)
  settings.js      ← modal de configuración: tema, tipografía, íconos, idioma (Fase 4)
  ui-i18n.js       ← strings de UI en 5 idiomas para settings/onboarding (Fase 4)
  icons.js         ← SVG paths de Tabler Icons + mapeo extensión→icono (Fase 4)
  onboarding.js    ← overlay de bienvenida al primer uso (Fase 3)
  theme.css        ← CSS variables + estilos base
ckb/
  commands.json    ← fuente de datos de la CKB (153 comandos × 5 idiomas)
```

## Roadmap (4 fases, 12-18 meses)
- **Fase 1 (Meses 1-3):** Fundamentos Rust + PTY + parser VT + primera ventana Tauri
- **Fase 2 (Meses 4-7):** Renderer, explorador de archivos, CKB, autocompletado
- **Fase 3 (Meses 8-12):** Tooltip educativo, sugerencias contextuales, onboarding, distribución
- **Fase 4 (Meses 12-18):** Comunidad, devlog, lanzamiento, credibilidad técnica

## Estado actual — 2026-05-25
**Fases 2 y 3 COMPLETADAS. Fase 4 en progreso avanzado.**

- zsh/bash conectado al PTY (`pty.rs` con `portable-pty`) ✅
- xterm.js renderizado (migrado desde parser VT custom) ✅
- Input carácter a carácter directo al PTY (`terminal.js`) ✅
- Tab-completion, historial, inline editing, Ctrl+C/D/L vía ZLE ✅
- Explorador de archivos lateral con cache (`explorer.js` + `fs_explorer.rs`) ✅
- Sincronización bidireccional terminal↔explorador (fast-path + polling) ✅
- CKB en SQLite con **153 comandos** en **5 idiomas** (ES/EN/PT/FR/DE) ✅
- Autocompletado visual posicionado debajo del cursor (`autocomplete.js`) ✅
- Tooltip educativo funcional con argumentos (`tooltip.js`) ✅
- **Múltiples terminales** en tabs (`tab-manager.js`): Ctrl+T nuevo tab, Ctrl+W cerrar ✅
- **10 temas de color** (`themes.js`): Ocote Dark/Light, Dracula, One Dark, Monokai, Solarized Dark/Light, Gruvbox, Nord, Tokyo Night ✅
- **Panel de configuración** (`settings.js`): modal centrado con tabs General y Apariencia ✅
- **UI traducida** (`ui-i18n.js`): settings, onboarding y breadcrumb en 5 idiomas ✅
- **Breadcrumb navegable** en el explorador: segmentos clicables, dropdown al hover, abreviados si son largos ✅
- **Nerd Fonts** bundleadas: JetBrainsMono NF, FiraCode NF, MesloLGS NF — íconos de p10k/oh-my-zsh funcionan ✅

---

## Notas críticas para el próximo agente

### Arquitectura de tabs (IMPORTANTE — leer primero)
- **`window.ocoteTerminal` está OBSOLETO** desde que se implementaron múltiples tabs.
- Cada terminal vive en `window.TAB_MANAGER.getAllTabs()` → array de `[shellId, { term, fitAddon, element, container, name }]`.
- `window.ocoteActiveShellId` → shell ID del tab actualmente visible.
- Para aplicar algo a todos los tabs: `window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => { tab.term.options.X = Y; })`.
- Para el tab activo: `window.TAB_MANAGER.getTab(window.ocoteActiveShellId)`.
- El tab recibe su nombre del basename del CWD al crearse. Se actualiza en cada `cd` del explorador.

### Sistema de temas
- Cada tema tiene dos objetos: `xterm` (paleta para xterm.js) y `css` (CSS variables para la UI).
- `window.OCOTE_THEMES.applyTheme(themeId)` aplica ambos a la vez — itera todos los tabs activos.
- `themes.js` **debe cargarse ANTES** que `terminal.js` y `tab-manager.js` en `index.html` — así el primer tab nace con el tema guardado.
- El tema se persiste en `localStorage('ocote_theme')`. Al crear un nuevo tab, `createTerminalInstance()` lee este valor.

### Notas generales
- `vt_parser.js` fue eliminado en v0.3.0. xterm.js maneja todo el renderizado.
- `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0` en `pty.rs`: hace sugerencias invisibles. No remover.
- Backspace usa `\x08` (no `\x7f`). No cambiar sin probar con p10k.
- Cache de directorios en `explorer.js`: `dirCache` guarda entradas por 30s. TTL en `CACHE_TTL_MS`.
- `fs_explorer.rs` usa `file_type()` (no `metadata()`) para performance.
- Tooltip funciona con argumentos (`cd`, `git status`) gracias a `currentCommandLine` separado de `currentInput`.
- Popup de autocompletado se posiciona debajo del cursor usando `cursorY` y `lineHeight` de xterm.js.
- `get_command_info(name, lang)` → `Option<CommandResponse>` — `null` si no está en CKB.
- `get_suggestions(prefix, lang)` → `Vec<CommandResponse>` — `description` ya resuelta en el idioma pedido.
- `lang_column(lang)` en `ckb.rs` es whitelist explícita: nunca interpola user input en SQL.
- `window._explorerRefresh()`: re-renderiza la vista actual sin ir al backend. Usado al cambiar tema de íconos.
- `window.I18N.apply()`: re-aplica los strings de UI al idioma activo. Llamado al cambiar idioma en settings.

### Sistema de íconos del explorador
- `frontend/icons.js`: 15 iconos SVG outline de Tabler Icons (MIT). `getIconForFile(name)` y `getIconForFolder(name)` devuelven `{ svg, color }`.
- Tema `seti`: SVGs outline con `stroke="currentColor"`, color específico por tipo de archivo/carpeta.
- Tema `badge`: etiquetas de texto cortas (`.PY`, `.RS`, `ENV`) sobre fondo de color.
- `getIconTheme()` en `explorer.js` lee `localStorage('ocote_icon_theme')`.

---

**Fase 3 COMPLETADA — 2026-05-23:**

✅ **Detección de contexto** (`context.rs`): `detect_context(path)` detecta Git, Node, Rust, Python, Docker, Go, Make. 3 tests pasando.
✅ **Contexto en autocompletado**: sugerencias contextuales primero (badge naranja), luego CKB. Cache por CWD.
✅ **Onboarding**: overlay animado al primer uso, grid 2×2 de features, `localStorage`. Ctrl+Shift+? para volver a verlo.
✅ **Soporte TUI**: `resize_pty(rows, cols)` sincroniza tamaño PTY↔xterm.js vía SIGWINCH. vim, nano, htop, fzf, tmux en CKB.
✅ **Distribución**: GitHub Actions compila macOS (.dmg), Windows (.exe NSIS), Linux (.AppImage/.deb) al hacer `git tag vX.Y.Z && git push origin vX.Y.Z`.

**Fase 4 — Avance al 2026-05-25:**

✅ **CKB multilenguaje**: 153 comandos × 5 idiomas (ES/EN/PT/FR/DE) en SQLite.
✅ **Tooltip traducido**: `UI_STRINGS` + `getUI()` en `tooltip.js` — etiquetas de UI en 5 idiomas.
✅ **Íconos SVG en explorador**: Tabler Icons outline, 80+ extensiones y 80+ carpetas con colores específicos.
✅ **Panel de configuración**: modal centrado, tabs General (idioma) y Apariencia (tema, tipografía, íconos). Se abre con el botón ⚙ en el breadcrumb.
✅ **10 temas de color**: Ocote Dark/Light, Dracula, One Dark, Monokai, Solarized Dark/Light, Gruvbox Dark, Nord, Tokyo Night.
✅ **Nerd Fonts bundleadas**: JetBrainsMono NF, FiraCode NF, MesloLGS NF — cargadas como `@font-face` desde `lib/fonts/`.
✅ **UI internacionalizada**: `ui-i18n.js` traduce labels de settings, onboarding y breadcrumb a ES/EN/PT/FR/DE.
✅ **Breadcrumb navegable en explorador**: segmentos clicables (van directamente a ese directorio), dropdown con subdirectorios al hover/click, segmentos intermedios abreviados a inicial + `.`.
✅ **Múltiples terminales en tabs**: `tab-manager.js` gestiona N tabs independientes. Cada tab = un proceso shell PTY separado. El tab toma el nombre del CWD actual.
✅ **Sincronización tema xterm.js**: al cambiar tema en settings, todos los tabs activos actualizan su paleta de colores (fondo, texto, ANSI). Tabs nuevos nacen con el tema guardado.

**Próximo paso — Fase 4:**
1. Ícono real de Ocote (diseño propio)
2. Landing page / sitio web
3. Firma de código macOS (Apple Developer ID) para distribuir sin Gatekeeper
4. Auto-updater (cuando el ícono y firma estén listos)

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
