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
  themes.js          ← 8 temas oficiales generados desde OCOTE_THEME_DATA (base16)
  prompt.js          ← overlay HTML por preset + previewHtml()
  terminal.js        ← factory xterm.js + OSC handlers (6731, 133) en bindTerminalShell()
  tab-manager.js     ← barra de tabs, múltiples terminales
  explorer.js        ← panel lateral, breadcrumb, menú contextual, operaciones de archivo
  autocomplete.js    ← popup de sugerencias
  tooltip.js         ← card educativa de comandos
  settings.js        ← modal de configuración + prompt/icon pickers con previews en vivo
  ui-i18n.js         ← strings de UI en 5 idiomas (ES/EN/PT/FR/DE)
  icons.js           ← SVG Tabler Icons + 5 temas (Outline/Badge/Ember/Brand/Symbols)
  onboarding.js      ← overlay de bienvenida al primer uso
  preview.js         ← panel de preview de archivos (código con hljs, imágenes, binarios)
  resizer.js         ← drag-to-resize de los 3 paneles; persiste en localStorage
  theme.css          ← CSS variables + estilos base
  lib/
    highlight.min.js ← highlight.js (colorear código en preview)
    atom-one-dark.css← tema visual de highlight.js
ckb/
  commands.json      ← fuente de datos CKB (153 comandos × 5 idiomas)
```

## Roadmap (4 fases, 12-18 meses)
- **Fase 1 (Meses 1-3):** Fundamentos Rust + PTY + parser VT + primera ventana Tauri
- **Fase 2 (Meses 4-7):** Renderer, explorador de archivos, CKB, autocompletado
- **Fase 3 (Meses 8-12):** Tooltip educativo, sugerencias contextuales, onboarding, distribución
- **Fase 4 (Meses 12-18):** Comunidad, devlog, lanzamiento, credibilidad técnica

## Estado actual — 2026-06-03
**Fases 2 y 3 COMPLETADAS. Fase 4 en progreso avanzado.**

- zsh/bash conectado al PTY (`pty.rs` con `portable-pty`) ✅
- xterm.js renderizado (migrado desde parser VT custom) ✅
- Input carácter a carácter directo al PTY (`terminal.js`) ✅
- Tab-completion, historial, inline editing, Ctrl+C/D/L vía ZLE ✅
- Explorador de archivos lateral con cache (`explorer.js` + `fs_explorer.rs`) ✅
- Sincronización terminal→explorador vía OSC 6731 (cwd real del shell) + polling ✅
- CKB en SQLite con **153 comandos** en **5 idiomas** (ES/EN/PT/FR/DE) ✅
- Autocompletado visual posicionado debajo del cursor (`autocomplete.js`) ✅
- Tooltip educativo funcional con argumentos (`tooltip.js`) ✅
- **Múltiples terminales** en tabs (`tab-manager.js`): Ctrl+T nuevo tab, Ctrl+W cerrar ✅
- **8 temas oficiales de Ocote** (`themes.js`): Ocote, Brasa, Bosque, Noche, Papel, Tinta, Mezcal, Cacao — paletas originales base16 ✅
- **Panel de configuración** (`settings.js`): modal centrado, tabs General y Apariencia ✅
- **UI traducida** (`ui-i18n.js`): settings, onboarding y breadcrumb en 5 idiomas ✅
- **Breadcrumb navegable** en el explorador: segmentos clicables, dropdown al hover, abreviados si son largos ✅
- **Nerd Fonts** bundleadas: JetBrainsMono NF, FiraCode NF, MesloLGS NF ✅
- **Sistema de prompt nativo** con overlay HTML propio + 5 presets ✅
- **Body overlay Block/Rail**: cubre visualmente toda la salida del comando (no solo header) ✅
- **Zsh-syntax-highlighting** bundleado (BSD) ✅
- **fzf v0.73.1** bundleado (Ctrl+R historial, Option+C/Alt+C cd fuzzy) — 5 plataformas ✅
- **zoxide v0.9.9** (`z` cd inteligente) + **bat v0.26.1** bundleados, en las 4 shells ✅
- **zsh-autosuggestions v0.7.0** bundleado (texto fantasma, → acepta estilo fish) ✅
- **Soporte 4 shells**: zsh (completo), bash (prompt+overlays+fzf), fish y PowerShell (prompt+overlays+fzf, highlighting/suggestions nativos) ✅
- **Ícono light/dark** seleccionable en Settings (`set_app_icon`) ✅
- **Ajustes de terminal**: tamaño de fuente, cursor, scrollback ✅
- **Menú contextual** del explorador con íconos SVG Tabler, hover accent, grupo "Crear" ✅
- **Operaciones de archivo**: crear, renombrar inline, eliminar con confirmación nativa HTML ✅
- **Preview de archivos** (`preview.js`): código con highlight.js, imágenes en base64, doble-click ✅
- **Panel colapsable** (Ctrl+B) y **redimensionamiento de los 3 paneles** (`resizer.js`) ✅
- **5 temas de íconos** en el explorador: Outline, Badge, Ember, Brand, Symbols ✅
- **Preview de íconos en Settings**: cuadrícula en vivo al cambiar tema, sin salir del modal ✅

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

**Arquitectura: ANSI fallback + Overlay HTML propio (sin Decoration API)**

La Decoration API de xterm.js fue descartada: `registerDecoration` corrompe el canvas renderer. En su lugar, Ocote usa su propio overlay system: divs DOM posicionados sobre el canvas sin pasar por xterm.js.

```
zsh precmd → OSC 6731 JSON {cwd, branch, dirty, time, exit}
           → PROMPT = [línea info ANSI (fallback)]\n[❯ ANSI][OSC 133 A]
                                                              ↓
terminal.js → OSC 133 A handler (cursor en fila ❯)
            → infoAbsRow = cursorAbsRow - 1
            → OCOTE_PROMPT.showPromptOverlay(term, meta, infoAbsRow)
                                              ↓
prompt.js → crea <div class="ocote-ol"> sobre .xterm-screen
          → position:absolute, top: viewportRow * rowPx
          → background: termBg() (cubre texto ANSI debajo)
          → innerHTML = _termRenders[preset](meta, tokens)
```

**Por qué OSC 133 A va al FINAL del PROMPT (después de ❯):**
El cursor queda en la fila del ❯. `infoAbsRow = chevronRow - 1` es siempre la fila info sin importar el scroll o el PROMPT_SP de zsh. Si se pusiera al inicio, tendría que predecir dónde terminará el cursor después de procesar `\n❯`.

**Presets** (guardados en `localStorage('ocote_prompt')`):
| Preset | ANSI fallback | Overlay HTML |
|--------|--------------|-------------|
| `minimal` | `path git · hora \n ❯` | ninguno |
| `pill` | `[path bg] ◖ git ◗ · hora \n ❯` | cápsulas glassmorphism |
| `ribbon` | `path_ git · hora \n ❯` | subrayado gradiente |
| `rail` | `│ path · git · hora \n ❯` | riel vertical 3px |
| `block` | `┌─ path · git · hora \n ❯` | header de card con borde accent |
| `passthrough` | prompt nativo | ninguno |

**Overlay management (`prompt.js`):**
- `showPromptOverlay(term, meta, infoAbsRow)` — crea/actualiza header overlay en fila
- `extendCommandBlock(term, infoAbsRow, chevronAbsRow, endAbsRow, exitCode)` — crea body overlay para block/rail (llamado desde OSC 133 D)
- `updateOverlayPositions(term)` — reposiciona headers y bodies al hacer scroll
- `clearOverlays(term)` — limpia headers y bodies (respawn, cerrar tab, clear command)
- `refresh()` — actualiza backgrounds y estilos al cambiar tema; descarta body overlays

**Timing crítico de OSC 133 D (para extendCommandBlock):**
El `endAbsRow` DEBE leerse síncronamente dentro del OSC handler, NO en un requestAnimationFrame. Si se usa rAF, el write() habrá terminado y el cursor estará en la fila del nuevo `❯` — 2 filas más arriba del fin del output real. Leer dentro del handler garantiza capturar el cursor al final del output del comando.

**`_termRenders` (compactos, ajustados a 1 fila ~17px) vs `renders` (tamaño normal para settings picker)**

**Variables de entorno que pty.rs inyecta al shell:**
- `OCOTE_PROMPT_PRESET` — preset elegido (`pill`|`block`|`minimal`|`ribbon`|`rail`|`passthrough`)
- `OCOTE_ACCENT` — hex del accent del tema SIN `#` (e.g. `E8843A`)
- `OCOTE_PROMPT_HOOK` — ruta absoluta a `resources/shell/prompt.zsh`
- `OCOTE_ZSH_HL` — ruta absoluta a `zsh-syntax-highlighting.zsh`
- `OCOTE_ZSH_AUTOSUGGEST` — ruta a `zsh-autosuggestions.zsh`
- `OCOTE_FZF_BIN` — ruta al binario de fzf de la plataforma (también en Windows → PATH)
- `_OCOTE_ZDOTDIR` — ZDOTDIR real del usuario (o `$HOME`) para que el bootstrap sourcee su config

**Bootstrap ZDOTDIR (crítico):**
El `.zshenv` en `resources/shell/` NO reasigna permanentemente ZDOTDIR. Sourcea el `.zshenv` del usuario con su ZDOTDIR temporal y restaura el nuestro para que zsh lea nuestro `.zshrc`. Si se cambia este orden, zsh leería el `.zshrc` del usuario y nunca el bootstrap de Ocote → terminal vacía.

**Orden de carga de plugins de shell (CRÍTICO — `.zshrc`):**
```
1. .zshrc del usuario       2. prompt.zsh (PS1 + fzf widgets)
3. zsh-syntax-highlighting   4. zsh-autosuggestions  ← DEBE ir AL FINAL
```
Si autosuggestions cargara antes que syntax-highlighting, al aceptar una sugerencia con `→` el texto se queda gris (no se recolorea). El widget `_ocote_accept_or_forward` (en `.zshrc`) hace `region_highlight=()` + `zle redisplay` tras aceptar.

**OSC en PROMPT de zsh — gotcha clásico:**
Todo escape no-imprimible en `PROMPT` (como OSC 133 A) DEBE ir envuelto en `%{ %}` (bash: `\[ \]`). Si no, zsh cuenta sus bytes como columnas visibles → cursor desfasado → texto fantasma, duplicados al pegar, artefactos en historial.

**Bash hook (`bash-hook.bash`) — paridad con zsh:**
Cargado vía `bash --rcfile` cuando `$SHELL` es bash. Emite OSC 6731 + 133 D en `_ocote_precmd` (PROMPT_COMMAND) y OSC 133 A al FINAL de PS1 (NO en precmd — el cursor debe estar en la fila del ❯ para el overlay). Gotcha bash: `\[ \]` solo funciona en la cadena PS1 directa, NO dentro de `$(...)`. Las funciones dinámicas (`_ocote_git`, `_ocote_arrow`) envuelven sus escapes en `\001`/`\002` (bytes SOH/STX = `\[`/`\]`). Bash NO tiene autosuggestions (plugin solo-zsh); sí tiene fzf. Probar bash en Ocote: lanzar con `SHELL=/bin/bash pnpm tauri dev`.

**Ícono del dock en macOS (`set_app_icon` en main.rs):**
`window.set_icon()` de Tauri v1 NO afecta el dock en macOS (no hay íconos por-ventana). Hay rama nativa vía objc: `[[NSApplication sharedApplication] setApplicationIconImage:]` (crates `cocoa`/`objc`, target-specific en Cargo.toml). Dura solo la sesión; el frontend re-aplica la preferencia al arrancar. Win/Linux usan `set_icon` con `Icon::Raw`.

**Encuadre de íconos por OS (README-ICONOS-OS.md en Ocote design):**
macOS espera el arte a 824×824 centrado en 1024 (margen 100px) o el ícono se ve más grande que las apps nativas. Los masters con margen están en `Ocote design/export/icons/macos/ocote-macos-1024{,-dark}.png`. Para regenerar el bundle: `pnpm tauri icon <master-dark>` (dark = default de la app). Los íconos del runtime swap (`resources/icons/icon-{light,dark}.png/.icns`) y el preview (`frontend/icons/`) también usan los masters con margen. Light/dark son gemelos geométricos a propósito (la diferencia de tamaño percibida es irradiación óptica, NO se corrige).

**PowerShell hook (`prompt.ps1`):**
Cargado vía `pwsh -NoExit -Command ". '<hook>'"` (corre tras los `$PROFILE`). `function prompt` emite OSC 6731/133 D al inicio (Write-Host, side-effect) y OSC 133 A al final del string retornado. Exit code: capturar `$?`/`$LASTEXITCODE` en la PRIMERA línea de prompt. PSReadLine aporta autosuggestions (`PredictionSource History`) + highlighting nativos. fzf: handlers manuales de PSReadLine (no hay `fzf --powershell`). En Windows, `pty.rs` prefiere `pwsh.exe`, fallback `powershell.exe`. Probar en macOS: `SHELL=$(which pwsh) pnpm tauri dev`.

**Sync explorador con PowerShell (gotcha):**
PowerShell `Set-Location` NO cambia el cwd del proceso a nivel OS (mantiene su ubicación interna). Por eso el polling `get_shell_cwd` (que lee el cwd del proceso) revierte el sync. Solución: `explorer.js` marca shells que emiten OSC 6731 como `_oscManagedShells` y el polling los ignora (el OSC es autoritativo). El polling queda solo para passthrough.

**Bundling de binarios por plataforma (Tauri v1):**
Los binarios viven en `resources/bin/<plataforma>/`. El bundle NO los lista en `tauri.conf.json` (base); cada build los toma de `tauri.macos.conf.json` / `tauri.linux.conf.json` / `tauri.windows.conf.json`, que Tauri auto-mergea según el OS. GOTCHA: el merge REEMPLAZA arrays (no concatena), así que cada config de plataforma repite la lista COMPLETA de recursos (hooks, plugins, íconos) + solo sus binarios. Si agregas un recurso común nuevo, hay que añadirlo a los 3 configs de plataforma (o el base si no es por-plataforma). macOS incluye darwin-arm64 + darwin-x64 (para builds universales).

**zoxide + bat (bundleados, en `bin/<plataforma>/`):**
zoxide (`z`) se inicializa en cada hook (`zoxide init <shell>`); envuelve la función prompt para registrar dirs visitados. bat queda como comando `bat` SIN aliasear `cat` (preserva la enseñanza del CKB). Ambos en PATH vía el mismo dir que fzf. eza NO se bundlea: no publica binarios de macOS.

**Fish hook (`prompt.fish`):**
Cargado vía `fish -C "source <hook>"` (corre DESPUÉS de `config.fish` → nuestro `fish_prompt` gana). fish trae syntax highlighting y autosuggestions NATIVOS — no se bundlean plugins. `fish_prompt` emite OSC 6731/133 D al inicio y OSC 133 A al final (cursor en ❯). fish calcula el ancho del prompt interpretando los escapes él mismo → NO necesita marcadores `%{ %}`/`\[ \]`. Probar: `SHELL=$(which fish) pnpm tauri dev`.

**fzf — binarios por plataforma en PATH (NO wrapper):**
Los binarios viven en `resources/bin/<plataforma>/fzf` (darwin-arm64, darwin-x64, linux-x64, linux-arm64, win-x64). `pty.rs` añade el dir al PATH → `fzf` es comando real en las 3 shells. Cada hook re-añade el dir al PATH (por si el config del usuario lo resetea). Razón del rename desde `fzf-<plat>`: la integración de fish valida `command -q fzf`, que solo busca ejecutables en PATH (no funciones), así que la función wrapper anterior no servía en fish.

**fzf bundleado:**
El binario se llama `fzf-darwin-arm64` (etc.), NO `fzf`. Una función shell `fzf() { command "$OCOTE_FZF_BIN" "$@"; }` permite que la integración y el usuario lo llamen como `fzf`. `Ctrl+T` se desactiva (`bindkey -r "^T"`) porque Ocote lo usa para nueva pestaña. `macOptionIsMeta:true` en xterm.js es necesario para Option+C en macOS.

**Sync explorador (NO usar fast-path de adivinanza):**
El explorador sincroniza desde `window.onShellCwdChanged(cwd)`, llamado por el handler OSC 6731 con el cwd REAL del shell (expande `~`). NO adivinar la ruta del `cd` tecleado — `currentCommandLine` solo captura teclas crudas y falla con tab-completion/historial.

**Dev: resources se sirven desde `target/debug/resources/`**, no desde la fuente. Tras editar `resources/shell/*`, hay que copiar a `target/debug/resources/shell/` o recompilar para que el cambio tome efecto en `pnpm tauri dev`.

**Colores del prompt:**
Los renders NO hardcodean colores. Todos usan `OCOTE_THEMES.getCurrentTokens()` que devuelve `{accent, green, blue, comment, warning, fg}` del tema activo. La FORMA identifica a Ocote; el COLOR hereda del tema.

**API de `window.OCOTE_PROMPT`:**
- `showPromptOverlay(term, meta, infoAbsRow)` — crea/actualiza header overlay
- `extendCommandBlock(term, infoAbsRow, chevronAbsRow, endAbsRow, exitCode)` — body overlay para block/rail
- `updateOverlayPositions(term)` — reposiciona todo al hacer scroll/resize
- `clearOverlays(term)` — elimina todos los overlays (tabs, clear, respawn)
- `refresh()` — re-renderiza headers con nuevo tema; descarta bodies (se recrean solos)
- `previewHtml(presetId, meta, tokens)` — devuelve HTML para el picker de settings

### Arquitectura de tabs
- **`window.ocoteTerminal` está OBSOLETO.** Cada terminal vive en `window.TAB_MANAGER.getAllTabs()`.
- `window.ocoteActiveShellId` → shell ID del tab actualmente visible.
- Para aplicar algo a todos los tabs: `window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => { ... })`.
- `create_shell` en Rust recibe: `rows`, `cols`, `prompt` (preset), `accent` (hex sin #).
- tab-manager.js lee `localStorage('ocote_theme')` para extraer el accent antes de llamar `create_shell`.

### Sistema de temas
- **8 temas oficiales de Ocote** (ids: `ocote`, `brasa`, `bosque`, `noche`, `papel`, `tinta`, `mezcal`, `cacao`). Default = `ocote`. Solo los nuestros — los temas ajenos (Dracula/Nord/etc.) se eliminaron por identidad de marca.
- **Generación programática**: `themes.js` define `OCOTE_THEME_DATA` (espejo de github.com/Teshre/ocote-themes — `bg, fg, cursor, comment, selection, ansi[16]` base16). `buildTheme()` deriva `xterm`, `css` y `tokens` de cada paleta. **Para agregar/quitar un tema: editar SOLO `OCOTE_THEME_DATA`.** No hay que mantener xterm/css/tokens a mano.
- Mapeo base16 → tokens: `accent=cursor`, `green=ansi[2]`, `blue=ansi[4]`, `warning=ansi[3]`, `comment`, `fg`. La regla `tokens.accent === --accent` se cumple automáticamente (ambos = `cursor`).
- `getCurrentTokens()` → tokens del tema activo. `getThemeList()` → datos para el picker (incluye `ansi`, `bg`, etc. para el mini-preview). `applyTheme()` llama `OCOTE_PROMPT.refresh()`.
- **Migración** (`settings.js` `migrateThemeId`): IDs viejos guardados en localStorage (`dark`→`ocote`, `light`→`papel`, ajenos→`ocote`) para que usuarios existentes no queden con tema roto.
- **Selector con mini-preview** (`settings.js` `themeCard`): card con mini-terminal coloreado por la paleta ANSI del tema (porteado de `ocote-themes/gallery.js`).
- `themes.js` **debe cargarse PRIMERO** (antes de `prompt.js`, `terminal.js`, `tab-manager.js`).
- **Repo de temas**: `../ocote-themes` (git, github.com/Teshre/ocote-themes) tiene los temas standalone base16 + exports para 6 terminales. Si se actualizan paletas ahí, hay que reflejar `OCOTE_THEME_DATA` en `themes.js`.

### Pendiente (roadmap): import de temas custom
Permitir que usuarios importen temas externos (Dracula, etc.) vía base16/JSON, guardados en localStorage como `custom`. Decidido como feature futura — por ahora solo los 8 oficiales para mantener identidad de marca.

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
- `frontend/icons.js`: SVGs Tabler Icons (MIT) + lógica para 5 temas.
- **5 temas**: `outline`(seti), `badge`, `ember`, `brand`, `symbols`.
- `window.ICON_SET` expone: `getIconForFile`, `getIconForFolder` (flujo seti), `getThemedIconHtml`, `getThemedFolderHtml` (brand/ember/symbols), `getIconHtmlForTheme`, `getFolderHtmlForTheme` (unificados — usados por settings preview).
- `getEmberColor(ext)` lee `getComputedStyle(documentElement)` en runtime → los colores Ember cambian automáticamente al cambiar el tema de color.
- `getIconTheme()` en `explorer.js` lee `localStorage('ocote_icon_theme')`.
- `applyIconTheme()` en `settings.js` guarda en LS y llama `_explorerRefresh()` + `renderIconPreview()`.
- **REGLA**: variables CSS de Ember usan los nombres reales de `theme.css`: `--syntax-yellow`, `--syntax-blue`, `--syntax-teal`, `--syntax-green`, `--syntax-red`, `--accent`, `--text-secondary`. No usar `--color-*` (no existen).

### Sistema de operaciones de archivo
- **`ocoteConfirm(message)`** en `explorer.js`: reemplaza `window.confirm()` (no funciona en WKWebView). Devuelve `Promise<boolean>`. Foco en Cancelar por defecto.
- **Borrado de carpetas**: primero `count_dir_entries()` para mostrar el número en el confirm; luego `delete_item_recursive()` con `remove_dir_all`. Flujo separado para archivos (usa `delete_item` existente).
- **Redimensionamiento**: `resizer.js` escucha `mousedown/move/up` en los handles. Desactiva `transition: none` durante el drag para evitar lag. MutationObserver reactiva/oculta el handle según el estado del panel.
- **Preview** (`preview.js`): `read_text_file()` para código/texto; `read_file_base64()` para imágenes. Highlight.js corre en el frontend, no en Rust.

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

**Fase 4 — Avance al 2026-05-29 (primera parte):**
✅ **Overlay system propio** — HTML/CSS sobre canvas xterm.js sin Decoration API.
  - `_rowPx()` usa `term._core._renderService.dimensions.css.cell.height` (21.5px exacto).
  - OSC 133 A al final del PROMPT; `requestAnimationFrame` lee cursor después del write().
  - `infoAbsRow = chevronAbsRow - 1`. Overlays posicionados correctamente.
  - `refresh()` re-renderiza overlays con nuevos colores al cambiar tema.
  - `el.dataset.meta` guarda JSON del prompt para re-renderizar.
✅ **Presets** (5 + passthrough): pill, block, minimal, ribbon, rail, passthrough.
✅ **Picker de prompts** en Settings → Apariencia: cards con preview en vivo, preview grande al seleccionar.
✅ **Bootstrap ZDOTDIR correcto**, **zsh-syntax-highlighting** bundleado, **tokens semánticos**.
✅ **OSC 6731 + OSC 133** Shell Integration funcionando.

**Fase 4 — Avance al 2026-05-29 (segunda parte — sesión 10):**
✅ **Body overlay Block y Rail**: `extendCommandBlock()` cubre visualmente toda la salida del comando.
  - OSC 133 D leído síncronamente para `endAbsRow` correcto (sin race condition con rAF).
  - Block body: `border-left` + fondo tenue; rojo si `exitCode !== 0`.
  - Rail body: solo stripe de 3px, sin fondo.
✅ **Fix colores de tema**: `TOKENS.accent` alineado con `--accent` CSS para todos los temas (Nord, Tokyo Night, Dracula, One Dark, Gruvbox, Solarized).
✅ **Fix watermark cubierta**: `#terminal-watermark` subido de `z-index:4` a `z-index:10`.
✅ **Fix prompts fantasma tras `clear`**: detectar `\x1b[2J` en listener PTY y llamar `clearOverlays()`.
✅ **Settings rediseñado**: modal 1100px, layout grid+preview lado a lado, 3 cols, 10 temas en fila, tipografía+iconos combinados.
✅ **Block preview honesto**: eliminado footer ficticio (exit 0, copy·rerun·share no implementados).
✅ **Rail big preview corregido**: renderer propio con stripe de altura fija.

**Fase 4 — Avance al 2026-05-30 (sesión 11):**
✅ **fzf v0.73.1** bundleado (5 plataformas): Ctrl+R historial fuzzy, Option+C cd fuzzy.
  - Wrapper `fzf()` → binario real; Ctrl+T desactivado; `macOptionIsMeta:true` para Alt+C.
✅ **zsh-autosuggestions v0.7.0** bundleado: → acepta sugerencia completa estilo fish.
✅ **Ícono light/dark** en Settings (`set_app_icon`, feature `icon-png`, `.icns` generados).
✅ **Ajustes de terminal**: font size, cursor, scrollback. Reorg General/Apariencia.
✅ **Fix prompt width**: OSC 133 A envuelto en `%{ %}` (fantasmas, paste, historial).
✅ **Fix color gris al aceptar →**: orden de carga HL→autosuggestions + `region_highlight=()`.
✅ **Fix explorador "ruta no existe"**: sync vía OSC 6731 cwd real (no adivinanza del cd).
✅ **pty.rs cross-platform**: Windows recibe OCOTE_FZF_BIN.

**Fase 4 — Avance al 2026-05-31 (sesión 12):**
✅ **Soporte fish** (`prompt.fish`): fish_prompt con 5 presets + OSC 6731/133. Highlighting + autosuggestions nativos de fish. Validado en fish 4.7.1.
✅ **Refactor binarios fzf**: `bin/<plataforma>/fzf` + PATH (sin wrapper). Arregla `command -q fzf` de fish y simplifica zsh/bash.
✅ **3 shells soportados**: zsh, bash, fish.
✅ **Build de producción verificado** (`pnpm tauri build`): .app 34MB / .dmg 15MB; todos los recursos (fzf, plugins, hooks, íconos) bundleados y resueltos desde el .app.
✅ **Fix ícono del dock en macOS**: rama nativa objc `setApplicationIconImage:` (window.set_icon es no-op en dock macOS).
✅ **Fix encuadre de íconos macOS**: regenerados con margen 824/1024 (antes borde-a-borde se veía más grande que apps nativas).

**Fase 4 — Avance al 2026-06-03 (sesión 13):**
✅ **Menú contextual del explorador rediseñado**: íconos SVG Tabler inline (sin emojis), hover con `accent-dim` + borde izquierdo naranja, grupo "CREAR" con label, animación `scale+translateY`.
✅ **Operaciones de archivo completas** en el explorador:
  - Crear archivo/carpeta inline (input dentro del panel).
  - Renombrar inline (input sobre el nombre).
  - Eliminar con `ocoteConfirm()` — modal HTML propio que reemplaza `window.confirm()` (que no funciona en WKWebView/macOS).
  - **Borrado recursivo de carpetas**: `count_dir_entries()` muestra cuántos elementos hay; `delete_item_recursive()` usa `remove_dir_all`. Confirmación diferenciada: vacía vs con contenido.
✅ **`ocoteConfirm(message)`** (`explorer.js`): modal HTML con backdrop blur, animación pop-in, botón Cancelar con foco por defecto (seguridad), Esc/Enter.
✅ **Preview de archivos** (`preview.js`): panel derecho con código coloreado (highlight.js, 40+ lenguajes), imágenes via base64 (`read_file_base64`), warning para archivos >500KB. Doble-click en explorador o "Vista previa" del menú contextual.
✅ **Panel colapsable** (Ctrl+B, persiste estado en localStorage) — ya existía; corregido listener duplicado en `renderEntries`.
✅ **Redimensionamiento de paneles** (`resizer.js`): handles de arrastre entre explorador↔terminal y terminal↔preview. MutationObserver para mostrar/ocultar resizer según panel visible. Persiste anchos en `localStorage('ocote_panel_explorer_w'/'ocote_panel_preview_w')`. Desactiva `transition` durante el drag para fluidez; llama `fitAddon.fit()` al soltar.
✅ **5 temas de íconos** en el explorador (`icons.js`):
  - `Outline` (seti): SVGs Tabler stroke, ya existía.
  - `Badge`: etiquetas de texto con fondo, ya existía.
  - `Ember` ✨: cuadrado outline + fill 18% en colores del tema activo (`--syntax-*`); cambia automáticamente al cambiar tema.
  - `Brand` ✨: cuadrado sólido con color oficial de cada tecnología.
  - `Symbols` ✨: glifo Unicode desnudo (`λ` JS, `π` Python, `⚙` Rust, `☕` Java…).
✅ **Preview de íconos en Settings** (`settings.js`): cuadrícula de 12 elementos (8 archivos + 4 carpetas) se actualiza en tiempo real al cambiar tema, sin salir del modal.

**Próximo paso — Fase 4:**
1. Ícono real de Ocote (diseño propio) — About sigue mostrando el ícono de macOS por caché
2. Landing page / sitio web
3. Firma de código macOS (Apple Developer ID) para distribuir sin Gatekeeper
4. Auto-updater

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
