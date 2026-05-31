# Changelog — Ocote

Todos los cambios notables del proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

### Fase 4 — En progreso
Próximo paso: soporte fish, landing page, firma de código macOS.

### Agregado
- **Bash hook con paridad de overlays** (`bash-hook.bash`): ahora emite OSC 133 A al FINAL de PS1 (no en precmd) para posicionar correctamente los overlays de pill/ribbon/rail/block; OSC 6731 + 133 D ya estaban. Presets con info line (path · git · hora) por preset. fzf integrado (Ctrl+R, Option+C).

### Corregido
- **Bash: escapes de color sin envolver** — `_ocote_git`/`_ocote_arrow` emitían ANSI crudo vía `$(...)`; en bash eso desfasa el cursor (mismo gotcha que el OSC en zsh). Ahora envueltos en `\001`/`\002` (equivalente byte-level de `\[ \]`, que no funciona dentro de command substitution).

---

## [0.8.0] — 2026-05-30 — fzf + autosuggestions + nuevos ajustes

### Agregado
- **fzf v0.73.1 bundleado** (`resources/bin/`): binarios para macOS arm64/x64, Linux x64/arm64, Windows x64. `pty.rs` selecciona el binario correcto por plataforma e inyecta `OCOTE_FZF_BIN`.
  - `Ctrl+R` → búsqueda fuzzy en historial de comandos.
  - `Option+C` (Alt+C) → cd interactivo con fuzzy search de directorios.
  - `Ctrl+T` deshabilitado en fzf (conflicto con nueva pestaña de Ocote).
  - Función wrapper `fzf()` → delega al binario real (que se llama `fzf-darwin-arm64` etc.).
  - Colores de fzf alineados con la paleta Ocote.
- **zsh-autosuggestions v0.7.0 bundleado** (`resources/zsh-autosuggestions/`): texto fantasma gris basado en historial.
  - Flecha `→` acepta la sugerencia **completa** (estilo fish) y la deja en color normal.
  - Tab completa sin dejar texto fantasma.
- **Ícono de la app light/dark** (`set_app_icon` en `main.rs`): selector en Settings con preview. PNG + `.icns` bundleados para ambas variantes. (El cambio del dock en runtime requiere build de producción; en dev mode el `.app` no está completo.)
- **Ajustes de terminal en Settings → General**: tamaño de fuente (stepper 10–20px), estilo de cursor (bloque/línea/barra), historial de líneas (1K/5K/10K). Selector de tipografía movido a General.
- **`macOptionIsMeta: true`** en xterm.js — necesario para que Option/Alt envíe secuencias ESC (fzf Alt+C, atajos en vim/emacs).
- **8 strings i18n nuevos** (settings.icon.*, settings.terminal.*) en ES/EN/PT/FR/DE.

### Corregido
- **Prompt width / cursor desfasado** (`prompt.zsh`): el marcador OSC 133 A no estaba envuelto en `%{ %}`, así que zsh contaba 9 bytes invisibles como columnas visibles. Causaba texto fantasma pegado, caracteres duplicados al pegar y artefactos al navegar historial. Ahora envuelto correctamente.
- **Color gris al aceptar sugerencia con →**: orden de carga corregido (syntax-highlighting ANTES de autosuggestions, que ahora carga AL FINAL en `.zshrc`) + `region_highlight=()` + `zle redisplay` en el widget de aceptación. El texto aceptado se recolorea normal.
- **Explorador "ruta no existe"**: el fast-path adivinaba la ruta del `cd` desde las teclas crudas (fallaba con tab-completion/historial). Ahora sincroniza desde el cwd REAL que el shell reporta vía OSC 6731 (`window.onShellCwdChanged`).
- **Cross-platform en `pty.rs`**: `resolve_resource`/`ShellResources` ya no son Unix-only; Windows recibe `OCOTE_FZF_BIN` y lo añade al PATH.
- **`Icon::Raw` + feature `icon-png`** en Cargo.toml (requerido para `set_icon` en Tauri v1).

### Cambiado
- **Settings reorganizado**: General = idioma + terminal + ícono + tipografía. Apariencia = prompt + tema de color + íconos del explorador.
- **autocomplete.js**: popup posicionado con el cursor real de xterm.js; `write_to_shell` ahora pasa `shellId` (fix multi-tab).

---

## [0.7.2] — 2026-05-29 — Settings rediseñado + correcciones de prompt

### Agregado
- **Body overlay para Block y Rail** (`prompt.js`, `terminal.js`): los presets `block` y `rail` ahora cubren visualmente todo el output del comando, no solo la fila del header.
  - `terminal.js`: OSC 133 D leído síncronamente (antes del rAF) para capturar `endAbsRow` al final del output, sin race condition.
  - `prompt.js`: nuevo `extendCommandBlock()` crea/actualiza un div cuerpo (`ocote-ol-body`) posicionado desde la fila `❯` hasta el final del output.
  - Block body: `border-left: 2px solid` + fondo tenue; rojo si exit ≠ 0.
  - Rail body: solo el stripe vertical de 3px (sin fondo).

### Corregido
- **Colores incorrectos en temas** (`themes.js`): `TOKENS.accent` no coincidía con `--accent` CSS en Nord, Tokyo Night, Dracula, One Dark, Gruvbox Dark, Solarized Dark/Light. Todos actualizados para usar el mismo valor — los overlays de prompt ahora usan el acento correcto del tema activo.
- **Watermark cubierta por overlays** (`theme.css`): el `#terminal-watermark` tenía `z-index: 4` mientras los overlay containers tienen `z-index: 8`. Subido a `z-index: 10`. A la opacidad del watermark (~5-12% efectivo) el impacto visual es imperceptible.
- **Prompts fantasma tras `clear`** (`terminal.js`): `clear` envía `\x1b[2J` que limpiaba el canvas de xterm.js pero no los divs overlay. El listener `pty-output` ahora detecta `\x1b[2J` y `\x1b[3J` y llama `clearOverlays()` antes de escribir.

### Cambiado
- **Settings → Apariencia rediseñado** (`theme.css`, `index.html`): modal ampliado a 1100px; layout de dos columnas (grid de presets izquierda + preview derecha); grid de 3 columnas; 10 temas en fila única; Tipografía e Iconos combinados en una fila.
- **Block preview en settings**: eliminado el footer ficticio (`✓ exit 0 · 0.84s · copy · rerun · share`) que mostraba funcionalidades no implementadas.
- **Rail preview en settings** (`settings.js`): renderer propio para el pane grande con stripe de altura fija (20px), evitando que el gradiente se estirase a toda la altura del contenedor.
- **Path de demo en settings**: `~/proyecto/src` → `~/dev` para que quepa correctamente en las cards de presets.

---

## [0.6.4] — 2026-05-25 — Sincronización de tema en todas las terminales

### Corregido
- **Tema no se aplicaba a xterm.js**: al cambiar de tema en Settings, el fondo de la terminal quedaba negro. Causa: `window.ocoteTerminal` fue reemplazado por el sistema de tabs (`TAB_MANAGER`) y los helpers seguían apuntando al global obsoleto.
- **`themes.js`**: `applyTheme()` ahora itera `window.TAB_MANAGER.getAllTabs()` y actualiza `term.options.theme` en cada tab activo.
- **`terminal.js`**: `createTerminalInstance()` lee `localStorage('ocote_theme')` al crear cada tab — tabs nuevos nacen con el tema guardado en lugar del dark hardcodeado.
- **`settings.js`**: `setXtermOption()` y `applyFont()` usan `TAB_MANAGER.getAllTabs()` en vez de `window.ocoteTerminal` / `window.ocoteFitAddon` (ambos obsoletos con el sistema de tabs).
- **`index.html`**: `themes.js` ahora carga antes que `terminal.js` y `tab-manager.js` para que `window.OCOTE_THEMES` esté disponible cuando se crea el primer tab.

---

## [0.6.3] — 2026-05-25 — Múltiples terminales con tabs

### Agregado
- **`tab-manager.js`**: gestión completa de tabs de terminal
  - Cada tab es una instancia xterm.js + proceso shell PTY independiente en el backend
  - Botón `+` en la barra de tabs para crear nuevas terminales
  - Atajo `Ctrl+T` → nuevo tab, `Ctrl+W` → cerrar tab activo
  - Botón `×` por tab para cerrar individualmente
  - Si se cierra el último tab, se crea uno nuevo automáticamente
- **Nombre dinámico de tabs**: el tab toma el basename del CWD al crearse. Se actualiza con cada `cd` desde el explorador.
- **Expone `window.TAB_MANAGER`** con la API: `createTab()`, `closeTab()`, `switchTab()`, `getAllTabs()`, `getTab()`, `getActiveShellId()`.

### Cambiado
- **`terminal.js`**: refactorizado como factory — `createTerminalInstance(shellId, container)` crea y retorna `{ term, fitAddon }` sin gestionar el ciclo de vida de los tabs.
- **`window.ocoteActiveShellId`**: ID del tab activo, usado por `terminal.js` para filtrar input/output al shell correcto.

---

## [0.6.2] — 2026-05-25 — Breadcrumb navegable en el explorador

### Agregado
- **Breadcrumb inferior en el explorador** (`#explorer-footer`): muestra la ruta actual como segmentos clicables.
  - Click en cualquier segmento → navega directo a ese directorio (sin tener que subir de uno en uno).
  - Click en `~` → va al home.
  - Segmentos intermedios abreviados a primera letra + `.` para rutas largas (`P. Terminal/Ocote` → `P./Ocote`).
  - Dropdown al hacer click en un segmento no-activo: muestra subdirectorios del nivel para navegar lateralmente.
- **CSS**: `.explorer-bc-segment`, `.explorer-bc-abbr`, `.explorer-bc-home`, `#explorer-bc-dropdown` con estilos coherentes al tema activo.

---

## [0.6.1] — 2026-05-25 — UI internacionalizada + Nerd Fonts

### Agregado
- **`ui-i18n.js`**: sistema de internacionalización de la UI del shell
  - Traduce labels de: panel de settings (General, Apariencia, Idioma, Tipografía, Íconos, Tema), botones del onboarding, y el breadcrumb superior.
  - `window.I18N.apply()` re-aplica el idioma activo sin recargar la app.
  - Lee `localStorage('ocote_lang')`. Llamado automáticamente al cambiar idioma en settings.
- **Nerd Fonts bundleadas** (`frontend/lib/fonts/`): JetBrainsMono Nerd Font Mono, FiraCode Nerd Font Propo, MesloLGS NF — cargadas como `@font-face` en `theme.css`.
  - Resuelve el problema de íconos de p10k, oh-my-zsh y powerline que aparecían como cuadros (`▯`).

### Cambiado
- **Selector de idioma**: movido del breadcrumb superior al panel de Settings (tab General). El breadcrumb quedó más limpio.
- **Selector de tema de íconos**: movido del breadcrumb superior al panel de Settings (tab Apariencia).

---

## [0.6.0] — 2026-05-25 — Panel de configuración + 10 temas

### Agregado
- **`settings.js`**: modal de configuración centrado con dos tabs:
  - **General**: selector de idioma (ES/EN/PT/FR/DE).
  - **Apariencia**: selector de tipografía (7 opciones), selector de tema de íconos (seti/badge), grid de temas de color.
  - Se abre con el botón ⚙ en el breadcrumb superior (`#settings-btn`).
  - Cierra con Esc, click en el backdrop o el botón ✕.
  - Todas las preferencias persisten en `localStorage` y se aplican inmediatamente sin recargar.
- **`themes.js`**: 10 temas de color completos, cada uno con paleta `xterm` (para xterm.js) y `css` (CSS variables para la UI):
  - `dark` — Ocote Dark (default, naranja #f5a623)
  - `light` — Ocote Light (fondo blanco roto)
  - `dracula` — Dracula (MIT)
  - `oneDark` — One Dark (MIT, Atom)
  - `monokai` — Monokai (MIT)
  - `solarizedDark` — Solarized Dark (MIT, Ethan Schoonover)
  - `solarizedLight` — Solarized Light (MIT)
  - `gruvboxDark` — Gruvbox Dark (MIT, Pavel Pertsev)
  - `nord` — Nord (MIT, Arctic Ice Studio)
  - `tokyoNight` — Tokyo Night (MIT, Enkia)
- **Grid de swatches** en settings: preview visual de cada tema con su color de fondo y acento.
- **`window.OCOTE_THEMES`**: objeto global con `THEMES`, `applyTheme(id)` y `getThemeList()`.

---

## [0.5.5] — 2026-05-24 — CKB multilenguaje + Tooltip traducido + Íconos SVG

### Agregado
- **CKB multilenguaje**: `ckb/commands.json` expandido de 76 a **153 comandos** en **5 idiomas** (ES/EN/PT/FR/DE).
  - Campos por comando: `description_es`, `description_en`, `description_pt`, `description_fr`, `description_de`.
  - `CommandRaw` en `ckb.rs` con `#[serde(default)]` para retrocompatibilidad.
  - `CommandResponse` expone un solo campo `description` — el backend resuelve el idioma; el frontend nunca sabe la columna.
  - `lang_column(lang)` en `ckb.rs`: whitelist explícita contra SQL injection.
- **`frontend/icons.js`**: iconos SVG outline de Tabler Icons (MIT) para el explorador de archivos.
  - 15 tipos de icono base con paths SVG reales.
  - 80+ extensiones mapeadas a icono + color; 80+ nombres de carpeta con colores específicos.
  - `getIconForFile(name)` y `getIconForFolder(name)` → `{ svg, color }`.

### Cambiado
- **`autocomplete.js`**: pasa `lang` en cada `invoke('get_suggestions')`. Usa `cmd.description` en vez de `cmd.description_es`.
- **`tooltip.js`**: `UI_STRINGS` con 5 idiomas + `getUI()` — "Flags comunes", "Ejemplo" y el hint de cierre ya no están hardcodeados en español.

---

## [0.4.5] — 2026-05-24 — Iconos SVG outline de Tabler Icons

Reemplazo de los iconos de archivo tipo "bloque de color" por iconos SVG outline profesionales de Tabler Icons.

### Agregado
- **`frontend/icons.js`**: sistema de iconos SVG inline con paths de Tabler Icons (MIT license)
  - 15 iconos base: `folder`, `folderOpen`, `file`, `fileCode`, `fileText`, `photo`, `music`, `video`, `zip`, `database`, `settings`, `pdf`, `terminal`, `table`, `markdown`
  - 80+ extensiones de archivo mapeadas a icono + color de lenguaje
  - 80+ nombres de carpeta con colores específicos (src→azul, node_modules→morado, test→verde, etc.)
  - API: `getIconForFile(filename)` y `getIconForFolder(name)` devuelven `{ svg, color }`

### Cambiado
- **`explorer.js`**: `getFileIconHtml()` y `getFolderIconHtml()` usan `window.ICON_SET` para el tema "seti"
  - Iconos de archivo ahora son outline (línea) en lugar de rectángulos rellenos
  - Los SVGs usan `stroke="currentColor"` para heredar el color del contenedor
  - Mantiene tema "badge" (⊞) como alternativa via `localStorage('ocote_icon_theme')`
- **`index.html`**: carga `icons.js` antes de `explorer.js`
- **`theme.css`**: agregados estilos `.icon-wrapper` y `.icon-wrapper svg` para iconos outline de 16×16px

### Corregido
- **Calidad visual de iconos**: los SVGs anteriores eran rectángulos de color simples que se veían como bloques. Los nuevos iconos outline tienen formas reconocibles (carpeta con pestaña, documento con esquina doblada, nota musical para audio, etc.).

---

## [0.4.4] — 2026-05-22 — Polish final de Fase 2

Ajustes finales de UX antes de cerrar Fase 2.

### Corregido
- **Tooltip no aparecía para `cd`, `git`, etc.**: `currentInput` se reseteaba al detectar espacio, perdiendo el nombre del comando. Fix: separar `currentInput` (autocompletado) de `currentCommandLine` (tooltip + cd detection).
- **Popup de autocompletado tapaba la línea de input**: iteración de posicionamiento:
  1. Arriba del cursor → tapaba líneas anteriores
  2. Debajo del cursor → demasiado cerca
  3. Debajo con margen de `2*lineHeight + 20px` → flota claramente separado sin tapar nada
- **Posicionamiento dinámico**: `autocomplete.js` lee `cursorY` y `lineHeight` desde `window.ocoteTerminal` (xterm.js) para calcular `top` en píxeles.

---

## [0.4.3] — 2026-05-22 — CKB ampliada: 12 → 69 comandos

Command Knowledge Base expandida de 12 a 69 comandos cubriendo filesystem, búsqueda, procesos, red, desarrollo, sistema y gestores de paquetes.

### Agregado
- **CKB expandida** (`ckb/commands.json`): 50 comandos nuevos organizados por categoría
  - **filesystem (23)**: `ls`, `cd`, `pwd`, `mkdir`, `rm`, `cp`, `mv`, `cat`, `touch`, `head`, `tail`, `less`, `find`, `which`, `chmod`, `chown`, `du`, `df`, `tar`, `gzip`, `zip`, `unzip`, `ln`
  - **search (8)**: `grep`, `sed`, `awk`, `wc`, `sort`, `uniq`, `xargs`, `cut`
  - **process (7)**: `ps`, `top`, `kill`, `killall`, `jobs`, `fg`, `bg`
  - **network (8)**: `ping`, `curl`, `wget`, `ssh`, `scp`, `rsync`, `ifconfig`, `netstat`
  - **development (9)**: `git`, `node`, `npm`, `cargo`, `python3`, `docker`, `make`, `gcc`, `rustc`
  - **system (12)**: `clear`, `history`, `man`, `sudo`, `uname`, `whoami`, `uptime`, `date`, `env`, `export`, `alias`, `exit`
  - **package_manager (2)**: `brew`, `apt`
  - Todos con descripciones en español, flags comunes y ejemplos prácticos

---

## [0.4.2] — 2026-05-22 — Tooltip educativo de comandos

Card lateral que aparece automáticamente cuando ejecutas un comando reconocido, mostrando qué hace, sus flags más comunes y un ejemplo.

### Agregado
- **`tooltip.js` reescrito**: card educativa funcional
  - Escucha `window.onTerminalCommandExecuted(cmdName)` desde `terminal.js`
  - Consulta `get_command_info()` en la CKB vía Tauri
  - Muestra: nombre del comando, categoría, descripción en español, top 3 flags, y ejemplo
  - Auto-cierra después de 8 segundos de inactividad
  - Se cierra con Esc o click fuera
- **`terminal.js`**: notifica comando ejecutado al tooltip
  - Extrae el nombre del comando (primera palabra antes de espacio)
  - Llama `window.onTerminalCommandExecuted(cmdName)` en cada Enter

### Cambiado
- **`theme.css`**: estilos mejorados para el tooltip
  - `.tooltip-header` con nombre + badge de categoría
  - `.tooltip-section-title` para secciones (Flags comunes, Ejemplo)
  - `.tooltip-flag` con `code` amarillo y descripción gris
  - `.tooltip-example-desc` para la descripción del ejemplo
  - Separador sutil antes del hint de cierre

---

## [0.4.1] — 2026-05-22 — Optimización de sincronización terminal→explorador

Rendimiento mejorado en la sincronización bidireccional. Directorios ya visitados se renderizan instantáneamente.

### Agregado
- **Cache de directorios en `explorer.js`**: `dirCache` (Map) guarda entradas de directorios visitados por 30 segundos
- **`loadDirectory(path, { instant })`**: función centralizada para cargar directorios con cache
- **`refreshDirectory(path)`**: refresca cache en background sin bloquear UI

### Cambiado
- **`fs_explorer.rs`**: `list_directory` ahora usa `entry.file_type()` en vez de `entry.metadata()` — evita leer permisos, tamaño, timestamps (syscall más rápida)
- **`explorer.js`**: `handleClick()` y `onTerminalCdExecuted()` usan `loadDirectory()` con cache
- **Polling de fallback**: reducido de 2000ms → 1000ms → ahora usa cache primero

### Corregido
- **`initExplorer()`**: ahora usa `loadDirectory()` en vez de llamar `list_directory` directamente

---

## [0.4.0] — 2026-05-22 — CKB en SQLite + Autocompletado visual

Command Knowledge Base operativa en memoria con SQLite. Autocompletado visual aparece sobre la terminal mostrando sugerencias con descripción en español.

### Agregado
- **`ckb.rs`**: Command Knowledge Base en SQLite en memoria
  - Esquema: tabla `commands` (name, description_es, description_en, category), `flags`, `examples`, índice por nombre
  - Carga inicial de 12 comandos desde `ckb/commands.json` vía `include_str!()` al arrancar la app
  - `get_suggestions(prefix)` — búsqueda por prefijo (insensible a mayúsculas) con `LIKE 'prefix%'`
  - `get_command_info(name)` — recupera descripción completa de un comando
- **`autocomplete.js`**: popup de autocompletado visual
  - Se activa cuando el usuario escribe en la terminal (sin espacios)
  - Consulta la CKB cada 150ms (debounce)
  - Muestra nombre del comando + descripción en español
  - Click en sugerencia → inyecta el comando completo en el PTY (borra lo escrito con backspaces + envía comando)
  - Estilos en `theme.css`: popup flotante con sombra, item seleccionado resaltado
- **`terminal.js`**: trackea `currentInput` desde `term.onData` para alimentar el autocompletado
  - Detecta backspace (`\x08`, `\x7f`), enter (`\r`, `\n`), escape, y caracteres imprimibles
  - Resetea el input al detectar espacio o enter

### Cambiado
- **`main.rs`**: agregados `CkbState` al estado de Tauri + comandos `get_suggestions` y `get_command_info`
- **`Cargo.toml`**: agregada dependencia `rusqlite = { version = "0.31", features = ["bundled"] }`

### Corregido
- **Error de compilación en `ckb.rs`**: `init_schema` devolvía `rusqlite::Result` pero `new()` devolvía `Result<Self, String>`. Fix: `.map_err(|e| e.to_string())` en cada operación SQL
- **Import no usado**: removido `Result as SqliteResult` de `rusqlite`
- **Sincronización terminal→explorador muy lenta**: reemplazado polling de 2s por fast-path (detecta Enter después de `cd`) + polling de 1s como fallback
- **`tooltip.js` crasheaba**: buscaba `#terminal-input` que no existe desde v0.3.0 (xterm.js). Fix: envolver listener en `if (inputEl)`

---

## [0.3.0] — 2026-05-22 — Migración a xterm.js + Explorador de archivos

Diagnóstico profundo de bugs de input + migración a xterm.js + implementación del explorador de archivos lateral con sincronización bidireccional.

### Agregado
- **xterm.js** (`frontend/lib/`): librería de terminal madura (usada por VS Code, Hyper, etc.)
- **@xterm/addon-fit**: redimensiona la terminal automáticamente al tamaño del contenedor
- **Tema Ocote en xterm.js**: colores ANSI personalizados que coinciden con el tema visual de la app
- **Explorador de archivos lateral** (`explorer.js` + `fs_explorer.rs`):
  - Panel con árbol de archivos/carpetas con iconos por tipo
  - Click en carpeta → navega dentro + ejecuta `cd` en el PTY
  - Botón `..` para subir un nivel
  - Breadcrumb en barra superior (`~/Documents/proyecto`)
  - Sincronización bidireccional: click en explorador → `cd` en terminal; `cd` en terminal → explorador se actualiza automáticamente (vía `lsof` + polling cada 2s)
- **`get_shell_cwd()`** en `pty.rs`: lee el CWD real del proceso zsh vía `lsof -p <pid> -d cwd` (macOS)

### Cambiado
- **`terminal.js`**: reescrito para usar `xterm.Terminal` en vez del parser VT custom
- **`index.html`**: carga xterm.js y addon-fit desde `frontend/lib/`; reemplazado `#terminal-output` por `#terminal-container`
- **`theme.css`**: eliminados estilos de `.term-line` y cursor custom (xterm.js maneja el renderizado internamente); agregados estilos del explorador (`.explorer-item`, `.explorer-folder`, etc.)
- **`pty.rs`**: simplificado — removidos hacks de env vars; vuelta a detectar `$SHELL` (zsh); agregado tracking de PID del shell para CWD sync
- **`main.rs`**: registrados comandos `list_directory`, `get_home_directory`, `get_shell_cwd`

### Eliminado
- **`vt_parser.js`**: parser VT custom (v1–v7) eliminado por completo

### Corregido
- **Double-char (`ccd` al escribir `cd`)**: xterm.js maneja zsh-autosuggestions internamente
- **Backspace errático**: xterm.js maneja secuencias VT de reposicionamiento correctamente
- **Comando desaparece tras Enter**: xterm.js renderiza historial completo correctamente
- **`SyntaxError: duplicate variable 'invoke'`**: múltiples scripts declaraban `const { invoke }` en scope global; fix: usar `window.__TAURI__.invoke` directamente

### Decisiones técnicas
- **Migrar a xterm.js**: Terax (inspiración) también lo usa. Screen buffer 2D propio habría requerido miles de líneas.
- **Polling de CWD cada 2s en vez de shell integration**: más simple, no requiere modificar `.zshrc`, funciona con cualquier shell.
- **Emoji en vez de SVG para iconos de archivo**: más rápido, cross-platform sin dependencias de fuentes.

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
