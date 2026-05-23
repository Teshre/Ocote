# Changelog — Ocote

Todos los cambios notables del proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

### En progreso
- Fase 3: detección de contexto (git, node, etc.)

---

## [0.4.3] — 2026-05-22 — CKB ampliada: 12 → 62 comandos

Command Knowledge Base expandida de 12 a 62 comandos cubriendo filesystem, búsqueda, procesos, red, desarrollo, sistema y gestores de paquetes.

### Agregado
- **CKB expandida** (`ckb/commands.json`): 50 comandos nuevos organizados por categoría
  - **filesystem (12 nuevos)**: `touch`, `head`, `tail`, `less`, `find`, `which`, `chmod`, `chown`, `du`, `df`, `tar`, `gzip`, `zip`, `unzip`, `ln`
  - **search (6 nuevos)**: `sed`, `awk`, `wc`, `sort`, `uniq`, `xargs`, `cut`
  - **process (5 nuevos)**: `ps`, `top`, `kill`, `killall`, `jobs`, `fg`, `bg`
  - **network (7 nuevos)**: `ping`, `curl`, `wget`, `ssh`, `scp`, `rsync`, `ifconfig`, `netstat`
  - **development (5 nuevos)**: `node`, `python3`, `docker`, `make`, `gcc`, `rustc`
  - **system (9 nuevos)**: `clear`, `history`, `man`, `sudo`, `uname`, `whoami`, `uptime`, `date`, `env`, `export`, `alias`, `exit`
  - **package_manager (2 nuevos)**: `brew`, `apt`
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
