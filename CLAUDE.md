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
  main.rs            ← entry point Tauri, registra comandos
  pty.rs             ← PTY con portable-pty; create_shell(rows,cols,prompt,accent)
  ckb.rs             ← Command Knowledge Base / SQLite
  fs_explorer.rs     ← árbol de archivos
  context.rs         ← detección de contexto: git, node, rust, etc.
src-tauri/resources/
  shell/
    .zshenv          ← ZDOTDIR wrapper: sourcea .zshenv usuario, setea POWERLEVEL9K_INSTANT_PROMPT=off
    .zshrc           ← Bootstrap: (1) config usuario (2) prompt.zsh (3) syntax highlighting
    prompt.zsh       ← Hook de prompt: OSC 6731 + OSC 133 + PS1 por preset
    bash-hook.bash   ← Equivalente bash (cargado via --rcfile)
  zsh-syntax-highlighting/  ← Plugin BSD bundleado
src-tauri/
  Cargo.toml
  tauri.conf.json
frontend/
  index.html         ← layout principal; orden de scripts crítico (ver abajo)
  themes.js          ← 10 temas + tokens semánticos + getCurrentTokens()
  prompt.js          ← Decoration API: renders HTML por preset + previewHtml()
  terminal.js        ← factory xterm.js + OSC handlers (6731, 133) en bindTerminalShell()
  tab-manager.js     ← barra de tabs, múltiples terminales
  explorer.js        ← panel lateral de archivos + breadcrumb inferior
  autocomplete.js    ← popup de sugerencias
  tooltip.js         ← card educativa de comandos
  settings.js        ← modal de configuración + prompt picker con previews
  ui-i18n.js         ← strings de UI en 5 idiomas (ES/EN/PT/FR/DE)
  icons.js           ← SVG paths de Tabler Icons + mapeo extensión→icono
  onboarding.js      ← overlay de bienvenida al primer uso
  theme.css          ← CSS variables + estilos base
ckb/
  commands.json      ← fuente de datos CKB (153 comandos × 5 idiomas)
```

## Roadmap (4 fases, 12-18 meses)
- **Fase 1 (Meses 1-3):** Fundamentos Rust + PTY + parser VT + primera ventana Tauri
- **Fase 2 (Meses 4-7):** Renderer, explorador de archivos, CKB, autocompletado
- **Fase 3 (Meses 8-12):** Tooltip educativo, sugerencias contextuales, onboarding, distribución
- **Fase 4 (Meses 12-18):** Comunidad, devlog, lanzamiento, credibilidad técnica

## Estado actual — 2026-05-29
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
- **Panel de configuración** (`settings.js`): modal centrado, tabs General y Apariencia ✅
- **UI traducida** (`ui-i18n.js`): settings, onboarding y breadcrumb en 5 idiomas ✅
- **Breadcrumb navegable** en el explorador: segmentos clicables, dropdown al hover, abreviados si son largos ✅
- **Nerd Fonts** bundleadas: JetBrainsMono NF, FiraCode NF, MesloLGS NF ✅
- **Sistema de prompt nativo** con Decoration API + 5 presets ✅ ← NUEVO
- **Zsh-syntax-highlighting** bundleado (BSD) ✅ ← NUEVO

---

## Notas críticas para el próximo agente

### Orden de carga de scripts (CRÍTICO)
```html
<script src="themes.js"></script>   ← 1º: define OCOTE_THEMES + tokens antes que cualquier terminal
<script src="prompt.js"></script>   ← 2º: define OCOTE_PROMPT antes que terminal.js registre OSC handlers
<script src="terminal.js"></script> ← 3º: bindTerminalShell() registra los OSC handlers que llaman OCOTE_PROMPT
<script src="tab-manager.js"></script> ← 4º: crea el primer tab (ya con OCOTE_THEMES y OCOTE_PROMPT listos)
```

### Sistema de prompt (IMPORTANTE — leer antes de tocar)

**Arquitectura (diseño aprobado en Claude Design):**
```
zsh precmd → OSC 6731 {"cwd","branch","dirty","time","exit"}
           → PROMPT = [OSC 133 A]\n❯
                              ↓
terminal.js → registerOscHandler(6731) → guarda pendingMeta
terminal.js → registerOscHandler(133, 'A') → llama OCOTE_PROMPT.renderPrompt(term, meta)
                              ↓
prompt.js → term.registerDecoration({marker, height:1, layer:'top'})
          → pinta HTML overlay sobre la línea de info (encima del ❯)
```

**Presets disponibles** (guardados en `localStorage('ocote_prompt')`):
| Preset | PS1 | Decoration |
|--------|-----|------------|
| `pill` | `\n❯` | Cápsulas con glassmorphism: path + git + hora |
| `block` | `\n❯` | Header de contexto + frame del output (onCommandEnd) |
| `ribbon` | `\n❯` | Subrayado 1.5px con gradiente accent→transparent |
| `rail` | `\n❯` | Stripe vertical 3px + info en línea |
| `minimal` | ANSI completo (ruta + git + hora + ❯) | ninguna (returns null) |
| `passthrough` | prompt nativo del usuario | ninguna (hook retorna temprano) |

**Por qué OSC 133 A va embebido en PROMPT (no en precmd):**
Si se emite en precmd, el timing es ambiguo — cuando el handler JS llama `registerMarker(0)`, xterm.js puede haber ya procesado el `\n❯` del PS1 y el cursor estar en la línea del ❯. La decoration quedaría tapando el ❯. Al embeber `\033]133;A\007` al inicio del string PROMPT, la secuencia dentro de `write()` es determinística: OSC 133 A dispara → cursor en línea P (info) → `\n` mueve a P+1 → `❯` en P+1. Decoration en P, ❯ en P+1.

**Variables de entorno que pty.rs inyecta al shell:**
- `OCOTE_PROMPT_PRESET` — preset elegido (`pill`|`block`|`minimal`|`ribbon`|`rail`|`passthrough`)
- `OCOTE_ACCENT` — hex del accent del tema SIN `#` (e.g. `E8843A`)
- `OCOTE_PROMPT_HOOK` — ruta absoluta a `resources/shell/prompt.zsh`
- `OCOTE_ZSH_HL` — ruta absoluta a `zsh-syntax-highlighting.zsh`
- `_OCOTE_ZDOTDIR` — ZDOTDIR real del usuario (o `$HOME`) para que el bootstrap sourcee su config

**Bootstrap ZDOTDIR (crítico):**
El `.zshenv` en `resources/shell/` NO reasigna permanentemente ZDOTDIR. Sourcea el `.zshenv` del usuario con su ZDOTDIR temporal y restaura el nuestro para que zsh lea nuestro `.zshrc`. Si se cambia este orden, zsh leería el `.zshrc` del usuario y nunca el bootstrap de Ocote → terminal vacía.

**Colores del prompt:**
Los renders NO hardcodean colores. Todos usan `OCOTE_THEMES.getCurrentTokens()` que devuelve `{accent, green, blue, comment, warning, fg}` del tema activo. La FORMA identifica a Ocote; el COLOR hereda del tema.

**API de `window.OCOTE_PROMPT`:**
- `renderPrompt(term, meta)` — pinta la decoration HTML en la línea de info
- `onCommandStart(term)` — para Block: guarda posición inicial del output
- `onCommandEnd(term, exitCode)` — para Block: pinta el frame con borde accent/rojo
- `refresh()` — limpia texture atlas para re-renderizar con nuevo tema/preset
- `previewHtml(presetId, meta, tokens)` — devuelve HTML para el picker de settings (minimal tiene preview especial aunque no use decoration en terminal)

### Arquitectura de tabs
- **`window.ocoteTerminal` está OBSOLETO.** Cada terminal vive en `window.TAB_MANAGER.getAllTabs()`.
- `window.ocoteActiveShellId` → shell ID del tab actualmente visible.
- Para aplicar algo a todos los tabs: `window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => { ... })`.
- `create_shell` en Rust recibe: `rows`, `cols`, `prompt` (preset), `accent` (hex sin #).
- tab-manager.js lee `localStorage('ocote_theme')` para extraer el accent antes de llamar `create_shell`.

### Sistema de temas
- Cada tema tiene: `xterm` (paleta xterm.js), `css` (CSS variables), y ahora también `tokens` en `OCOTE_THEMES.TOKENS`.
- `window.OCOTE_THEMES.getCurrentTokens()` → `{accent, green, blue, comment, warning, fg}` del tema activo.
- `window.OCOTE_THEMES.applyTheme(themeId)` llama `OCOTE_PROMPT.refresh()` al final para repintar decorations.
- `themes.js` **debe cargarse PRIMERO** (antes de `prompt.js`, `terminal.js`, `tab-manager.js`).
- Tokens semánticos por tema en `OCOTE_THEMES.TOKENS` (tabla de diseño aprobada por Claude Design).

### Notas generales
- `vt_parser.js` fue eliminado en v0.3.0. xterm.js maneja todo el renderizado.
- Backspace usa `\x08` (no `\x7f`). No cambiar sin probar con p10k.
- Cache de directorios en `explorer.js`: `dirCache` guarda entradas por 30s.
- `fs_explorer.rs` usa `file_type()` (no `metadata()`) para performance.
- Tooltip funciona con argumentos gracias a `currentCommandLine` separado de `currentInput`.
- Popup de autocompletado se posiciona debajo del cursor usando `cursorY` y `lineHeight`.
- `get_command_info(name, lang)` → `Option<CommandResponse>` — `null` si no está en CKB.
- `get_suggestions(prefix, lang)` → `Vec<CommandResponse>` — description resuelta en el idioma pedido.
- `lang_column(lang)` en `ckb.rs` es whitelist explícita: nunca interpola user input en SQL.
- `window._explorerRefresh()`: re-renderiza la vista actual sin ir al backend.
- `window.I18N.apply()`: re-aplica los strings de UI al idioma activo.

### Sistema de íconos del explorador
- `frontend/icons.js`: 15 iconos SVG outline de Tabler Icons (MIT).
- Tema `seti`: SVGs outline con `stroke="currentColor"`, color específico por tipo.
- Tema `badge`: etiquetas de texto cortas sobre fondo de color.
- `getIconTheme()` en `explorer.js` lee `localStorage('ocote_icon_theme')`.

---

## Historial de avances

**Fase 3 COMPLETADA — 2026-05-23:**
✅ Detección de contexto (`context.rs`): Git, Node, Rust, Python, Docker, Go, Make.
✅ Contexto en autocompletado: sugerencias contextuales primero (badge naranja), luego CKB.
✅ Onboarding: overlay animado al primer uso, grid 2×2. Ctrl+Shift+? para volver a verlo.
✅ Soporte TUI: `resize_pty(rows, cols)` sincroniza tamaño PTY↔xterm.js vía SIGWINCH.
✅ Distribución: GitHub Actions compila macOS (.dmg), Windows (.exe NSIS), Linux (.AppImage/.deb).

**Fase 4 — Avance al 2026-05-25:**
✅ CKB multilenguaje: 153 comandos × 5 idiomas en SQLite.
✅ Tooltip traducido: etiquetas de UI en 5 idiomas.
✅ Íconos SVG en explorador: Tabler Icons outline, 80+ extensiones y carpetas.
✅ Panel de configuración: modal centrado, tabs General y Apariencia.
✅ 10 temas de color con paleta oficial Ocote (ember #E8843A / charcoal #14100C).
✅ Nerd Fonts bundleadas: JetBrainsMono NF, FiraCode NF, MesloLGS NF.
✅ UI internacionalizada: ui-i18n.js traduce a ES/EN/PT/FR/DE.
✅ Breadcrumb navegable en explorador.
✅ Múltiples terminales en tabs.
✅ Sincronización tema xterm.js en todos los tabs.

**Fase 4 — Avance al 2026-05-29:**
✅ **Sistema de prompt nativo con Decoration API** — 5 presets aprobados en Claude Design:
  - `pill`: cápsulas con glassmorphism (signature de Ocote)
  - `block`: header de contexto + frame del output (modo Pro, estilo Warp)
  - `minimal`: ANSI puro, tipografía limpia
  - `ribbon`: subrayado con gradiente
  - `rail`: stripe vertical + info en línea
  - `passthrough`: respeta p10k / oh-my-zsh del usuario
✅ **Picker de prompts** en Settings → Apariencia: cards con preview en vivo, preview grande al seleccionar.
✅ **Bootstrap ZDOTDIR correcto**: `.zshenv` mantiene ZDOTDIR apuntando al directorio de Ocote hasta que `.zshrc` se carga; nunca lo reasigna prematuramente.
✅ **zsh-syntax-highlighting** bundleado (BSD): resalta comandos en la terminal en tiempo real.
✅ **Tokens semánticos** en `themes.js`: `getCurrentTokens()` devuelve accent/green/blue/comment/warning/fg del tema activo para los renders de prompt.
✅ **OSC 6731 + OSC 133** (Shell Integration): shell emite datos estructurados que `terminal.js` captura y pasa a `prompt.js` para las decorations.
✅ **Fix timing Decoration API**: OSC 133 A embebido en el PROMPT (no en precmd) para garantizar que el marker se registre en la línea de info, no en la línea del ❯.

**Próximo paso — Fase 4:**
1. Verificar prompts en producción (pnpm tauri build)
2. Ícono real de Ocote (diseño propio) — About Ocote sigue mostrando el ícono de macOS por caché
3. Landing page / sitio web
4. Firma de código macOS (Apple Developer ID) para distribuir sin Gatekeeper
5. Auto-updater

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
7. **Sistema de prompt visual** con 5 presets HTML (Decoration API xterm.js)
