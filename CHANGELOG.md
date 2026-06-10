# Changelog — Ocote

Todos los cambios notables del proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [0.5.4] — 2026-06-09

### Agregado
- Primer lanzamiento público con binarios firmados para macOS, Windows y Linux.
- Assets distribuidos vía GitHub Releases con verificación criptográfica (`latest.json` + firmas).
- Landing page (ocote.app) actualizada con versión y enlaces a la release.

## [0.5.9] — 2026-06-09

### Corregido
- **Carpetas con acentos en producción**: el explorador fallaba con paths normalizados NFC/NFD en
  macOS en producción pero no en desarrollo. Fix: normalización de paths en `list_directory`.
- **Instalador de Windows en chino**: el instalador NSIS mostraba chino simplificado en lugar de
  español. Fix: lista de idiomas corregida en `tauri.conf.json`.

## [0.5.8] — 2026-06-09

### Corregido
- **Ícono por defecto ahora es light**: el bundle `.app` usaba el ícono dark como predeterminado.
  El light es el diseño base (el dark es la variante). Se cambió `icons/icon.icns` y `icons/icon.png`
  a la versión light. Tambien se actualizó `DEFAULTS.appIcon` en settings y onboarding a `'light'`.

## [0.5.7] — 2026-06-09

### Corregido
- **Fix del fix de HISTFILE**: v0.5.6 usó `: "${HISTFILE:=$HOME/.zsh_history}"` que no funciona porque
  zsh setea `HISTFILE` antes de leer `.zshrc`. El `:=` condicional nunca se dispara. Ahora se verifica
  si `HISTFILE` apunta al bundle y se redirige forzadamente.

## [0.5.6] — 2026-06-09

### Corregido
- **Code signing seal roto por zsh history dentro del bundle**: Ocote setea `ZDOTDIR` a `resources/shell/`
  dentro del `.app`. Zsh por defecto escribe el historial en `$ZDOTDIR/.zsh_history`, creando un archivo
  dentro del bundle firmado. macOS Gatekeeper detectaba la modificación → sello roto → auto-updater
  dejaba la app "dañada". Fix: redirigir HISTFILE fuera del bundle en `.zshrc`.

## [0.5.5] — 2026-06-09

### Corregido
- **Explorer race condition con paths acentuados**: paths con caracteres no-ASCII (como `Café Divergente-Hub`)
  fallaban con "Operación fuera del directorio permitido" por diferencia de normalización Unicode
  (NFC vs NFD). Fix: normalización NFC en `validate_path_in_root` y `set_shell_cwd`.
- **Shell path escaping**: `cd` desde el explorador ahora escapa correctamente paths con `$`, `"` o `` ` ``.
- **Retry en loadDirectory**: reintento automático ante race condition transitoria del CWD del backend.

## [Unreleased]

### Fase 4 — En progreso
Próximo paso: auto-updater, build de producción continuo.
(Ícono real, landing page y SEO concluidos en otras conversaciones.)

### Corregido — 2026-06-09 (sesión 23)

- **Instalador de Windows en chino mandarín**: el wizard NSIS aparecía en chino simplificado sin opción de cambiar idioma (`languages: ["SimpChinese"]`, `displayLanguageSelector: false` — restos de un template). Corregido: los 6 idiomas de Ocote (español internacional + España, inglés, portugués BR, francés, alemán) con español primero (LatAm), y el selector de idioma activado para que el usuario elija al instalar.
- **Carpetas con acentos en producción** (`Café Divergente`, etc.): el explorador y la terminal lanzaban "Directorio padre inválido … No such file or directory" al entrar a carpetas con caracteres acentuados (solo en el build empaquetado, no en dev). Causa: la validación de paths usaba `canonicalize()`/`exists()` con bytes exactos, y macOS guarda los nombres en distinta forma de normalización Unicode (NFC `é` vs NFD `e`+◌́) según cómo se crearon. El path llegaba en una forma que no byte-coincidía con el disco → ENOENT. Fix: `resolve_existing()` prueba la forma cruda, NFC y NFD; en APFS estándar la forma NFC siempre resuelve sin importar la del disco. Aplica a los 13 comandos de archivos (listar, preview, crear, renombrar, eliminar, buscar, git status).

### Seguridad — 2026-06-06 (sesión 22)

Audit de seguridad + corrección de race condition. Build de producción verificado
(`.app` + `.dmg` generados en `target/release/bundle/`).

#### Corregido (9 fixes)

- **XSS en prompt.js** (`prompt.js`): `m.cwd`, `m.branch` y `m.time` del JSON
  emitido por el shell vía OSC 6731 se inyectaban con `innerHTML` sin escapar
  en los 8 renderers (2 funciones `renders` × 4 presets). Una rama git con
  `<img src=x onerror=…>` o un path con `<script>` ejecutaba código en el
  contexto del WebView. Fix: función `esc()` local (mismo patrón que
  `escapeHtml` en `explorer.js` y `esc`/`escHtml` en `aliases.js`/`searcher.js`).
- **Path traversal en `fs_explorer.rs`**: las 10 funciones (`list_directory`,
  `read_text_file`, `read_file_base64`, `create_file`, `create_directory`,
  `delete_item`, `delete_item_recursive`, `count_dir_entries`, `rename_item`,
  `search_files`) aceptaban cualquier path sin validación. Un payload XSS
  combinado podía apuntar a `~/.ssh/id_rsa` o `/etc/passwd`. Fix: el shell
  reporta su CWD vía OSC 6731 → el backend lo guarda en `ShellState.cwd: Mutex<Option<PathBuf>>`
  por `shellId`; cada operación de archivo valida que su `path` sea hijo
  del `cwd` del shell activo (canonicalize + `starts_with`).
- **Inyección en `osascript` (macOS dev notifications)**: el `title` y `body`
  de notificaciones del sistema se interpolaban en una cadena `-e` de
  AppleScript sin escapar; un comando con `"` o `\` rompía el script y
  permitía ejecutar AppleScript arbitrario. Fix: nueva función
  `osascript_escape()` que escapa `\n`/`\r`/`\t` y descarta controles ASCII.
- **Lectura ilimitada de archivos** (`read_text_file`/`read_file_base64`):
  un preview de un archivo de 4GB congelaba el WebView. Fix: constante
  `MAX_PREVIEW_SIZE = 10 * 1024 * 1024` (10MB) aplicada en ambas funciones;
  el frontend muestra un warning si el archivo excede el límite.
- **CSP permisivo** (`tauri.conf.json`): el `default-src 'self' 'unsafe-inline' 'unsafe-eval'`
  permitía inyectar CSS/JS arbitrario si se comprometía un asset. Fix: CSP
  estricto — `default-src 'self'; img-src 'self' data: asset: https://asset.localhost;
  style-src 'self' 'unsafe-inline'; script-src 'self'; font-src 'self' data:`.
  `'unsafe-inline'` se mantiene en styles porque el JS genera estilos dinámicos
  para el preview/highlight.js.
- **`search_files` validaba contra HOME, no contra el shell**: el buscador
  de archivos (Ctrl+P) usaba el CWD del usuario (HOME) en vez del CWD del
  shell activo, saltándose la validación de path traversal. Fix: ahora
  `search_files` también recibe `shell_id` y usa `check_path_for_shell`.
- **Errores I/O del PTY silenciados**: si el thread lector del PTY fallaba
  (broken pipe, EOF inesperado), el error se logueaba pero el usuario no
  recibía feedback. Fix: el thread ahora también emite un evento `pty-error`
  vía Tauri y loguea el error con contexto del shell.
- **Race condition `cd` ↔ explorador** (la fix más visible para el usuario):
  cuando el usuario hacía `cd ..` desde una subcarpeta, el backend rechazaba
  la siguiente `list_directory` con `"Operación fuera del directorio permitido"`
  porque el `set_shell_cwd` (async) llegaba al backend DESPUÉS que el
  `list_directory` del explorador. El handler OSC 6731 los disparaba en
  paralelo. Fix: en `terminal.js` el handler ahora hace
  `invoke('set_shell_cwd').finally(() => onShellCwdChanged)` — el explorador
  SIEMPRE se sincroniza después de que el backend tiene el nuevo CWD.
  También removidos los `loadDirectory(path)` optimistas del breadcrumb y
  del click en carpeta del explorador (eran UX tricks que rompían con la
  validación estricta; el OSC 6731 los cubre).
- **`~` no se expandía en `set_shell_cwd`** (`pty.rs`): el shell emite
  `~` literal en el cwd de OSC 6731 (es la convención POSIX), pero el
  backend intentaba `canonicalize("~")` que falla. Fix: `expand_home()`
  convierte `~` → `$HOME` (y `~/x` → `$HOME/x`) antes de canonicalizar.
  También `check_path_for_shell` ahora acepta `shell_id: Option<String>`;
  si el shell no tiene CWD aún o no existe, usa `home_dir()` como fallback
  (para que el explorador funcione al inicio antes del primer OSC 6731).

#### Cambiado

- **Path validation: solo CWD del shell activo** (estricto, no HOME):
  por seguridad, las operaciones de archivo validan contra el CWD que el
  shell reporta vía OSC 6731, no contra el HOME del usuario. Defense-in-depth
  contra XSS combinado con path traversal.
- **Shell-id opcional en backend**: las funciones de `fs_explorer.rs`
  reciben `shell_id: Option<String>`. Si el frontend aún no pasó el id
  (caso edge al inicio), el backend hace fallback a HOME.

#### Chore

- **`.gitignore` ampliado**: `.agents/`, `.claude/`, `skills-lock.json`
  (artefactos de opencode/Claude Code, locales al entorno de desarrollo) y
  `demo/` (proyecto HyperFrames local usado para generar previews del README;
  los assets finales viven en `docs/assets/`).

### Agregado — 2026-06-05 (sesión 21)

- **Workspaces (espacios de trabajo conmutables)** — opcional, se activa en Settings → General:
  - Barra entre la ruta y las pestañas con tus espacios: `[◈ Default] [proyecto] [otro] [+ Workspace]`.
  - Cada workspace es un espacio independiente con sus propias pestañas y paneles divididos.
  - **+ Workspace** crea un espacio nuevo vacío y entras a trabajar de inmediato.
  - **Auto-guardado**: todo lo que haces en un workspace (pestañas, paneles, carpetas) se guarda solo. Sin diálogos.
  - Cambiar de espacio conserva el avance de cada uno (instancias vivas durante la sesión); se restauran al reabrir.
  - **Default** es un espacio borrador que no se guarda.
  - 100% opcional: apagado (por defecto), Ocote funciona exactamente como antes.

### Agregado — 2026-06-05 (sesión 20)

- **Referencia de atajos de teclado** — modal con todos los atajos de Ocote, accesible desde el botón ⌨ de la barra superior:
  - Agrupados por categoría (pestañas/paneles, navegación, terminal, ayuda).
  - Plataforma-aware: muestra ⌘⌥⇧⌃ en macOS y Ctrl/Alt/Shift en Windows/Linux.
  - Incluye los atajos de terminal bundleados (historial fzf, cd fuzzy, aceptar sugerencia).
- **Onboarding actualizado** — refleja las capacidades nuevas:
  - 6 features (agregadas "Pestañas y paneles" y "Búsqueda y atajos").
  - Usa el ícono real de Ocote (variante light/dark según preferencia).
  - Sigue el tema activo; traducido a los 5 idiomas.

### Agregado — 2026-06-04 (sesión 19)

- **Editor de aliases** — crea atajos de comandos sin editar tu `.zshrc` a mano (Settings → tab Aliases):
  - CRUD visual: nombre → comando, con validación y eliminación.
  - No toca la config real del usuario: los aliases viven en archivos propios de Ocote que las configs de shell sourcean.
  - Soporte de los 4 shells, cada uno con su sintaxis (zsh/bash `alias`, fish `alias`, PowerShell `function` porque Set-Alias no acepta argumentos).
  - Se aplican en pestañas nuevas; persisten entre reinicios.

### Agregado — 2026-06-04 (sesión 18)

- **Estadísticas de uso** — dashboard offline (botón de gráfico en la barra superior, junto a ⚙️):
  - **Top programas y comandos más usados** desde tu historial del shell (zsh/bash/fish/PowerShell), disponible desde el primer uso.
  - **Hora pico, tasa de éxito/error, comando más lento y días activos** desde un log propio que registra cada comando ejecutado en Ocote (vía OSC 133), guardado en SQLite local.
  - Total de comandos, comandos únicos, gráfico de actividad por hora del día.
  - 100% offline: tu historial y comandos nunca salen de tu máquina, sin IA, sin red.
  - Soporte de los 4 shells; lectura robusta del historial (maneja bytes no-UTF8 y comandos multilínea).

### Agregado — 2026-06-04 (sesión 17)

- **Buscador de archivos (Ctrl+P)** — búsqueda fuzzy recursiva de archivos y carpetas en el directorio actual, estilo VSCode:
  - Comando Rust `search_files` recursivo (máx 6 niveles, 50 resultados); omite node_modules, .git, target, dist, __pycache__, etc.
  - Orden por relevancia (exacto → empieza-con → contiene); resalta el match en color accent.
  - Enter abre el archivo en preview o hace `cd` a la carpeta; Cmd+Enter pega la ruta en el terminal.
  - Botón de lupa visible en la barra del explorador (junto al `..`).
- **Buscador de texto en terminal (Ctrl+F)** — busca dentro del output del terminal con el SearchAddon oficial de xterm.js:
  - `@xterm/addon-search` v0.16 bundleado; resalta coincidencias en el canvas.
  - Barra flotante arriba-derecha; Enter/Shift+Enter navega siguiente/anterior.
  - Botón de lupa visible junto al `+` de la barra de tabs.
- **Split panes recursivos** — cada tab puede dividirse en varios terminales (árbol binario tipo iTerm/tmux):
  - Cualquier pane se divide otra vez, en cualquier dirección, sin límite.
  - Botones en la barra de tabs (lado a lado / apilado) + atajos Cmd+D, Cmd+Shift+D.
  - Cmd+Alt+flechas cicla el foco; Ctrl/Cmd+W cierra el pane (si es el último, cierra el tab).
  - Divisores arrastrables para redimensionar; badge contador de panes en el tab.
  - Cada pane es una caja con borde visible (theme-aware); el pane enfocado se resalta con el acento del tema.

### Agregado — 2026-06-04 (sesión 16)

- **Notificaciones de tab** — dot de 6px en tabs de fondo cuando termina un comando:
  - 🟢 Verde (éxito): animación pop, desaparece en 4 segundos.
  - 🔴 Rojo (error): persiste hasta que el usuario abre el tab.
  - Se limpia automáticamente al activar el tab.
- **Notificaciones del sistema operativo**:
  - macOS dev: `osascript` — funciona sin registro ni permisos del sistema.
  - macOS producción: API de Tauri (`UNUserNotificationCenter`) — muestra ícono real de Ocote; pide permiso una sola vez al usuario.
  - Linux: `notify-send`. Windows: API de Tauri.
  - Configurable en Settings → General: toggle on/off + umbral de duración (3s / 5s / 10s / 30s, default 5s).
- **Toggle switch HTML** en Settings para notificaciones (estilo visual consistente con la UI de Ocote).

### Corregido — 2026-06-04

- **AeroSpace / tiling WMs**: el terminal "se trababa" al volver de otro workspace. Fix: `window.addEventListener('focus')` relanza `term.focus()` en el tab activo. Resize de ventana con debounce 150ms llama `fitAddon.fit()` en todos los tabs.
- **Detección de foco para notificaciones**: 3 capas para máxima cobertura:
  1. `window blur/focus` (DOM nativo)
  2. `tauri://focus/blur` (eventos del framework)
  3. `setInterval 300ms` con `document.hasFocus()` — necesario para AeroSpace, que no dispara `blur` DOM entre ventanas del mismo espacio
- **Notificación no disparaba en tab activo**: el check `shellId === activeShellId → return` bloqueaba las notificaciones cuando el usuario corría un comando en el tab activo y se iba a otra app. Ahora notifica siempre que la app esté en background.
- **requestAnimationFrame pausado en background**: `onCommandFinished` estaba dentro de rAF, que se pausa en WKWebView cuando la ventana no tiene foco. Movido fuera del rAF para ejecutarse síncronamente.
- **Web Inspector**: `Cmd+Option+I` abre DevTools en dev mode (el menú contextual del explorador reemplazó el "Inspect" nativo del browser).

### Agregado — 2026-06-03

- **Menú contextual del explorador rediseñado** — íconos SVG Tabler inline (consistentes con el explorador, sin emojis), hover con `accent-dim` + borde izquierdo naranja, grupo "CREAR" con etiqueta, animación `scale+translateY` al aparecer.
- **Operaciones de archivo completas** en el explorador:
  - Crear archivo o carpeta (input inline en el panel).
  - Renombrar inline (input sobre el nombre del ítem).
  - Eliminar con confirmación nativa HTML (`ocoteConfirm`).
  - Copiar ruta al portapapeles.
- **`ocoteConfirm(message)`** — modal HTML propio que reemplaza `window.confirm()`. Este diálogo nativo del navegador no funciona en Tauri/WKWebView (macOS): retorna `true` inmediatamente sin mostrar nada. El modal de Ocote usa las variables CSS del tema activo, animación pop-in, backdrop blur, foco en "Cancelar" por seguridad, y Esc/Enter como atajos. Retorna `Promise<boolean>`.
- **Borrado recursivo de carpetas** con confirmación informativa: se muestra el número de elementos contenidos ("contiene 5 elementos. ⚠️ Todo se eliminará permanentemente"). Dos nuevos comandos Rust en `fs_explorer.rs`:
  - `count_dir_entries(path)` → número de hijos directos.
  - `delete_item_recursive(path)` → `remove_dir_all` para carpetas, `remove_file` para archivos.
- **Preview de archivos** (`preview.js` + `highlight.js` bundleado):
  - Código con syntax highlighting automático (40+ lenguajes, sin CDN).
  - Imágenes (png/jpg/gif/svg/webp) via `read_file_base64` → data URL.
  - Warning para archivos >500KB; mensaje de fallback para binarios.
  - Se abre con doble-click en el explorador o desde el menú contextual → "Vista previa".
- **Redimensionamiento de paneles** (`resizer.js`):
  - Handles de arrastre entre explorador↔terminal y terminal↔preview.
  - Anchos mínimos: explorador 120px, preview 180px. El terminal toma el resto (`flex:1`).
  - Los anchos se persisten en `localStorage` y se restauran al reiniciar.
  - Durante el drag se desactiva `transition` para fluidez; al soltar se llama `fitAddon.fit()`.
  - `MutationObserver` oculta el handle cuando el panel adyacente está colapsado u oculto.
- **5 temas de íconos** en el explorador (Settings → Apariencia → Estilo de íconos):
  - `Outline` — SVGs stroke de Tabler Icons, ya existía.
  - `Badge` — etiquetas de texto con fondo de color, ya existía.
  - `Ember` ✨ — cuadrado con borde + fill 18% en los colores del tema activo. Cambia automáticamente al cambiar el tema de color.
  - `Brand` ✨ — cuadrado sólido con el color oficial de cada tecnología (JS amarillo, TS azul, Rust naranja…).
  - `Symbols` ✨ — glifo Unicode desnudo, sin fondo (`λ` JS, `π` Python, `⚙` Rust, `☕` Java…).
- **Preview en vivo de íconos en Settings** — cuadrícula de 12 ítems (8 archivos + 4 carpetas) que se actualiza instantáneamente al cambiar el tema de íconos, sin salir del modal.

### Agregado
- **8 temas oficiales de Ocote** (paletas originales "alma de lumbre", base16): Ocote, Brasa, Bosque, Noche, Papel, Tinta, Mezcal, Cacao. Generados programáticamente en `themes.js` desde `OCOTE_THEME_DATA` (espejo del repo [ocote-themes](https://github.com/Teshre/ocote-themes)) — cada tema deriva su `xterm`, `css` y `tokens` de la paleta base16. Para agregar/quitar: editar solo `OCOTE_THEME_DATA`.
- **Selector de temas con mini-preview** — cada tema se muestra como una card con un mini-terminal coloreado con su paleta ANSI real (porteado de `ocote-themes/gallery.js`), nombre, etiqueta Oscuro/Claro, descripción y swatches de paleta. Reemplaza el círculo simple anterior.

### Cambiado
- **Temas: solo los 8 oficiales de Ocote** — se eliminaron los 8 temas ajenos (Dracula, One Dark, Monokai, Solarized×2, Gruvbox, Nord, Tokyo Night) por identidad de marca. Default cambiado de `dark` a `ocote`. Migración automática para usuarios existentes: `dark`→`ocote`, `light`→`papel`, cualquier otro→`ocote`.
- **README bilingüe** (`README.md` inglés principal + `README.es.md` español) con ícono real, badges, star history y sección de los 8 temas con link a ocote-themes.
- **Bundling de binarios por plataforma** — antes cada build empaquetaba los 15 binarios (fzf+zoxide+bat × 5 plataformas, ~59MB). Ahora usa configs de plataforma de Tauri v1 (`tauri.macos/linux/windows.conf.json`) para que cada OS bundlee solo sus binarios. macOS verificado: 6 binarios darwin (23MB), cero peso muerto de linux/windows. NOTA: el merge de Tauri v1 reemplaza arrays (no concatena), por eso cada config repite la lista completa de recursos + sus binarios; el base ya no lista `resources/bin`.

### Agregado
- **Soporte PowerShell** (`prompt.ps1`): `function prompt` con los 5 presets + OSC 6731/133 A/D. PSReadLine aporta autosuggestions (PredictionSource History) + syntax highlighting NATIVOS. fzf vía handlers manuales de PSReadLine (Ctrl+R historial, Alt+C cd — fzf no tiene `--powershell`). `pty.rs`: Windows ahora prefiere `pwsh.exe` (antes hardcodeaba `cmd.exe`); inyección vía `-NoExit -Command ". 'hook'"`. Validado en PowerShell 7.6.2. **4 shells soportados.**
- **zoxide v0.9.9** (`z` — cd inteligente) bundleado e integrado en las 4 shells.
- **bat v0.26.1** (cat con syntax highlighting) bundleado, disponible como comando `bat` (sin aliasear `cat` — preserva la enseñanza del CKB).
- 15 binarios bundleados (fzf+zoxide+bat × 5 plataformas), vía glob `resources/bin/**/*`.
- **Soporte fish** (`prompt.fish`): `fish_prompt` con los 5 presets + OSC 6731/133 A/D. fish trae syntax highlighting y autosuggestions NATIVOS (sin plugins). `pty.rs` spawnea fish con `-C "source <hook>"` (corre después de `config.fish`). fzf integrado (Ctrl+R, Alt+C). Validado en fish 4.7.1.
- **Bash hook con paridad de overlays** (`bash-hook.bash`): emite OSC 133 A al FINAL de PS1 (no en precmd) para posicionar overlays de pill/ribbon/rail/block; info line (path · git · hora) por preset; fzf integrado. (Sin autosuggestions/highlighting — son plugins solo-zsh.)

### Cambiado
- **Binarios fzf reestructurados** a subdir por plataforma con nombre `fzf` (`bin/darwin-arm64/fzf`, etc.) en vez de `fzf-darwin-arm64`. El dir se añade al PATH → `fzf` es un comando real en las 3 shells, **sin función wrapper**. Necesario para fish (su integración valida `command -q fzf`, que no encuentra funciones) y más limpio en zsh/bash.

### Corregido
- **Explorador se revertía con PowerShell** — el polling `get_shell_cwd` lee el cwd del PROCESO a nivel OS, pero `Set-Location` de PowerShell NO lo cambia (PS mantiene su ubicación interna). El polling revertía el sync correcto del OSC 6731. Ahora, una vez que un shell emite OSC 6731 queda "OSC-managed" y el polling no lo toca (solo es fallback para passthrough). También hace más robustos a zsh/bash/fish.
- **Bash: escapes de color sin envolver** — `_ocote_git`/`_ocote_arrow` emitían ANSI crudo vía `$(...)`; en bash eso desfasa el cursor (mismo gotcha que el OSC en zsh). Ahora envueltos en `\001`/`\002` (equivalente byte-level de `\[ \]`, que no funciona dentro de command substitution).
- **Ícono del dock no cambiaba en macOS** — `window.set_icon()` de Tauri v1 es no-op en el dock de macOS (no hay íconos por-ventana). Ahora `set_app_icon` usa una rama nativa vía objc: `[[NSApplication sharedApplication] setApplicationIconImage: img]` (crates `cocoa`/`objc`). Win/Linux siguen con `set_icon`.
- **Íconos demasiado grandes en el Dock de macOS** — el master era borde-a-borde; macOS espera el arte a 824×824 centrado (margen de 100px) o el ícono se ve más grande que las apps nativas. Regenerados bundle (`pnpm tauri icon`) + runtime swap + preview desde los masters con margen de `Ocote design/export/icons/macos/`. Light/dark se mantienen gemelos (diferencia óptica aceptable, decisión de diseño).

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
