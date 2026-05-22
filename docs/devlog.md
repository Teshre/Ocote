# Devlog — Ocote

Registro de cada sesión de desarrollo. Qué se hizo, qué se aprendió, qué quedó pendiente.
Formato: fecha → qué se construyó → decisiones tomadas → próximo paso.

---

## 2026-05-22 — Sesión 5: Diagnóstico de bugs + migración a xterm.js

**Estado al inicio:** Fase 1 completada pero con 3 bugs persistentes: double-char (`ccd` al escribir `cd`), backspace errático, y comando que desaparece tras Enter. Se intentaron fixes con env vars (`ZSH_AUTOSUGGEST_BUFFER_MAX_SIZE`, `POWERLEVEL9K_TRANSIENT_PROMPT`) e inyección post-.zshrc sin éxito.

**Qué se hizo:**

### Diagnóstico: bash vs zsh
- Forzamos `/bin/bash` en `pty.rs` en vez de `$SHELL` (zsh)
- Con bash los bugs desaparecieron → confirmamos que el problema es 100% zsh plugins (zsh-autosuggestions + p10k)
- Con bash descubrimos un bug secundario: backspace borraba el prompt `bash-3.2$` porque nuestro parser trataba `\r` como "limpiar toda la línea"

### Investigación de repos open source
- **Terax AI** (inspiración del proyecto): usa `xterm.js` en el frontend + `portable-pty` en el backend. NO implementa su propio parser VT.
- **Alacritty**: tiene `Grid<T>` en Rust con screen buffer 2D completo (miles de líneas de código)
- Decisión: seguir el mismo approach que Terax — usar xterm.js en vez de reinventar la rueda

### Migración a xterm.js
- Instalado `xterm@5.3.0` y `@xterm/addon-fit`
- Copiados archivos build a `frontend/lib/` (xterm.js, addon-fit.js, xterm.css)
- Reescrito `terminal.js`: ~30 líneas usando `xterm.Terminal` + `FitAddon` + conexión al PTY vía Tauri events
- Reescrito `index.html`: carga xterm desde `frontend/lib/`
- Actualizado `theme.css`: eliminados estilos de `.term-line` y cursor custom
- Eliminado `vt_parser.js` por completo
- Simplificado `pty.rs`: removidos hacks de env vars; detecta `$SHELL` (zsh) de nuevo

### Tests post-migración
- `cd` aparece como `cd`, no `ccd` ✅
- `ls` aparece como `ls`, no `lls` ✅
- Backspace borra hacia atrás correctamente, sin tocar el prompt ✅
- Comando permanece visible en historial tras Enter ✅
- zsh + p10k funcionan sin configuración especial ✅

**Decisiones tomadas:**
- Usar xterm.js en vez de implementar screen buffer 2D propio: más rápido, más robusto, y alineado con Terax
- Eliminar vt_parser.js custom (v1–v7): ya no es necesario y simplifica el mantenimiento
- Screen buffer 2D propio se descarta: xterm.js lo maneja internamente

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Double-char (`ccd`) | zsh-autosuggestions inyectaba sugerencia en stream PTY; parser custom no separaba texto real vs sugerencia | Migrar a xterm.js (screen buffer 2D integrado) |
| Backspace errático | p10k/zsh enviaban secuencias VT complejas de reposicionamiento que el parser custom malinterpretaba | xterm.js maneja todas las secuencias VT correctamente |
| Comando desaparece tras Enter | p10k transient prompt usa secuencias VT para borrar la línea; parser custom no trackeaba el estado correctamente | xterm.js renderiza historial completo correctamente |
| Bash backspace borra prompt | Bash readline usa `\r` para reposicionar cursor; nuestro parser limpiaba la línea entera en `\r` | xterm.js maneja `\r` como reposicionamiento, no limpieza |

**Estado al final:**
- Terminal funcional con zsh, p10k, colores, historial ✅
- Ningún bug de input conocido ✅
- Preparado para Fase 2 ✅

**Próximo paso:** Fase 2 — explorador de archivos lateral (`fs_explorer.rs` + `explorer.js`), Command Knowledge Base en SQLite (`ckb.rs`), autocompletado visual.

---

## 2026-05-21 — Sesión 4: Input directo al PTY + parser v4–v7

**Estado al inicio:** Parser v3 funcional con soporte de cursor navigation. Comandos parcialmente visibles, pero input venía de un `<input>` HTML separado que acumulaba texto y lo mandaba al presionar Enter.

**Qué se hizo:**

### Reescritura de arquitectura de input (`terminal.js` v2)
- Eliminado el `<input>` HTML separado; el área de output (`#terminal-output`) captura el teclado directamente con `tabindex="0"`
- Cada tecla se envía al PTY de inmediato (`sendToPty(e.key)`), carácter por carácter
- ZLE recibe cada tecla individualmente → hace echo individual → los comandos aparecen junto al prompt `❯` igual que en una terminal real
- Mapeadas todas las secuencias de escape necesarias:
  - Ctrl+A–Z → bytes `\x01`–`\x1A`
  - Enter → `\r` (CR, no LF — ZLE espera CR en raw mode)
  - Backspace → `\x08` (BS/Ctrl+H, no `\x7f` que puede estar reasignado a delete-char en p10k)
  - Delete → `\x1b[3~`, Tab → `\t`, Escape → `\x1b`
  - Flechas, Home, End, PageUp/Down, Insert → secuencias estándar VT
- Ctrl+L limpia también el DOM (`vtParser.clear()`) además de mandar `\x0c` al PTY
- Clic en el output da foco automáticamente

### vt_parser.js iteraciones v4 → v7
- **v4**: Agregado `_advanceLine()` que reutiliza el siguiente `<div>` existente en lugar de siempre crear uno nuevo. Fix del gap visual ("cuadro negro") que aparecía cuando p10k movía el cursor hacia arriba con `\x1b[A` y luego `\n` creaba divs fuera de lugar.
- **v5**: Con input char-by-char, ZLE redibuja en cada tecla con `\x1b[nG]\x1b[K]<contenido>\x1b[mG]`. Restaurado el clearing en K y en G (col≤1). Agregado `_clearToEnd()` para `\x1b[0J]` (p10k lo usa para redibujar el prompt sin borrar output previo).
- **v6**: Agregado soporte para respuesta CPR (`\x1b[6n]` → `\x1b[1;1R]`) vía callback `onResponse`. CHA extendido a cualquier valor de columna.
- **v7 (final)**: Diagnóstico definitivo del problema de doble carácter y backspace extraño:
  - **Root cause doble carácter**: zsh-autosuggestions escribe la sugerencia (ej. `cd Obsidian`) en gris (fg=8) directamente en el stream del PTY, inmediatamente después del carácter tipado. Sin screen buffer, ambos se renderizan igual → `c` + `cd Obsidian` = `ccd Obsidian`.
  - **Root cause backspace hacia adelante**: Al borrar, la sugerencia cambiaba y aparecía más larga, simulando movimiento hacia la derecha.
  - **Root cause contenido borrado (v6)**: El CHA final (`\x1b[mG]` después del contenido) también limpiaba → borraba lo que acababa de escribir.
  - **Fix**: CHA (`\x1b[G]`) ignorado completamente. Solo `\x1b[K]` y `\r` borran líneas.

### Fix de autosuggestions en `pty.rs`
- Agregadas variables de entorno al spawnear la shell:
  - `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0` → sugerencias con color `#1a1a1a` = fondo → invisibles
  - `fish_color_autosuggestion=000000` → equivalente para Fish shell
  - El mecanismo ZLE sigue activo: Tab y `→` aceptan la sugerencia correctamente

### CSS (`theme.css`)
- Agregado borde naranja sutil al enfocar `#terminal-output:focus` (indica que la terminal está activa)
- Cursor parpadeante en `.term-line.current::after` con bloque `▋` en naranja Ocote
- Solo visible cuando el área tiene foco del teclado

**Decisiones tomadas:**
- CHA siempre ignorado: la responsabilidad de limpiar recae exclusivamente en `\x1b[K]` (EL). Esta es la única interpretación que funciona correctamente con el patrón de redraw de ZLE.
- `\x08` en lugar de `\x7f` para Backspace: más robusto entre distintas configuraciones de p10k/readline.
- No se implementa screen buffer 2D: queda para Fase 2. El modelo de líneas DOM es suficiente para la mayoría de los casos de uso.

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Cuadro negro / gap en output | `_newLine()` siempre al final del DOM aunque el cursor estuviera arriba | `_advanceLine()` reutiliza divs existentes |
| Comandos no aparecen al escribir | Input HTML mandaba todo de golpe; ZLE no hacía echo individual | Input char-by-char directo al PTY |
| Contenido se acumula (historial apilado) | CHA y K ignorados → ZLE redibujaba encima sin limpiar | Restaurado clearing en K y G (v5) |
| Contenido se borra al escribir | CHA final (post-contenido) también limpiaba | CHA ignorado completamente (v7) |
| `ccd Obsidian` al escribir `cd` | zsh-autosuggestions en el stream del PTY | `ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE=fg=0` |
| Backspace mueve cursor derecha | `\x7f` reasignado + sugerencia cambiante | `\x08` (BS) + fix de autosuggestions |

**Estado al final:**
- Input char-by-char funcional ✅
- Comandos aparecen junto al prompt `❯` mientras se escriben ✅
- Backspace funciona hacia atrás ✅
- Tab-completion nativo vía ZLE ✅
- Historial con ↑ ↓ vía ZLE ✅
- Cursor parpadeante naranja en línea activa ✅
- 10 commits en GitHub (rama `main`) ✅

**Comportamiento esperado (no bug):**
- El comando tipado "desaparece" después de Enter → es el **transient prompt de p10k** (intencional). Se puede desactivar con `POWERLEVEL9K_TRANSIENT_PROMPT=off` si se necesita.
- Iconos de Nerd Fonts no renderizan → WebView no tiene las fuentes instaladas, deferido a Fase 2.

**Próximo paso:** Fase 2 — explorador de archivos lateral, Command Knowledge Base en SQLite, screen buffer 2D para manejo correcto de aplicaciones TUI (vim, htop, etc.).

---

## 2026-05-21 — Sesión 3: Cursor navigation + scroll fix

**Estado al inicio:** Terminal funciona, colores visibles, pero comandos escritos no aparecen en output y el scroll no sigue al final.

**Qué se hizo:**
- Reescrito `vt_parser.js` como v3 con modelo de líneas completo
  - Agregado `this.lines[]` y `this.lineIdx` para trackear todos los `<div>` DOM
  - Nuevo método `_goToLine(idx)` para navegación de cursor
  - `\x1b[A` (cursor up N): mueve a línea anterior — p10k lo usa para redibujar el prompt
  - `\x1b[B` (cursor down N): mueve a línea posterior
  - `\x1b[K` (erase in line): limpia la línea actual
  - `\x1b[J` con 2J/3J: limpia toda la pantalla
  - `\x1b[G` col≤1 (cursor to column 1): limpia línea actual (equivale a `\r`)
  - `\x1b[H`/`\x1b[f` sin parámetros: cursor al home (línea 0)
  - Scroll con `requestAnimationFrame` en lugar de directo, para que el cálculo ocurra después del pintado del DOM
  - `clear()` actualizado para resetear `lines[]`
- Fix CSS en `theme.css`:
  - `min-height: 0` en `#main-layout` y `#terminal-panel`
  - Sin este fix, los contenedores flex anidados no propagan el contexto de scroll a sus hijos, y `overflow-y: auto` en `#terminal-output` nunca activa el scrollbar

**Decisiones tomadas:**
- Aproximar `1K` y `0K` (erase to cursor/erase from cursor) como "borrar línea entera" — no rastreamos columna X, y en la práctica p10k siempre usa `2K` o `\r`
- Ignorar `\x1b[C`/`\x1b[D` (cursor right/left) y `\x1b[s`/`\x1b[u` (save/restore) — no afectan contenido visible sin tracking de columna

**Problemas encontrados y soluciones:**
- Comandos no aparecían en output: p10k usa `\x1b[2K` + `\x1b[G` + `\x1b[A` para redibujar el prompt; estos CSI no estaban implementados → agregados en v3
- Scroll no seguía al final: doble causa — (1) `min-height: 0` faltante en flex parents, (2) `scrollTop = scrollHeight` ejecutándose antes del repintado → solucionado con ambos fixes

**Estado al final:**
- Comandos visibles en output ✅ (p10k sequences manejadas)
- Scroll sigue al final automáticamente ✅
- Cursor up/down funcional para repintado de prompt ✅
- 6 commits en GitHub ✅

**Próximo paso:** Fase 2 — explorador de archivos lateral, Command Knowledge Base en SQLite.

---

## 2026-05-21 — Sesión 2: PTY + Parser VT

**Estado al inicio:** Esqueleto compilando, ventana abierta pero sin bash ni colores.

**Qué se hizo:**
- Implementado PTY wrapper completo en `pty.rs`: spawn de la shell del usuario (`$SHELL`), thread lector de output, comandos `spawn_shell` y `write_to_shell`
- Corregido el acceso a la API de Tauri en JS (`withGlobalTauri: true` + `window.__TAURI__.invoke`)
- Implementado `vt_parser.js`: parser ANSI→HTML con estado persistente entre chunks. Soporta 16 colores, paleta 256, true color 24-bit, bold, italic, underline
- Añadido `white-space: pre-wrap` al output para saltos de línea correctos
- Configuradas variables de entorno al spawnear la shell: `TERM`, `COLORTERM`, `LANG`, `LC_ALL`
- Configurado repo en GitHub (`github.com/Teshre/Ocote`), licencia MIT
- Resuelto conflicto de merge entre repo local y remoto
- Agregado `.gitignore` (excluye `target/`, `node_modules/`)
- Git configurado localmente para no interferir con otros proyectos

**Decisiones tomadas:**
- Parser VT en JavaScript (no en Rust con `vte`) — más simple de depurar en Fase 1, el estado es más manejable. El `vte` crate entra en Fase 2 con el screen buffer.
- `insertAdjacentHTML` en lugar de `innerHTML +=` para mejor performance al acumular output

**Problemas encontrados y soluciones:**
- PTY sin output: `withGlobalTauri: false` por defecto hacía que `invoke` y `event.listen` fueran undefined → activar `withGlobalTauri: true`
- `window.__TAURI__.tauri.invoke` incorrecto → usar `window.__TAURI__.invoke` directamente
- `Caf%C3%A9` en output de eza → fix con `LANG=en_US.UTF-8` y `LC_ALL=en_US.UTF-8`
- `git push` rechazado: GitHub inicializó el repo con un README creando historia divergente → `git pull --allow-unrelated-histories --no-rebase`

**Estado al final:**
- zsh conectado al PTY ✅
- Colores del prompt p10k visibles ✅
- `ls` con colores de archivos ✅
- Repo en GitHub con 5 commits ✅

**Próximo paso:** Manejo de `\r` (carriage return) para el prompt de p10k, y explorador de archivos (Fase 2).

---

## 2026-05-21 — Sesión 1: Arranque del proyecto

**Estado al inicio:** Idea y roadmap definidos. Cero código.

**Qué se hizo:**
- Lectura del roadmap completo (Roadmap Ocote.html)
- Decisión de stack: Rust + Tauri v1 + HTML/CSS/JS vanilla + SQLite
- Instalación de Rust (rustup), Cargo 1.95, Node.js 25, pnpm 11
- Creación de la estructura completa del proyecto desde cero
- Archivos Rust base con TODOs marcados por fase:
  - `main.rs`, `pty.rs`, `vt_parser.rs`, `ckb.rs`, `fs_explorer.rs`, `context.rs`
- Frontend completo con lógica base (historial de comandos, navegación con flechas, Esc para cerrar tooltip)
- CKB inicial con 12 comandos de muestra en `commands.json`
- Íconos placeholder generados (naranja Ocote #F5A623)
- Corrección del PATH de Cargo en `.zshrc` (rustup no lo había añadido)
- Cambio de npm a pnpm por razones de seguridad
- **Primera compilación exitosa** y ventana nativa de Ocote abierta en macOS

**Decisiones tomadas:**
- Usar Tauri v1 (no v2) — más documentación disponible al momento
- Frontend vanilla sin frameworks — la UI no justifica la complejidad de React/Vue
- pnpm sobre npm — más seguro y eficiente con el store global de paquetes
- Íconos placeholder en naranja Ocote hasta tener diseño real

**Problemas encontrados y soluciones:**
- `tauri dev` fallaba con "No such file or directory" → PATH de Cargo no estaba en `.zshrc`
- `generate_context!()` requiere `icons/icon.png` aunque el array de íconos esté vacío → generamos PNGs mínimos con Python
- `fs_explorer.rs` tenía `Deserialize` importado sin usar → removido

**Estado al final:**
- Ventana de Ocote abriendo en macOS ✅
- 7 warnings esperados (structs de fases futuras sin usar) ✅
- Sin errores de compilación ✅

**Próximo paso:** Implementar el PTY wrapper en `pty.rs` — conectar bash/zsh al input/output de la ventana. (Fase 1, Semanas 3-4)

---

## 2026-05-22 — Sesión 6: Explorador de archivos lateral + sincronización bidireccional

**Estado al inicio:** Terminal funcional con xterm.js (v0.3.0). Fase 2 en progreso: explorador de archivos planeado pero no implementado.

**Qué se hizo:**

### Implementación de `fs_explorer.rs`
- Comando Tauri `list_directory(path)` que lee un directorio y devuelve `Vec<FileEntry>`
- Estructura `FileEntry` con: name, path, is_dir, size
- Filtrado de archivos ocultos (empiezan con `.`)
- Ordenamiento: carpetas primero (alfabéticamente), luego archivos (alfabéticamente)
- Comando `get_home_directory()` con múltiples métodos de detección (HOME, home_dir(), /Users/<user>)

### Implementación de `explorer.js`
- Panel lateral con lista de archivos y carpetas con iconos (📁 para carpetas, iconos por extensión para archivos)
- Click en carpeta → navega dentro y ejecuta `cd` en el PTY
- Botón `..` (↩) para subir un nivel
- Breadcrumb en la barra superior muestra la ruta actual (`~/Documents/proyecto`)
- Scroll independiente en el panel lateral

### Sincronización bidireccional terminal ↔ explorador
- **Explorador → Terminal:** click en carpeta envía `cd "<carpeta>"\n` al PTY
- **Terminal → Explorador:** polling cada 2 segundos vía `get_shell_cwd()` que usa `lsof -p <pid> -d cwd` (macOS) para leer el CWD real del proceso zsh
- Sin modificar `.zshrc` — detección pura del sistema operativo

### Fix de `invoke` duplicado
- Descubierto que múltiples scripts (`terminal.js`, `explorer.js`, `tooltip.js`, `autocomplete.js`) declaraban `const { invoke }` en el scope global, causando `SyntaxError: Can't create duplicate variable`
- Fix: todos los scripts (excepto `terminal.js`) usan `window.__TAURI__.invoke` directamente

### CSS del explorador
- Estilos `.explorer-item`, `.explorer-folder`, `.explorer-file`, `.explorer-up`
- Hover effect con `background: var(--accent-dim)`
- Truncado de nombres largos con ellipsis
- Iconos por extensión de archivo (📜 JS, 🦀 Rust, 🐍 Python, etc.)

**Decisiones tomadas:**
- Polling de CWD cada 2 segundos en vez de shell integration (modificar `.zshrc`): más simple, no requiere cambios en la config del usuario, y funciona con cualquier shell
- Iconos con emoji en vez de iconos SVG: más rápido de implementar, cross-platform sin dependencias de fuentes
- `window.__TAURI__.invoke` directo en vez de módulos ES: los scripts se cargan con `<script src>` en el HTML, no hay bundler que maneje módulos

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Panel lateral vacío | `const { invoke }` duplicado entre scripts → `SyntaxError` | Usar `window.__TAURI__.invoke` en todos los scripts |
| Botón `..` no funciona | Faltaba `data-is-dir="true"` en el div del botón subir | Agregar atributo + manejar en `handleClick` |
| `cd ..` en terminal no actualiza explorador | El explorador no sabía el CWD actual del proceso shell | `get_shell_cwd()` vía `lsof` + polling cada 2s |
| `cd` en terminal no actualiza explorador | Mismo problema: no había sincronización terminal→explorador | Mismo fix: polling de CWD |

**Estado al final:**
- Explorador de archivos funcional con navegación y sincronización ✅
- Sincronización bidireccional terminal ↔ explorador ✅
- Sin errores de JS conocidos ✅
- 12 commits en GitHub (rama `main`) ✅

**Próximo paso:** Fase 2 — Command Knowledge Base en SQLite (`ckb.rs`), autocompletado visual con descripciones (`autocomplete.js`).

---

<!-- Plantilla para próximas sesiones:

## YYYY-MM-DD — Sesión N: Título

**Estado al inicio:** ...

**Qué se hizo:**
- ...

**Decisiones tomadas:**
- ...

**Problemas encontrados y soluciones:**
- ...

**Estado al final:**
- ...

**Próximo paso:** ...

-->
