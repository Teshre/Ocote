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
- Sincronización terminal→explorador vía OSC 6731 (cwd real del shell) + polling ✅
- CKB en SQLite con **153 comandos** en **5 idiomas** (ES/EN/PT/FR/DE) ✅
- Autocompletado visual posicionado debajo del cursor (`autocomplete.js`) ✅
- Tooltip educativo funcional con argumentos (`tooltip.js`) ✅
- **Múltiples terminales** en tabs (`tab-manager.js`): Ctrl+T nuevo tab, Ctrl+W cerrar ✅
- **10 temas de color** (`themes.js`): Ocote Dark/Light, Dracula, One Dark, Monokai, Solarized Dark/Light, Gruvbox, Nord, Tokyo Night ✅
- **Panel de configuración** (`settings.js`): modal centrado, tabs General y Apariencia ✅
- **UI traducida** (`ui-i18n.js`): settings, onboarding y breadcrumb en 5 idiomas ✅
- **Breadcrumb navegable** en el explorador: segmentos clicables, dropdown al hover, abreviados si son largos ✅
- **Nerd Fonts** bundleadas: JetBrainsMono NF, FiraCode NF, MesloLGS NF ✅
- **Sistema de prompt nativo** con overlay HTML propio + 5 presets ✅
- **Body overlay Block/Rail**: cubre visualmente toda la salida del comando (no solo header) ✅
- **Zsh-syntax-highlighting** bundleado (BSD) ✅
- **fzf v0.73.1** bundleado (Ctrl+R historial, Option+C cd fuzzy) — 5 plataformas ✅
- **zsh-autosuggestions v0.7.0** bundleado (texto fantasma, → acepta estilo fish) ✅
- **Ícono light/dark** seleccionable en Settings (`set_app_icon`) ✅
- **Ajustes de terminal**: tamaño de fuente, cursor, scrollback ✅

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
- Cada tema tiene: `xterm` (paleta xterm.js), `css` (CSS variables), y también `tokens` en `OCOTE_THEMES.TOKENS`.
- `window.OCOTE_THEMES.getCurrentTokens()` → `{accent, green, blue, comment, warning, fg}` del tema activo.
- `window.OCOTE_THEMES.applyTheme(themeId)` llama `OCOTE_PROMPT.refresh()` al final para repintar decorations.
- `themes.js` **debe cargarse PRIMERO** (antes de `prompt.js`, `terminal.js`, `tab-manager.js`).
- **REGLA CRÍTICA DE TOKENS**: `TOKENS[tema].accent` DEBE coincidir con `--accent` del CSS de ese tema. Si divergen, el overlay usa un color y la UI usa otro. La regla es `TOKENS.accent === accentHex` siempre.

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

**Próximo paso — Fase 4:**
1. **Bash hook completo** (paridad OSC con zsh) → luego fish → PowerShell (4 shells)
2. Verificar cambio de ícono del dock en build de producción
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
