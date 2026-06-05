# Devlog — Ocote

Registro de cada sesión de desarrollo. Qué se hizo, qué se aprendió, qué quedó pendiente.
Formato: fecha → qué se construyó → decisiones tomadas → próximo paso.

---

## 2026-06-05 — Sesión 20: referencia de atajos + onboarding actualizado

**Estado al inicio:** las 5 mejoras del roadmap completas. Faltaba que el usuario pudiera descubrir/recordar los atajos (habíamos agregado muchísimos), y el onboarding estaba desactualizado.

### Referencia de atajos de teclado

Tras tantas sesiones agregando atajos (Ctrl+T/W/B/P/F, Cmd+D/Shift+D, Cmd+Alt+flechas, etc.), un usuario no tenía forma de descubrirlos. Construí un modal de referencia: recopilé TODOS los atajos directamente del código (grep de keydown handlers) para que la lista sea exacta, los agrupé (Pestañas/paneles, Navegación, Terminal, Ayuda) e incluí también los de shell/fzf bundleados (Ctrl+R historial, Alt+C cd fuzzy, → aceptar sugerencia). Plataforma-aware: ⌘⌥⇧⌃ en mac, Ctrl/Alt/Shift en otros. Botón ⌨ en la barra superior. 100% estático, sin Rust.

Decisión: no forzar un atajo para abrir el panel (Cmd+/ y similares chocan con el shell o son inconsistentes). El botón visible es la vía discoverable; documenté que si se cambia un atajo en el código hay que reflejarlo en `GROUPS`.

### Onboarding actualizado

El onboarding tenía 4 features de hace varias fases. Lo actualicé a 6, agregando "Pestañas y paneles" y "Búsqueda y atajos" (con chips `<kbd>` que enseñan los atajos), traducidas a los 5 idiomas. El logo pasó del `icon.png` viejo al ícono real (`icons/icon-dark.png`/`icon-light.png`) según la variante guardada en Settings.

Verificación de theme-awareness (lo que el usuario pidió confirmar): el onboarding ya era theme-aware porque usa variables CSS, y `settings.js applyAll()` aplica el tema en la carga (síncrono) antes de que el onboarding aparezca (delay 600ms). Sin cambios necesarios ahí, solo lo confirmé.

### Contexto

El usuario mencionó que el ícono real, la landing page y varios puntos de SEO ya se concluyeron en otras conversaciones (fuera de este repo de código). Próximo en el roadmap: workspace-save estilo Warp, firma de código macOS, auto-updater.

---

## 2026-06-04 — Sesión 19: editor de aliases visual

**Estado al inicio:** las 4 primeras mejoras del roadmap listas. Falta el editor de aliases — la última, y la más "anti-fricción para principiantes".

### Decisión de diseño: no tocar el .zshrc del usuario

El valor de la feature es "crea aliases sin editar tu .zshrc a mano". La trampa sería escribir en el `.zshrc` real del usuario — invasivo y arriesgado. En su lugar: JSON como fuente de verdad en app_data_dir, del que se generan archivos por-shell que las configs bundleadas de Ocote sourcean vía la env var `OCOTE_ALIASES`. El `.zshrc` del usuario nunca se modifica; los aliases viven 100% en el dominio de Ocote.

### El reto multi-shell

Cada shell tiene sintaxis distinta de alias:
- zsh/bash: `alias gs='git status'`
- fish: `alias gs 'git status'`
- **PowerShell: no se puede.** `Set-Alias` solo mapea un nombre a OTRO comando, sin argumentos. Para `gs = git status` (con argumento) hay que generar una FUNCIÓN: `function gs { git status @args }`. Esto fue lo no-obvio del feature.

Por eso `regenerate_files` genera 3 archivos (`aliases.sh`, `aliases.fish`, `aliases.ps1`) y `pty.rs` apunta `OCOTE_ALIASES` al correcto según el shell que arranca.

### Carga: env var + source en las configs

Las 4 configs bundleadas (.zshrc, bash-hook.bash, prompt.fish, prompt.ps1) ahora sourcean `$OCOTE_ALIASES` DESPUÉS de la config del usuario — así los aliases de Ocote ganan en conflictos. `pty.rs` resuelve `app_data_dir` vía `window.app_handle().path_resolver()` (ya tenía `use tauri::Manager`, mi import duplicado causó un E0252 que removí).

### Comportamiento: pestañas nuevas

Los aliases aplican en pestañas nuevas (las configs sourcean al arrancar el shell), no en shells ya abiertos. Consideré re-inyectar en vivo a los shells abiertos, pero es fiddly (no sabemos el shell de cada pane desde el front, y escribir al PTY mid-sesión interfiere). El modelo "nuevas pestañas" es como funciona la config de shell normalmente y el hint en la UI lo aclara. Honesto y simple.

### Cierre del roadmap de mejoras

Con esto, las 5 mejoras "out of the box" que recomendé están completas: notificaciones, buscadores, split panes, estadísticas, aliases. Próximo: workspace-save estilo Warp (futuro), ícono real, landing, firma de código.

---

## 2026-06-04 — Sesión 18: estadísticas de uso (historial + log propio)

**Estado al inicio:** buscadores y split panes listos. Sin ninguna analítica.

### Decisión de diseño: dos fuentes de datos

Antes de codear, una revisión del historial reveló que el `~/.zsh_history` del usuario tiene 3556 líneas pero CERO timestamps (`EXTENDED_HISTORY` apagado), y el historial nunca guarda exit codes. Eso descartó "hora pico" y "% errores" desde el historial plano. La decisión (con el usuario) fue el combo:
- **Historial del shell** → top comandos/programas all-time (inmediato, con sus 3556 comandos).
- **Log propio vía OSC 133** → hora, exit code, duración por comando, persistido en SQLite. Da las stats temporales que el historial no tiene; empieza vacío y crece con el uso.

Honestidad sobre el cold-start: las secciones temporales arrancan vacías con un mensaje claro, no con ceros confusos.

### Dos bugs de parsing del historial (lección importante)

1. **`read_to_string` falla con bytes no-UTF8.** El primer intento mostró 0 comandos. Causa: los `.zsh_history` contienen bytes no-UTF8 (zsh "metafica" ciertos caracteres con prefijo 0x83, además de acentos en comandos). `read_to_string` aborta entera la lectura con un solo byte inválido. Fix: `std::fs::read` (bytes) + `String::from_utf8_lossy` (reemplaza inválidos, preserva el resto; los nombres de programa son ASCII puro).

2. **Comandos multilínea partidos.** Tras el fix anterior, el top comando era `\` (316 veces), con `import json\`, `def main():\`, `EOF`. Causa: zsh/bash guardan código pegado (heredocs, scripts) con continuación `\` al final de línea; mi parser trataba cada línea física como un comando. Fix: acumular en buffer hasta una línea que no termine en `\`. El total bajó de 3553 a 1111 (correcto — las continuaciones se colapsaron) y el top pasó a comandos reales (git, cd, npm).

### Captura del comando para el log

El reto: emparejar el texto del comando con su exit code, que llegan en momentos distintos. Solución: `pendingCommand: Map<shellId, texto>` en terminal.js, seteado al presionar Enter (en `updateCurrentInput`) y consumido en el handler OSC 133 D, donde ya tenemos exitCode y duración. El log es shell-agnóstico — funciona con los 4 shells sin importar cuál corra en Ocote.

### Infra: SQLite en app_data_dir

`StatsState` (Mutex<Connection>) se inicializa en el `.setup()` hook de Tauri, que resuelve `app_data_dir` (~/Library/Application Support/mx.ocote.terminal/stats.db en macOS). Esto obligó a hacer `use tauri::Manager` incondicional (antes estaba gateado solo a non-macOS para get_window). Setup defensivo: fallback a temp_dir, y si la DB falla no tumba la app (el frontend maneja el error).

### Soporte multi-shell del historial

zsh (default), bash (~/.bash_history, salta líneas #timestamp), fish (YAML-ish), PowerShell (PSReadLine, ruta distinta en Windows). El historial-archivo usa $SHELL (login shell) para elegir; el log propio captura el uso real de Ocote sin importar el shell.

### Sobre cmux / workspaces (consulta del usuario)

El usuario preguntó por integrar algo estilo cmux (workspaces). Recomendación: el modelo de cmux (orquestar agentes de IA en paralelo) se DESCARTA — contradice la identidad anti-IA de Ocote. El "workspace" estilo Warp (guardar layout de tabs/paneles + cwds por proyecto) SÍ encaja y queda como item de roadmap futuro, ahora que existen tabs + split panes.

### Pendientes
- Editor de aliases visual (siguiente).
- Workspace-save estilo Warp (futuro).
- Ícono real, landing, firma de código, auto-updater.

---

## 2026-06-04 — Sesión 17: buscadores (Ctrl+P / Ctrl+F) + split panes

**Estado al inicio:** explorador completo, notificaciones funcionando. Sin búsqueda y sin paneles divididos.

### Buscador de archivos (Ctrl+P)

Comando Rust `search_files(base, query)` recursivo con límites de seguridad (6 niveles, 50 resultados) y una lista de directorios a saltar (node_modules, .git, target, dist, __pycache__, etc.) — sin esto, buscar en un proyecto Node tardaría segundos recorriendo miles de archivos. Orden por relevancia (exacto → empieza-con → contiene) para que el resultado obvio salga primero. El frontend (`searcher.js`) usa `window.ocoteCwd` como base, hace debounce de 220ms, y resalta el match en color accent.

### Buscador de texto en terminal (Ctrl+F)

Aquí la decisión fue usar el `SearchAddon` oficial de xterm.js en lugar de implementar búsqueda sobre el buffer a mano. Pesa poco, resalta directamente en el canvas con decorations, y es el mismo addon que usa VSCode Terminal. Se bundlea como `lib/addon-search.js` (igual que addon-fit) y se carga por instancia de terminal.

### Botones visuales para ambos (filosofía Ocote)

El usuario señaló — correctamente — que Ctrl+P y Ctrl+F son invisibles para principiantes. Agregamos botones de lupa visibles, con tooltip que muestra el atajo entre paréntesis. Así el principiante descubre por el ícono y el experto aprende el atajo. Luego movimos el botón de buscar-archivo de la barra global al explorador (donde pertenece conceptualmente), separándolo del botón ".." de subir.

### Split panes recursivos (la pieza grande)

**Decisión de diseño (con el usuario):** recursivo tipo iTerm/tmux, no "máximo 2 paneles". Internamente es un árbol binario, así que la recursión maneja todos los casos de forma uniforme.

**El reto arquitectónico:** la relación era 1 tab = 1 terminal, con `tabs` keyed por shellId. Split panes rompe eso (1 tab = N terminales). En vez de reescribir todos los consumidores (explorer, search, settings, notificaciones — todos asumen shellId como llave), mantuve un **registro plano `panes: Map<shellId>`** para los datos por-terminal, y aparte `tabs: Map<tabId>` con el árbol de layout. Así `getTab(shellId)` y `getAllTabs()` siguen funcionando idénticos y nada externo se rompió.

**Lecciones técnicas:**
- Al re-renderizar el árbol, los `pane.el` se MUEVEN con appendChild (no se clonan ni se hace innerHTML), porque eso preserva el canvas de xterm. Reconstruir con innerHTML los destruiría.
- `.terminal-pane` y `.pane-split` necesitan `flex: 1 1 0` por defecto en CSS: un pane recién creado, antes de renderTab, debe tener tamaño para que `createTerminalInstance` lo mida bien (un hijo flex sin grow colapsa a 0).
- Atajos: split usa SOLO Cmd, nunca Ctrl. Ctrl+D es EOF en el shell — hijackearlo rompería el cierre de sesión. En Linux/Windows los botones cubren todo.

**Bordes de panes (iteración con el usuario):** primero puse el borde solo en hover → invisible. Luego `--border` (blanco 0.06) → casi invisible sobre el charcoal. Finalmente `--border-strong` (0.12) para la caja de cada pane + `--accent` 1.5px para el enfocado. Cada pane es ahora una caja con límite visible, como en Terax, y todo theme-aware.

### Pendientes
- Estadísticas del historial (siguiente — el diferenciador más único de Ocote).
- Editor de aliases visual.
- Ícono real, landing, firma de código, auto-updater.

---

## 2026-06-04 — Sesión 16: sistema de notificaciones (tab dots + OS)

**Estado al inicio:** el explorador estaba completo. Sin notificaciones de ningún tipo.

### Dot de notificación en tabs

El tab bar ya tenía `display: flex; align-items: center` pero sin indicador de estado. Se añadió un `.tab-status` span de 6px en cada tab. El desafío fue la animación: se usó `cubic-bezier(0.34, 1.56, 0.64, 1)` para el pop (rebote leve), que hace que el dot "salte" al aparecer en lugar de simplemente aparecer.

El verde desaparece en 4 segundos (éxito visto = limpio). El rojo persiste porque el error requiere atención del usuario. `switchTab` llama `clearTabStatus` para limpiar al activar.

### Bug crítico: requestAnimationFrame en background

La primera versión ponía `onCommandFinished` dentro del `requestAnimationFrame` del handler de OSC 133 D. El rAF se pausa cuando la ventana no está en primer plano en WKWebView (comportamiento estándar de los navegadores para ahorrar CPU). Resultado: el callback nunca corría mientras el usuario estaba en otra app — exactamente cuando más necesitábamos la notificación.

Fix: `onCommandFinished` se llama síncronamente justo después de calcular `exitCode` y `durationSecs`. `extendCommandBlock` sigue en rAF porque modifica overlays de xterm.js y necesita estar fuera del ciclo de parse.

### `window.confirm()` no funciona en WKWebView — patrón general

Este bug se descubrió primero con el borrado de archivos (sesión 15). Ahora lo confirmamos con las notificaciones: `document.hasFocus()` en WKWebView también puede no reflejar el foco real del OS. Regla: nunca asumir que las APIs web estándar de "visibilidad" funcionan correctamente en WKWebView/Tauri. Siempre usar eventos nativos de Tauri o polling como backup.

### Detección de foco — problema de AeroSpace

AeroSpace mantiene múltiples ventanas "activas" simultáneamente en el mismo espacio. Cuando el usuario cambia de Ocote a Terax (ambos en el mismo espacio AeroSpace), el evento `window.blur` del DOM **no dispara**. `document.hasFocus()` también retorna `true` en ese momento.

Solución: polling `setInterval 300ms` que lee `document.hasFocus()` continuamente. Cuando el comando termina 8 segundos después de que el usuario cambió a Terax, el polling ya habrá actualizado `windowFocused = false`, y la notificación dispara.

Esto es un anti-patrón (polling en lugar de eventos), pero es la única solución fiable para el comportamiento no estándar de AeroSpace con WKWebView.

### osascript vs API de Tauri

La API de Tauri (`notification-all`) requiere que la app esté registrada como `.app` en macOS. En dev mode (binario suelto en `target/debug/`) el sistema no la conoce, no muestra el diálogo de permisos, y Ocote nunca aparece en Sistema → Notificaciones.

`osascript display notification` no necesita registro — funciona desde cualquier proceso. El ícono muestra "Script Editor" en dev, pero el contenido (título/body) es correcto. En producción (`.app` firmado), se usa la API de Tauri que muestra el ícono real de Ocote y pide permiso la primera vez.

### Lógica de notificación — bug de diseño

La primera versión tenía `if (shellId === activeShellId) return` al inicio. Esto bloqueaba la notificación cuando el usuario corría un comando en el tab activo y luego se iba a otra app (el caso más común en la práctica). El usuario no va a cambiar de tab manualmente antes de ir a Chrome — eso es artificioso.

Fix: la condición correcta es `if (isActiveTab && !appIsBackground) return` — solo omitir si el usuario ESTÁ en Ocote Y mirando ESE tab. Si está en otra app, siempre notificar.

### Pendientes
- Buscador de archivos (Ctrl+P) — fuzzy search en el directorio actual.
- Ícono real de Ocote.
- Landing page, firma de código, auto-updater.

---

## 2026-06-03 — Sesión 15: explorador completo — operaciones, preview, resize, temas de íconos

**Estado al inicio:** el explorador tenía navegación y git badges. Sin operaciones de archivo, sin preview, sin resize entre paneles, 2 temas de íconos (Outline y Badge).

### Menú contextual rediseñado

El menú anterior usaba emojis (📋 ✏️ 🗑) que renderizan inconsistente entre plataformas y no encajan con el estilo de Ocote. Se reemplazaron por SVGs de Tabler Icons inline (mismo set que el explorador). El hover usa `var(--accent-dim)` + borde izquierdo naranja (mismo patrón que los ítems del explorador). Se añadió una etiqueta de grupo "CREAR" antes de los ítems de creación para mejorar la jerarquía visual. Animación `scale(0.96) translateY(-4px)` → `scale(1) translateY(0)` al aparecer.

### Bug crítico: `window.confirm()` en WKWebView

Al implementar la confirmación de borrado, el archivo se eliminaba sin mostrar diálogo. **Causa:** `window.confirm()` en Tauri/WKWebView no implementa el delegate de UI nativo; retorna `true` inmediatamente. Solución: `ocoteConfirm(message)` — modal HTML propio con `Promise<boolean>`. Usa las variables CSS de Ocote (fondo charcoal, borde amber, backdrop blur), foco inicial en Cancelar, Esc/Enter como atajos. La función es genérica y reutilizable para cualquier confirmación futura.

### Borrado recursivo de carpetas (decisión con el usuario)

Opciones discutidas: (a) solo vacías + mensaje amigable, (b) recursivo + confirmación clara, (c) mover a Papelera del OS. **Decisión: opción (b).** Razonamiento: es lo que espera un usuario moderno (Finder, VSCode), la opción (c) requería el crate `trash` (nueva dependencia), y la (a) era frustrante para el caso común.

Implementación Rust:
- `count_dir_entries(path)` → `usize` (primer nivel, incluye ocultos). Para el mensaje de confirmación.
- `delete_item_recursive(path)` → `remove_dir_all` para carpetas, `remove_file` para archivos. Marcado explícitamente como PERMANENTE en los comentarios.

El frontend muestra mensajes diferenciados: *"¿Eliminar la carpeta 'X'?"* (vacía) vs *"La carpeta 'X' contiene N elementos. ⚠️ Todo se eliminará permanentemente."* (con contenido).

### Preview de archivos (`preview.js`)

Se eligió highlight.js bundleado (sin CDN) sobre alternativas como Prism.js o CodeMirror. Highlight.js tiene autodetección de lenguaje (`highlightAuto`), pesa ~400KB con 40+ lenguajes, y no necesita configuración por extensión. Las imágenes se sirven via `read_file_base64` → data URL porque el explorador accede a rutas arbitrarias del filesystem que el webview no puede cargar directamente como `file://`. El panel se abre con doble-click o desde el menú contextual, y es redimensionable como los demás.

### Redimensionamiento de paneles (`resizer.js`)

El insight clave: `transition: none` durante el drag es obligatorio. Sin desactivarla, cada pixel de movimiento del ratón anima la transición, creando un efecto de lag/resaca. Se desactiva en `mousedown` y se restaura en `mouseup`. `MutationObserver` sobre las clases del panel maneja automáticamente la visibilidad del handle cuando el explorador se colapsa o el preview se oculta — sin necesidad de modificar `explorer.js` ni `preview.js`.

### 5 temas de íconos

La motivación fue que Outline y Badge tenían estilos muy diferentes y no había opciones intermedias. Brand (colores oficiales sólidos) y Ember (outline reactivo al tema) dan esa gama intermedia. Symbols es para usuarios que prefieren minimalismo extremo.

**Corrección al handoff:** el documento especificaba variables CSS como `--color-teal`, `--color-accent`, etc. que no existen en Ocote. Las variables reales son `--syntax-teal`, `--syntax-blue`, `--syntax-green`, `--syntax-red`, `--syntax-yellow`, `--accent`, `--text-secondary`. El EMBER_COLOR_MAP se adaptó a los nombres reales antes de implementar.

### Preview de íconos en Settings

Motivación: el ciclo "cambia tema en Settings → cierra Settings → mira el explorador → vuelve a Settings" era tedioso. La solución es una cuadrícula de 12 ítems representativos (8 archivos + 4 carpetas) que actualiza en tiempo real. Se necesitó una API unificada (`getIconHtmlForTheme` / `getFolderHtmlForTheme`) que manejara los 5 temas desde un solo punto, ya que settings.js no tiene acceso a la lógica de badge de explorer.js.

### Decisiones tomadas

- **`ocoteConfirm` en lugar de native confirm** — WKWebView no soporta `confirm()` de forma fiable.
- **Borrado recursivo** con confirmación clara — no mover a Papelera (depende de crate externo).
- **highlight.js bundleado** — sin CDN, consistente con el principio offline-first.
- **`remove_dir_all`** para borrado recursivo — la confirmación es responsabilidad del frontend, no del backend.

### Pendientes

- Ícono real de Ocote (el About sigue mostrando ícono de macOS por caché).
- Landing page / sitio web.
- Firma de código macOS (Apple Developer ID).
- Auto-updater.

---

## 2026-06-01 — Sesión 14: temas oficiales de Ocote + README de lanzamiento

**Estado al inicio:** Ocote tenía 10 temas (Ocote Dark/Light + 8 ajenos como Dracula/Nord). Se creó un repo aparte de marca, [ocote-themes](https://github.com/Teshre/ocote-themes), con 8 paletas originales "alma de lumbre". Objetivo de la sesión: adoptar los temas oficiales, preparar el README de lanzamiento.

### README bilingüe de pre-lanzamiento

- `README.md` (inglés, principal — convención GitHub, público dev mayoritariamente angloparlante) + `README.es.md` (español, identidad LatAm), con links cruzados de idioma.
- Estructura estilo Warp/Ghostty/Alacritty: hero con ícono real (no emoji), badges, qué es, características por sección, tabla de 4 shells, instalación, stack, roadmap, star history (star-history.com), contribuir, licencia.
- Datos verificados contra el proyecto (153 comandos × 5 idiomas, ~33MB, etc.).
- Placeholder de GIF/MP4 de demo con guía para grabarlo (`docs/assets/README.md`).

### Temas oficiales (decisión de marca)

**Decisión (con el usuario):** quedarse SOLO con los 8 temas de Ocote, eliminar los ajenos. Razón: los temas originales son un activo de marca; tener Dracula/Nord diluye la identidad y pone a Ocote como "otro terminal con los temas de siempre". Default = `ocote`.

**Implementación — generación programática:** `themes.js` se reescribió para generar los 8 temas desde `OCOTE_THEME_DATA` (espejo de `ocote-themes/ocote-themes.js`: paleta base16 por tema). `buildTheme()` deriva automáticamente `xterm` (16 colores ANSI), `css` (variables UI, con sidebar/input calculados del bg vía `shade()`) y `tokens` (prompts). Antes cada tema era ~40 líneas de hex a mano; ahora se agregan/quitan editando solo `OCOTE_THEME_DATA`. La regla `tokens.accent === --accent` se cumple sola (ambos = `cursor`).

**Migración:** usuarios con `dark`/`light`/temas ajenos en localStorage se mapean (`dark`→`ocote`, `light`→`papel`, resto→`ocote`) en `settings.js migrateThemeId`, para que nadie quede con un tema inexistente al actualizar.

### Selector de temas con mini-preview

El círculo simple anterior no encajaba con el resto de la UI (que ya tiene preview en el picker de prompts). Se portó el renderer de `ocote-themes/gallery.js`: cada tema es una card con un **mini-terminal coloreado con su paleta ANSI real** (prompt + `ls` + `cat theme.rs` + cursor), nombre, etiqueta Oscuro/Claro, descripción y swatches de paleta. Layout 2×4, coherente con el picker de prompts.

### Sincronización del repo ocote-themes

La carpeta local `../ocote-themes` no tenía git y el remoto estaba más actualizado. Se clonó el remoto (respaldando lo local); al comparar, las paletas ANSI ya eran idénticas a las de Ocote — solo difería la indentación. Ahora la carpeta tiene git para futuros updates.

### Decisiones tomadas

- **Solo temas oficiales** (no import de ajenos por ahora): identidad de marca pura. Quien quiera otro tema usa el repo base16 en su terminal externa.
- **Import de temas custom** (base16/JSON, guardados como `custom`): documentado como **feature futura del roadmap**, no implementado esta sesión.
- **README en inglés principal:** maximiza alcance; el español preserva la identidad sin sacrificar público.

### Pendientes

- GIF/MP4 de demo para el README (lo graba el usuario; guía lista en `docs/assets/`).
- Import de temas custom (roadmap).

**Próximo paso:** verificar el README renderizado en GitHub, luego landing page o firma de código.

---

## 2026-05-31 — Sesión 13: PowerShell (4º shell) + zoxide + bat

**Estado al inicio:** 3 shells (zsh/bash/fish). Objetivo: PowerShell + más tools out-of-the-box.

### Decisión de tools (con el usuario)

Se eligieron zoxide + eza + bat. Al descargar binarios: **eza NO publica binarios de macOS** (solo Linux/Windows; macOS usa brew). Eso rompe el bundling cross-platform → eza se descartó (es además el más cuestionable pedagógicamente porque reemplaza `ls`). Quedaron zoxide (`z`) y bat, ambos con binarios limpios para las 5 plataformas. bat se deja como comando `bat` SIN aliasear `cat` (preserva la enseñanza del CKB).

### PowerShell (`prompt.ps1`)

- `function prompt` con los 5 presets + OSC 6731/133. PSReadLine 7 aporta autosuggestions (`PredictionSource History`) + syntax highlighting NATIVOS — como fish.
- fzf: NO tiene `fzf --powershell`, así que se escribieron handlers manuales de PSReadLine (`Set-PSReadLineKeyHandler` Ctrl+R / Alt+C).
- `pty.rs`: Windows ahora prefiere `pwsh.exe` (antes hardcodeaba `cmd.exe` sin prompt de Ocote); inyección vía `-NoExit -Command`. PowerShell aplica también en unix si `SHELL=pwsh`.
- Instalado PowerShell 7.6.2 (brew) para validar en vivo.

### Bug: explorador se revertía solo con PowerShell

**Causa:** `Set-Location` de PowerShell NO cambia el cwd del proceso a nivel OS (PS mantiene su ubicación interna). El polling `get_shell_cwd` leía el cwd del proceso (sin cambiar) y revertía el sync correcto del OSC 6731. En zsh/bash/fish el `cd` sí cambia el cwd del proceso, por eso no pasaba.

**Fix:** `explorer.js` marca como `_oscManagedShells` a los shells que emiten OSC 6731 y el polling los ignora (el OSC es la fuente de verdad). El polling queda solo de fallback para passthrough. Esto también hace más robustos a las otras shells. **Lección:** no todos los shells cambian el cwd del proceso al navegar; el OSC del shell es más confiable que leer el cwd del proceso.

Este mismo bug hacía PARECER que zoxide no funcionaba: `z <dir>` cambiaba la ubicación de PS y emitía OSC, pero el explorador revertía. Al arreglar el sync, `z` y `cd` funcionan y el explorador los sigue. (zoxide validado: registra dirs y salta correctamente.)

### Idea registrada

`z`, `bat`, `fzf` (Ctrl+R) son comandos potentes que un principiante no conoce → candidatos perfectos para el CKB / tooltips educativos de Ocote.

### Optimización de bundling por plataforma

Hoy el bundle metía los 15 binarios (fzf+zoxide+bat × 5 plataformas, 59MB) en TODOS los builds → un .app de macOS cargaba ~36MB de peso muerto (linux+windows).

**Solución (Tauri v1 platform configs):** se quitó `resources/bin/**/*` del `tauri.conf.json` base y se crearon `tauri.macos.conf.json`, `tauri.linux.conf.json`, `tauri.windows.conf.json`. Tauri auto-mergea el config de la plataforma con el base al construir en cada OS. Cada uno lista solo los binarios de su plataforma (macOS incluye darwin arm64+x64 para builds universales).

**Gotcha clave:** el merge de Tauri v1 REEMPLAZA arrays (no concatena). Por eso cada config de plataforma repite la lista COMPLETA de `resources` (hooks, plugins, íconos) + sus binarios — si solo listara los binarios, perdería los demás recursos.

**Verificado con build real de macOS:** el .app lleva solo darwin-arm64 + darwin-x64 (23MB de binarios), cero linux/windows. Evaluado: se descartó `beforeBuildCommand` (más imperativo, más superficie de error) por ser los platform configs el mecanismo idiomático y declarativo.

**Próximo paso:** landing page, firma de código macOS, o enseñar z/bat/fzf en el CKB.

---

## 2026-05-31 — Sesión 12: soporte fish + refactor de binarios fzf

**Estado al inicio:** Sesión 11 dejó zsh completo y bash con prompt+overlays+fzf. El objetivo: añadir fish, el 3er shell (popular entre devs jóvenes, target de Ocote).

### Por qué fish es el caso más fácil

fish trae **syntax highlighting y autosuggestions NATIVOS** (built-in, sin plugins). Así que para fish solo había que: definir `fish_prompt` con los presets + emitir los OSC. Nada de bundlear plugins como en zsh.

### `prompt.fish`

- `fish_prompt` con los 5 presets (pill/block/minimal/ribbon/rail) + OSC 6731 (metadata) + OSC 133 D (al inicio, fin de comando) + OSC 133 A (al final, cursor en ❯).
- Ventaja de fish: calcula el ancho del prompt interpretando los escapes él mismo → NO necesita los marcadores `%{ %}` (zsh) ni `\[ \]` (bash). Sin el gotcha de cursor desfasado.
- `pty.rs`: fish no tiene `--rcfile`; se usa `fish -C "source <hook>"` que corre DESPUÉS de `config.fish` del usuario → nuestro `fish_prompt` sobrescribe el suyo.

### El hallazgo clave: `command -q fzf` en fish

La integración `fzf --fish` define `fzf_key_bindings` con un guard: `if not command -q fzf; return`. **`command -q` de fish solo busca ejecutables en PATH, NO funciones.** Como nuestro binario se llamaba `fzf-darwin-arm64` y usábamos una función wrapper `fzf()`, el guard fallaba y las bindings nunca se instalaban.

**Solución universal (refactor):** renombrar los binarios a `fzf` dentro de subdirs por plataforma:
```
resources/bin/darwin-arm64/fzf   (antes: fzf-darwin-arm64)
resources/bin/darwin-x64/fzf
resources/bin/linux-x64/fzf
resources/bin/linux-arm64/fzf
resources/bin/win-x64/fzf.exe
```
`pty.rs` añade el dir al PATH → `fzf` es un comando real en las 3 shells. Se eliminaron las funciones wrapper de zsh/bash/fish. Más limpio y consistente.

**Lección:** cuando varias shells necesitan un binario "como si estuviera instalado", la forma robusta es ponerlo en PATH con su nombre real, no funciones wrapper (que no todas las shells resuelven igual — fish `command -q` las ignora).

### Validación

Se instaló fish 4.7.1 (brew) para validar de verdad:
- `fish --no-execute prompt.fish` → sintaxis OK.
- Smoke test: `fish_prompt` emite OSC 133 D + 6731 + info line + ❯ + OSC 133 A. ✅
- fzf: `command -q fzf` = true, Ctrl+R → fzf-history-widget, Alt+C → fzf-cd-widget, Ctrl+T libre. ✅
- Re-validación zsh (shell del usuario) tras quitar el wrapper: fzf en PATH, Ctrl+R/Alt+C OK, Ctrl+T libre, sin regresión. ✅

### Decisiones

- **Instalar fish para validar** (en vez de commitear a ciegas): tras una sesión 11 llena de bugs de shell, validar contra un fish real evitó otra ronda de ida y vuelta. Encontró el bug de `command -q` que el balance-check de bloques no habría detectado.
- **No bundlear plugins para fish**: sus built-ins (highlighting + autosuggestions) ya cubren lo que en zsh requiere 2 plugins.

### Pendientes

- **PowerShell** (4º shell) — paradigma muy distinto, esfuerzo alto. Solo si hay demanda en Windows.
- Verificar ícono del dock + todo lo bundleado en build de producción (`pnpm tauri build`).

**Próximo paso:** verificar build de producción, o PowerShell si se prioriza Windows.

### Build de producción + fixes de ícono (cierre de sesión 12)

Se corrió `pnpm tauri build` para verificar el empaquetado real:
- `.app` 34MB, `.dmg` 15MB (comprimido). Exit 0.
- Confirmado que todos los recursos (fzf, zsh-autosuggestions, syntax-highlighting, los 5 hooks de shell, íconos) quedan dentro del `.app` y `resolve_resource` los encuentra desde el bundle (no desde `target/debug`).
- Prompt, fzf (Ctrl+R/Alt+C), autosuggestions y syntax highlighting funcionan en el `.app` empaquetado.

**Bug: el ícono del dock no cambiaba (ni en producción).**
Causa raíz: `window.set_icon()` de Tauri v1 es **no-op en el dock de macOS** — macOS no tiene íconos por-ventana, el dock se controla con `NSApplication`. "Compilaba y corría sin error" pero no hacía nada. Fix: rama nativa vía objc:
```rust
[[NSApplication sharedApplication] setApplicationIconImage: img]
```
Crates `cocoa`/`objc` (ya en el árbol vía tauri, declaradas target-specific en Cargo.toml). Win/Linux mantienen `set_icon`. **Lección:** en macOS muchas operaciones de "app chrome" (dock, menú) requieren objc directo; las APIs cross-platform de Tauri a veces son no-ops silenciosos en macOS.

**Bug: ícono se veía más grande que apps nativas en el Dock.**
Claude Design lo aclaró (README-ICONOS-OS.md): el master era borde-a-borde, pero macOS espera el arte a 824×824 centrado en 1024 (margen 100px). Fix: regenerar desde los masters con margen (`Ocote design/export/icons/macos/`):
- Bundle: `pnpm tauri icon <master-dark>` (dark = default de la app, sin flash al arrancar).
- Runtime swap (`resources/icons/`) + preview (`frontend/icons/`): copiados/escalados desde los masters con margen.
- Light/dark se mantienen gemelos — la diferencia de tamaño percibida es irradiación óptica (símbolo claro sobre fondo oscuro se "expande"), decisión de diseño de no corregir.

**Pendiente menor anotado:** el `.app` de cada plataforma bundlea los 5 binarios de fzf (~19MB de peso muerto en macOS). Optimización futura: bundling condicional por plataforma.

---

## 2026-05-30 — Sesión 11: fzf + zsh-autosuggestions out-of-the-box, nuevos ajustes y fixes de shell

**Estado al inicio:** Sesión 10 cerró con el body overlay de Block/Rail y el Settings rediseñado. Ocote ya traía zsh-syntax-highlighting bundleado. El objetivo de esta sesión: hacer Ocote "ready out of the box" integrando los plugins que los devs siempre instalan después (fzf, autosuggestions), añadir ajustes de terminal, y el selector de ícono light/dark.

### Nuevos ajustes en Settings

- **Ícono de la app (light/dark)**: comando Rust `set_app_icon(variant)` que lee el PNG bundleado y llama `window.set_icon(Icon::Raw(bytes))`. Requirió añadir el feature `icon-png` a Cargo.toml (sin él, `Icon::Raw`/`Icon::File` no existen). Generé `.icns` completos (16–1024px) con `sips`+`iconutil`. **Limitación dev:** el cambio del dock en runtime no se ve en `pnpm tauri dev` porque el binario de desarrollo no tiene `.app` bundle completo — funciona en producción.
- **Terminal**: tamaño de fuente (stepper 10–20px), cursor (bloque/línea/barra), scrollback (1K/5K/10K). Todo en `localStorage`, leído por `createTerminalInstance` para que tabs nuevos nazcan con la preferencia.
- **Reorganización**: General = idioma + terminal + ícono + tipografía. Apariencia = prompt + tema + íconos del explorador. (El usuario pidió no saturar Apariencia.)

### fzf v0.73.1 — bundleado multiplataforma

- Binarios para macOS arm64/x64, Linux x64/arm64, Windows x64 en `resources/bin/`.
- `pty.rs`: `fzf_binary_name()` selecciona por `(OS, ARCH)`; inyecta `OCOTE_FZF_BIN`.
- Keybindings: `Ctrl+R` (historial fuzzy), `Option+C` (cd fuzzy). `Ctrl+T` deshabilitado (conflicto con nueva pestaña).
- **Wrapper `fzf()`**: el binario se llama `fzf-darwin-arm64`, pero la integración de fzf llama `fzf` por nombre. Una función shell `fzf() { command "$OCOTE_FZF_BIN" "$@"; }` resuelve esto sin symlinks (que serían read-only en el `.app`).

### zsh-autosuggestions v0.7.0 — bundleado

- Texto fantasma gris desde historial. Flecha `→` acepta la sugerencia completa (estilo fish) vía widget custom `_ocote_accept_or_forward`.

### Bugs resueltos (mucho debugging de shell)

**1. Prompt width / cursor desfasado (causa raíz de varios bugs):**
El OSC 133 A en `PROMPT` estaba sin envolver en `%{ %}`. zsh contaba esos 9 bytes invisibles como columnas → el cursor quedaba 9 columnas desfasado. Síntomas: texto fantasma pegado, duplicados al pegar, artefactos al navegar historial. **Lección clave:** todo escape no-imprimible en un PROMPT de zsh DEBE ir en `%{ %}` (en bash, `\[ \]`). Es un gotcha clásico.

**2. Color gris al aceptar sugerencia con →:**
Orden de carga incorrecto. zsh-autosuggestions y zsh-syntax-highlighting ambos envuelven widgets ZLE; el que carga ÚLTIMO es el wrapper externo. **Orden canónico: syntax-highlighting ANTES, autosuggestions AL FINAL.** Se movió autosuggestions de `prompt.zsh` a `.zshrc` (después de HL). Además el widget de aceptación necesitó `region_highlight=()` + `zle redisplay` para que syntax-highlighting recoloree el texto aceptado (autosuggest-accept dejaba el highlight gris pegado en las posiciones del buffer).

**3. Explorador "ruta no existe":**
El fast-path adivinaba la ruta del `cd` desde `currentCommandLine`, que solo captura teclas crudas — con tab-completion o historial el texto real difería → cargaba rutas parciales inexistentes. **Fix:** sincronizar desde el cwd REAL que el shell reporta vía OSC 6731 (`window.onShellCwdChanged`, expande `~`). Funciona con cd directo, tab, historial, pushd/popd, symlinks. Se eliminó el fast-path de adivinanza.

**4. macOS Option/Alt:** `macOptionIsMeta: true` en xterm.js para que Alt envíe ESC (sin esto Alt+C generaba © en vez de la secuencia que fzf espera).

### Decisiones tomadas

- **Bundlear binarios fzf (23MB total)**: aceptable para un producto "offline, todo incluido". El usuario no instala nada.
- **No usar symlinks para fzf**: el `.app` bundle es read-only; la función wrapper es más robusta cross-platform.
- **Sincronizar `resources/shell/*` a `target/debug/`**: en dev, `resolve_resource` devuelve la copia de `target/debug/resources` (no la fuente). Editar la fuente requiere copiar a target o rebuild. Se copió manualmente para iterar rápido sin recompilar.
- **Limpiar zsh-autosuggestions**: se quitaron spec/Docker/Gemfile/.github del bundle; solo queda el `.zsh` + LICENSE + README.

### Pendientes / a futuro

- **Bash hook completo** con OSC 6731/133 al nivel de zsh (próximo paso de cross-shell).
- **fish y PowerShell** (soporte de los 4 shells principales).
- **Ícono del dock en producción**: verificar que `set_app_icon` cambia el dock en el build firmado.
- **zoxide / eza** (plugins de media prioridad) si hay demanda.

**Próximo paso:** bash hook con paridad de OSC, luego fish.

---

## 2026-05-29 — Sesión 10: Body overlay para Block/Rail, correcciones de prompts y rediseño de Settings

**Estado al inicio:** El sistema de overlay HTML estaba funcionando (header de prompt con path/branch/time en todos los presets), pero Block y Rail solo pintaban la fila del header sin cubrir el output del comando. Además había tres bugs activos: colores incorrectos en temas como Nord y Tokyo Night, el watermark siendo cubierto por los divs overlay, y los prompts fantasma que persistían después de `clear`.

### Body overlay para Block y Rail

**El problema:** El preset Block en Settings mostraba una tarjeta Warp-style con header + cuerpo + footer. En la terminal real, solo existía el header. Rail igual: solo la fila de info, no el stripe a lo largo del output.

**Solución arquitectónica:**

La investigación (deep research compartida en sesión anterior) estableció la regla crítica de timing para OSC 133 D:
- Si se lee `buf.cursorY` en un `requestAnimationFrame` después de que llega 133 D, el write() ya terminó y el cursor está en la fila del **nuevo** `❯` — demasiado tarde.
- Si se lee **síncronamente dentro del OSC handler**, el parser está en el punto exacto justo después del output del comando, antes de que el siguiente prompt se procese.

```
terminal.js — OSC 133 D handler:
  SÍNCRONO: endAbsRow = buf.baseY + buf.cursorY  ← correcto
  rAF: llama extendCommandBlock(infoAbsRow, chevronAbsRow, endAbsRow, exitCode)
```

`prompt.js` — nuevo `extendCommandBlock()`:
- Crea `div.ocote-ol-body` posicionado desde `chevronAbsRow` (fila `❯`) hasta `endAbsRow`
- Block body: `border-left: 2px solid rgba(accent, 0.30)` + fondo `rgba(accent, 0.04)`. Cambia a rojo si `exitCode !== 0`.
- Rail body: solo el stripe 3px con gradiente vertical, sin fondo.
- `updateOverlayPositions()` y `clearOverlays()` actualizados para manejar `_bodyMaps`.

### Tres bugs corregidos

| Bug | Causa raíz | Fix |
|-----|-----------|-----|
| Nord y Tokyo Night mostraban naranja de Ocote | `TOKENS.accent` desalineado con `--accent` CSS (Nord: `#D08770` vs CSS `#88c0d0`) | Sincronizar todos los TOKENS con su CSS `--accent` |
| Watermark cubierta por filas de prompt | `#terminal-watermark z-index:4` < overlay `z-index:8` | Subir watermark a `z-index:10` |
| Prompts fantasma tras `clear` | `\x1b[2J` limpia el canvas pero no los divs overlay del DOM | Detectar `\x1b[2J` en listener PTY y llamar `clearOverlays()` |

**Lección aprendida — TOKENS vs CSS accent:** Los tokens semánticos del sistema de prompt deben estar siempre alineados con `--accent` del CSS. Si divergen, el overlay usa un color y la UI usa otro, rompiendo la coherencia visual del tema. Se añadió comentario en `themes.js` como recordatorio.

### Settings rediseñado

**Problema:** Modal de 620px era demasiado angosto — la tab Apariencia requería scroll para ver temas, tipografía e íconos.

**Decisiones de diseño:**
- Modal ampliado a **1100px** (96vw máximo). A 1100px cada card de preset tiene ~230px, suficiente para "~/dev · ⎇ main +2 · 14:32".
- **Layout lado a lado**: grid de presets (izquierda, `flex:1`) + pane de preview (derecha, 320px fija). El usuario selecciona/hovea en las cards y ve el resultado en tiempo real a la derecha.
- **Grid de 3 columnas** (antes 2): 6 presets en 2 filas vs 3 filas anteriores.
- **10 temas en fila única** (`repeat(10, 1fr)`): todos los temas visibles sin scroll.
- **Tipografía + Iconos en fila horizontal**: dos columnas `.settings-two-col` en vez de dos secciones verticales separadas.

**Block preview simplificado:** Se eliminó el footer `✓ exit 0 · 0.84s · copy · rerun · share` del preview en settings. Ese footer era aspiracional (mostraba features no implementadas: timing de comando, botones copy/rerun/share). El Block real solo tiene header + body overlay (borde izquierdo + fondo tenue). Mostrarlo honestamente evita crear expectativas falsas. Los botones de acción en bloques añaden complejidad alta (overlay con `pointer-events`, timing tracking) para bajo beneficio en la audiencia objetivo.

**Rail big preview:** El renderer genérico `renders.rail()` usa `height:100%` — correcto para el overlay real (el stripe debe abarcar todo el output), pero en el pane de preview de settings se estiraba a toda la altura del contenedor. Solución: `railBigPreview()` personalizado en `settings.js` con stripe de `height:20px` fija.

**Decisiones tomadas:**
- **`~/dev` como path de demo**: más corto que `~/proyecto/src`. Las cards de Pill tienen capsulas con padding, por lo que el texto total (path + branch + time) fácilmente supera el ancho disponible.
- **No implementar footer de Block ahora**: bajo valor para audiencia principiante (el exit ya se ve por el color del chevron; el timing añade complejidad de shell; copy/rerun/share requieren pointer-events en overlays que son todos `pointer-events:none`). Se puede revisar en Fase 4 tardía si hay demanda.

**Próximo paso:** Ícono real de Ocote, landing page, firma de código macOS para distribución sin Gatekeeper.

---

## 2026-05-25 — Sesión 9: Fase 4 avanzada — Temas, configuración, tabs, breadcrumb, i18n

**Estado al inicio:** Sesión 8 cerrada con CKB multilenguaje (153 comandos × 5 idiomas), tooltip traducido e íconos SVG de Tabler Icons. La UI tenía el selector de idioma e íconos hardcodeados en el breadcrumb, un solo tema (oscuro fijo) y una sola terminal a la vez.

**Qué se hizo:**

### Panel de configuración (`settings.js`)

- Modal centrado activado por el botón ⚙ en el breadcrumb.
- Dos tabs:
  - **General**: selector de idioma ES/EN/PT/FR/DE.
  - **Apariencia**: selector de tipografía (dropdown con 7 opciones), selector de tema de íconos (seti/badge), grid de swatches de temas de color.
- Cierra con Esc, click en backdrop o botón ✕.
- Toda preferencia se guarda en `localStorage` y se aplica al instante sin recargar.
- Los selectores de idioma e íconos que estaban en el breadcrumb superior fueron eliminados — ahora viven en settings.

### 10 temas de color (`themes.js`)

- Cada tema tiene objeto `xterm` (paleta xterm.js) y `css` (CSS variables UI).
- `window.OCOTE_THEMES.applyTheme(id)` aplica ambos simultáneamente.
- Temas: Ocote Dark (default), Ocote Light, Dracula, One Dark, Monokai, Solarized Dark, Solarized Light, Gruvbox Dark, Nord, Tokyo Night — todos MIT license.
- Grid de swatches en settings muestra preview del fondo y acento de cada tema.

### Nerd Fonts bundleadas

- `frontend/lib/fonts/`: JetBrainsMono NF, FiraCode NF, MesloLGS NF cargadas como `@font-face`.
- Resuelve el problema donde íconos de p10k y oh-my-zsh aparecían como cuadros (`▯`) en algunos sistemas.
- `terminal.js` usa estas fuentes en el fallback stack de xterm.js.

### UI internacionalizada (`ui-i18n.js`)

- Traduce labels de settings, onboarding y breadcrumb a ES/EN/PT/FR/DE.
- `window.I18N.apply()` re-aplica sin recargar. Llamado al cambiar idioma en settings.
- El label de idioma mismo se muestra en el idioma activo ("Idioma" / "Language" / "Idioma" / "Langue" / "Sprache").

### Breadcrumb navegable en el explorador

- Footer inferior del explorador con la ruta actual como segmentos clicables.
- Click en cualquier segmento → navegación directa (sin subir de uno en uno).
- Dropdown al hacer click en segmento no-activo: lista subdirectorios del nivel para navegar lateralmente.
- Segmentos intermedios abreviados a inicial + `.` para rutas largas.

### Múltiples terminales con tabs (`tab-manager.js`)

- Cada tab = una instancia xterm.js + un proceso shell (PTY) independiente en el backend Rust.
- `Ctrl+T` → nuevo tab, `Ctrl+W` → cerrar tab, botón `+`, botón `×` por tab.
- El tab toma el nombre del basename del CWD al crearse.
- `window.TAB_MANAGER` expone: `createTab()`, `closeTab()`, `switchTab()`, `getAllTabs()`, `getTab()`, `getActiveShellId()`.
- `terminal.js` refactorizado como factory (`createTerminalInstance(shellId, container)`) sin gestionar ciclo de vida de tabs.
- `window.ocoteActiveShellId`: ID del tab activo, filtro para que input/output no se mezclen.

### Fix: tema xterm.js no se aplicaba al cambiar en settings

**Síntoma:** Al seleccionar Dracula, Nord, etc. en settings, el sidebar y bordes cambiaban de color pero el fondo de la terminal quedaba negro.

**Causa raíz (3 problemas encadenados):**
1. `window.ocoteTerminal` dejó de existir cuando se implementaron los tabs. `themes.js` y `settings.js` lo buscaban y no encontraban nada.
2. Aunque `window.ocoteTerminal` existiera, solo actualizaría un tab, no todos.
3. Nuevos tabs siempre usaban el tema dark hardcodeado en `terminal.js` sin leer el tema guardado.

**Fix aplicado:**
- `themes.js`: `applyTheme()` itera `window.TAB_MANAGER.getAllTabs()`.
- `terminal.js`: `createTerminalInstance()` lee `localStorage('ocote_theme')` y usa `window.OCOTE_THEMES.THEMES[id].xterm ?? OCOTE_THEME`.
- `settings.js`: `setXtermOption()` y `applyFont()` usan `TAB_MANAGER.getAllTabs()`.
- `index.html`: `themes.js` movido al inicio de los scripts — antes que `terminal.js` y `tab-manager.js`.

**Decisiones tomadas:**

- **`themes.js` antes que `terminal.js`**: el primer tab se crea durante la inicialización de `tab-manager.js`. Si `themes.js` carga después, `OCOTE_THEMES` no existe aún y el tab nace siempre oscuro (aunque `settings.js` lo corregiría 100ms después con `applyAll()`). Mover el orden de carga elimina ese flash.
- **Un modal de settings en vez de panel lateral**: menos código de layout, acceso rápido con ⚙, no ocupa espacio permanente en la UI.
- **Grid de swatches en vez de dropdown para los temas**: permite ver todos los temas y su preview de color de un vistazo; mejor UX para decisiones visuales.
- **Tabs con nombre basado en CWD**: más informativo que "zsh 1", "zsh 2". El nombre se actualiza con cada `cd` desde el explorador.
- **Nerd Fonts bundleadas en vez de requerir instalación del usuario**: elimina una fuente de confusión para principiantes que verían `▯` sin saber por qué.

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Fondo de terminal negro con cualquier tema | `window.ocoteTerminal` obsoleto; tabs usan `TAB_MANAGER` | `applyTheme()` itera `TAB_MANAGER.getAllTabs()` |
| Nuevo tab siempre oscuro aunque se haya cambiado tema | `OCOTE_THEME` hardcodeado en `createTerminalInstance` | Leer `localStorage('ocote_theme')` al crear cada tab |
| `applyFont()` no afectaba tabs existentes | Usaba `window.ocoteFitAddon` (obsoleto) | Itera todos los tabs y llama `tab.fitAddon.fit()` |
| Íconos de p10k aparecían como cuadros `▯` | Nerd Font no instalada en el sistema | Bundlear fuentes Nerd Font como `@font-face` |

**Estado al final:**

- 10 temas de color, todos persisten y se sincronizan en todos los tabs activos ✅
- Múltiples terminales independientes con tabs ✅
- Panel de configuración con idioma, tipografía, íconos y tema ✅
- UI traducida en 5 idiomas ✅
- Breadcrumb navegable en explorador ✅
- Nerd Fonts bundleadas ✅

**Próximo paso:** Ícono real de Ocote → landing page → firma macOS.

---

## 2026-05-24 — Sesión 8: Fase 4 inicio — CKB multilenguaje, tooltip traducido, íconos dinámicos

**Estado al inicio:** Fase 3 completada. CKB tenía 76 comandos solo en español. El tooltip mostraba etiquetas hardcodeadas en español sin importar el idioma activo. El explorador usaba emojis de texto plano como íconos.

**Qué se hizo:**

### CKB multilenguaje — 76 → 153 comandos × 5 idiomas

- Se expandió `ckb/commands.json` de 76 a **153 comandos**.
- Cada comando tiene ahora: `description_es`, `description_en`, `description_pt`, `description_fr`, `description_de`.
- Nuevas categorías representadas: `development`, `network`, `search`, `editor`, herramientas DevOps (`kubectl`, `terraform`, `helm`, `docker-compose`).
- En `ckb.rs`:
  - `CommandRaw` tiene los 5 campos de descripción con `#[serde(default)]` para pt/fr/de (compatibilidad hacia atrás).
  - `CommandResponse` expone un solo campo `description` — el backend resuelve el idioma, el frontend nunca sabe qué columna se consultó.
  - `lang_column(lang: &str) -> &'static str`: whitelist explícita para evitar SQL injection. Solo devuelve literales conocidos.
  - `get_suggestions(prefix, lang, state)` y `get_command_info(name, lang, state)` usan `format!("SELECT name, {col}, category...")` donde `col` viene de `lang_column()`.
- En `autocomplete.js`: `getLang()` lee `localStorage('ocote_lang')`. Pasa `lang` en cada `invoke('get_suggestions', ...)`. Usa `cmd.description` en vez de `cmd.description_es`.

### Selector de idioma en breadcrumb

- `index.html`: 5 botones `<button class="lang-btn" data-lang="…">` en `#lang-selector`.
- Script inline maneja clicks, actualiza clase `active`, guarda en `localStorage('ocote_lang')`.
- `autocomplete.js` y `tooltip.js` leen `localStorage` en cada llamada — cambio de idioma activo inmediatamente sin recargar.

### Tooltip traducido

- `tooltip.js` tenía "EJEMPLO", "Flags comunes" y "Esc o click fuera" hardcodeados en español.
- Fix: se agregó el objeto `UI_STRINGS` con los 5 idiomas:
  ```js
  const UI_STRINGS = {
    es: { commonFlags: 'Flags comunes', example: 'Ejemplo', closeHint: 'Esc o clic fuera para cerrar' },
    en: { commonFlags: 'Common flags', example: 'Example', closeHint: 'Esc or click outside to close' },
    // … pt, fr, de
  };
  ```
- `getUI()` devuelve el mapa activo con fallback a `'es'`.
- Nota: las descripciones de ejemplos en `commands.json` quedaron en español (demasiado verboso añadir 5 traducciones por cada ejemplo de cada comando).

### Bug crítico: lang selector se borraba al navegar en el explorador

- **Síntoma**: los botones ES/EN/PT/FR/DE desaparecían al hacer click en cualquier carpeta.
- **Causa**: `explorer.js` hacía `breadcrumb.textContent = path`, que reemplazaba el contenido interno de `#breadcrumb` (incluyendo los botones del lang selector).
- **Fix**: Cambiar la referencia a `document.getElementById('breadcrumb-path')` — un `<span>` específico dentro del breadcrumb. Ahora solo se actualiza el texto de la ruta.

### Sistema dual de íconos en el explorador

Se reemplazó el sistema de emojis por un sistema con dos temas:

**Tema `seti` (SVG):**
- `svgFile(fill, fold)`: genera SVG de rectángulo con esquina doblada (`path d="M2.5 1H9.5L13.5 5V15H2.5V1Z"`). El "fold" usa `shiftColor(hex, delta)` para aclarar/oscurecer el color base.
- `svgFolder(color)`: genera SVG de carpeta con solapa superior y cuerpo diferenciado en color.
- `FILE_COLORS`: ~80 extensiones → `[fill, fold]` (colores reales por tipo: verde para .py, naranja para .rs, amarillo para .js, etc.)
- `SPECIAL_FILE_COLORS`: ~40 archivos especiales (Cargo.toml, Dockerfile, .env, etc.)
- `FOLDER_COLORS`: ~40 nombres de carpeta → color (src→azul, test→verde, .git→rojo-naranja, etc.)

**Tema `badge` (texto):**
- `BADGE_LABELS` + `SPECIAL_BADGE_LABELS`: etiquetas cortas (`.PY`, `.RS`, `ENV`, `PKG`)
- Fondo de color + texto blanco monoespaciado 7px

**Infraestructura:**
- `getIconTheme()` lee `localStorage('ocote_icon_theme')`.
- `window._explorerRefresh()`: re-renderiza la vista actual sin ir al backend (usa el caché `dirCache`). Expuesto para que el selector de tema pueda llamarlo.
- Selector de tema en `index.html`: botones ⬛ y ⊞, script inline análogo al de idioma.

### ⚠️ Problema abierto — calidad visual de los íconos SVG

Los íconos SVG actuales son bloques de color con esquina doblada — visualmente no son reconocibles como "íconos de archivo" tipo VS Code o Terax. El usuario confirmó "todavía no se ve bien".

**Causa**: `svgFile()` usa `path` básico, no SVG paths detallados de librerías de íconos.

**Soluciones a evaluar para la próxima sesión:**
1. **Seti UI font** (MIT, ~120KB): la misma fuente que usa VS Code. Requiere descargar el archivo de fuente y mapear extensiones a glifos unicode.
2. **SVG paths de Phosphor Icons** (MIT): embeber los `<path d="...">` reales para cada tipo de archivo. Más trabajo pero sin dependencia de fuentes.
3. **Material File Icons**: otra alternativa con buena cobertura de tipos de archivo.

El tema `badge` (⊞) es la alternativa limpia mientras se resuelve esto.

**Decisiones tomadas:**

- **Un solo campo `description` en `CommandResponse`**: el frontend no necesita saber qué idioma se consultó. Simplifica el frontend y evita que futuro código accidentalmente use `description_es`.
- **`lang_column()` como whitelist**: la forma más segura de parametrizar el nombre de la columna SQL sin usar `rusqlite::params!` (que no acepta nombres de columna, solo valores).
- **`#[serde(default)]` en campos pt/fr/de**: permite que `commands.json` con solo `description_es/en` siga siendo válido. Retrocompatibilidad sin código adicional.
- **`window._explorerRefresh()` global**: patrón de "publicación de función" — el script inline de `index.html` puede llamar a una función definida en `explorer.js` sin imports ni eventos personalizados.
- **Emojis → SVG pero tema badge como respaldo**: no eliminar el sistema de badge hasta que los SVG sean visualmente aceptables.

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Tooltip en FR/DE mostraba "EJEMPLO" y "Esc o click fuera" en español | Labels hardcodeados en `showTooltip()` | Agregar `UI_STRINGS` y `getUI()` en `tooltip.js` |
| Botones de idioma desaparecían al navegar | `breadcrumb.textContent = path` sobreescribía el DOM | Cambiar a `#breadcrumb-path` (span específico) |
| `autocomplete.js` mostraba `undefined` en descripción | Seguía accediendo a `cmd.description_es` | Cambiar a `cmd.description` |

**Estado al final:**

- CKB con 153 comandos × 5 idiomas ✅
- Selector de idioma funcional ✅
- Tooltip en 5 idiomas ✅
- Sistema dual de íconos implementado ✅
- ⚠️ Calidad visual de íconos SVG: pendiente de resolver

**Próximo paso:** Resolver la calidad visual de los íconos SVG (Seti UI font o Phosphor SVG paths). Después: selector de tipografía.

---

## 2026-05-23 — Sesión 7: Fase 3 completa

**Estado al inicio:** Fase 2 completada. Iniciando Fase 3.

**Qué se hizo:**

- **Detección de contexto** (`context.rs`): `detect_context(path)` detecta tipo de proyecto leyendo archivos centinela. Soporta Git, Node, Rust, Python, Docker, Go, Make. Múltiples tipos por directorio. 3 tests unitarios.
- **Contexto en autocompletado** (`autocomplete.js`): consulta CKB y `detect_context` en paralelo. Sugerencias contextuales aparecen primero con badge naranja (ej. "Git · Node.js"). Cache por CWD para no llamar `detect_context` en cada tecla.
- **Fix sync explorador**: click en carpeta con texto escrito en terminal causaba que el explorador regresara. Fix: `\x15` (Ctrl+U) limpia buffer ZLE antes de `cd`. `window.resetTerminalInput()` sincroniza estado.
- **Onboarding** (`onboarding.js`): overlay animado al primer uso con grid 2×2 de features. `localStorage` persiste el estado. Ctrl+Shift+? para volver a ver. Ícono de la app via `frontend/icon.png` (placeholder, listo para swap).
- **Soporte TUI** (`pty.rs`): `PtyState` guarda el master del PTY. `resize_pty(rows, cols)` llama `master.resize()` → kernel envía SIGWINCH → vim/htop/fzf se redibujan con dimensiones correctas.
- **CKB ampliada** (69 → 76 comandos): `vim`, `nvim`, `nano`, `vi`, `htop`, `fzf`, `tmux` con modos, atajos de teclado y ejemplos en español.
- **Distribución multiplataforma**: `tauri icon` generó `.icns` (macOS) e `.ico` (Windows). `tauri.conf.json` actualizado con metadatos, categoría, instaladores. `.github/workflows/release.yml`: matrix macOS/Ubuntu/Windows, se activa con `git tag vX.Y.Z`.

**Decisiones tomadas:**
- Contexto cacheado por CWD (no por sesión): si el usuario cambia de directorio, el cache se invalida naturalmente en el siguiente keypress.
- `\x15` (Ctrl+U) en vez de `\x03` (Ctrl+C) para limpiar buffer ZLE antes de navegar desde el explorador: Ctrl+C cancela el proceso, Ctrl+U solo limpia la línea.
- GitHub Actions con `releaseDraft: true`: el release no se publica automáticamente. El developer lo revisa y decide cuándo publicar.

**Estado al final:**
- Fase 3 completada ✅
- 76 comandos en CKB ✅
- TUI apps funcionales (vim, nano, htop, fzf, tmux) ✅
- Pipeline de distribución listo: `git tag v0.6.0 && git push origin v0.6.0` genera los tres instaladores ✅

**Próximo paso:** Fase 4 — ícono real, landing page, firma de código macOS, CKB 150+ comandos.

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

---

## 2026-05-24 — Sesión 11: Iconos SVG outline de Tabler Icons

**Estado al inicio:** v0.4.4 con explorador funcional pero iconos de archivo tipo "bloques de color" (rectángulos SVG rellenos). El usuario reportó que "no esta teniendo un buen diseño". Los iconos se veían como cuadrados naranjas/azules sin forma reconocible.

**Qué se hizo:**

### Nuevo sistema de iconos: `frontend/icons.js`
- Descargados paths SVG de **Tabler Icons** (MIT license) desde jsDelivr CDN para referencia
- Iconos seleccionados: `folder`, `file`, `file-code`, `file-text`, `photo`, `music`, `video`, `zip`, `database`, `settings`, `pdf`, `terminal`, `table`, `markdown`, `folder-open`
- Todos los SVGs usan `stroke="currentColor"` y `fill="none"` — son outline icons
- Mapeo de 80+ extensiones de archivo a icono + color:
  - Lenguajes: js(amarillo), ts(azul), python(azul), rust(naranja), go(cyan), java(naranja), ruby(rojo), etc.
  - Tipos: imagen(verde), audio(amarillo), video(rojo), zip(naranja), pdf(rojo), database(azul), config(morado)
- Mapeo de 80+ nombres de carpeta a colores:
  - src/lib/app → azul, node_modules → morado, dist/build → gris, test → verde, docs → celeste, assets → rosa, etc.

### Integración en `explorer.js`
- Modificadas `getFileIconHtml()` y `getFolderIconHtml()` para usar `window.ICON_SET`
- Tema "seti" ahora renderiza `<span class="icon-wrapper" style="color:${color}">${svg}</span>`
- El color se aplica via CSS `color` al contenedor, y el SVG hereda via `currentColor`
- Funciones antiguas `svgFile()` y `svgFolder()` renombradas a `svgFileLegacy` / `svgFolderLegacy` como fallback si `icons.js` no cargó
- Tema "badge" se mantiene intacto (etiquetas de texto coloreadas)

### CSS
- `.icon-wrapper`: contenedor flex 16×16px centrado
- `.icon-wrapper svg`: ancho/alto 16px, `display: block`, `flex-shrink: 0`
- Los estilos legacy `.icon-svg` se mantienen para compatibilidad

**Decisiones tomadas:**
- Usar iconos outline (línea) en lugar de rellenos: se ven más modernos y profesionales, y permiten cambiar el color fácilmente con `currentColor`
- Tabler Icons sobre Seti UI: Tabler tiene una licencia MIT clara, paths SVG limpios, y no requiere fuentes web ni assets binarios
- No descargar brand icons individuales para cada lenguaje: usar `file-code` con color diferente por lenguaje. Es suficiente para un file explorer y evita 30+ SVGs adicionales
- Mantener fallback legacy: si `icons.js` falla al cargar, el explorador sigue funcionando con los SVGs de bloque de color anteriores

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Iconos se ven como bloques de color sin forma | SVGs anteriores eran rectángulos simples con relleno | Reemplazar por SVGs outline de Tabler Icons con paths realistas |
| Color no se aplica a SVGs outline | SVGs outline usan `stroke`, no `fill` | Envolver en `<span style="color:${color}">` para heredar `currentColor` |
| jsDelivr CDN no siempre responde | Descarga de SVGs individuales puede fallar | Copiar paths directamente en `icons.js` como strings, no depender de CDN en runtime |

**Estado al final:**
- Iconos de archivo son SVGs outline profesionales ✅
- 80+ extensiones mapeadas a colores e iconos ✅
- 80+ carpetas con colores específicos ✅
- Tema "badge" sigue funcionando ✅
- Fallback legacy activo ✅
- ~22 commits en `main` ✅

**Próximo paso:** Fase 3 — detección de contexto (git, node, python, rust, docker), sugerencias contextuales, onboarding, y soporte de apps TUI.

---

## 2026-05-22 — Sesión 10: Polish final de Fase 2 — Popup y tooltip

**Estado al inicio:** v0.4.3 con CKB de 62 comandos. El usuario reportó que el popup de autocompletado estaba pegado al fondo de la terminal (posición CSS fija `bottom: 12px`) y que el tooltip no aparecía al ejecutar comandos con argumentos (`cd Desktop`, `git status`).

**Qué se hizo:**

### Fix: tooltip para comandos con argumentos
- **Problema**: `updateCurrentInput()` reseteaba `currentInput = ''` al detectar un espacio. Al presionar Enter después de `cd Desktop`, `currentInput` valía `"Desktop"` en vez de `"cd"`. El tooltip buscaba `"Desktop"` en la CKB y no lo encontraba.
- **Fix**: Separar el tracking en dos variables:
  - `currentInput`: se resetea en espacio (sigue alimentando el autocompletado de prefijos)
  - `currentCommandLine`: acumula la línea completa (usada para extraer el nombre del comando al presionar Enter)
- Ahora `cd ..`, `git status`, `npm install`, etc. muestran tooltip correctamente.

### Fix: posicionamiento dinámico del popup de autocompletado
- **Problema**: El popup usaba `bottom: 12px` en CSS, siempre pegado al fondo de la terminal. Si el usuario escribía en la mitad de la pantalla, el popup quedaba lejos y tapaba el output anterior.
- **Iteración 1 — Arriba del cursor**: calculamos `top = cursorRow*lineHeight - popupHeight`. Tapaba la línea anterior y quedaba muy apretado.
- **Iteración 2 — Debajo del cursor**: calculamos `top = cursorRow*lineHeight + lineHeight + 6`. Mejor, pero aún tapaba un poco la línea de input.
- **Iteración 3 — Debajo con margen amplio**: `top = cursorRow*lineHeight + 2*lineHeight + 20`. El popup flota claramente separado, 2 líneas debajo del cursor + 20px de margen.
- **Implementación**:
  - `terminal.js` expone `window.ocoteTerminal` (instancia xterm.js)
  - `autocomplete.js` lee `term.buffer.active.cursorY`, `viewportY`, `fontSize` y `lineHeight` para calcular la posición exacta en píxeles relativa al viewport.
  - Eliminado `bottom: 12px` del CSS; ahora `top` se controla 100% por JS.

**Decisiones tomadas:**
- Separar tracking de input en dos variables es más simple que parsear retroactivamente: `currentInput` para autocompletado (prefijo) y `currentCommandLine` para tooltip (comando completo).
- Leer coordenadas de xterm.js en vez de estimar con DOM: más preciso porque xterm.js maneja su propio viewport virtual con scroll.
- Margen de 20px + 2 líneas: suficiente para que el popup no se confunda con el prompt ni tape nada, sin quedar demasiado lejos.

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Tooltip no aparece con `cd Desktop` | `currentInput` reseteado en espacio | Separar `currentInput` y `currentCommandLine` |
| Popup tapa línea de input | Margen de solo 6px debajo del cursor | Aumentar a `2*lineHeight + 20px` |
| Popup lejos del cursor | Posición CSS fija `bottom: 12px` | Posicionamiento dinámico con xterm.js coordinates |

**Estado al final:**
- Fase 2 COMPLETADA ✅
- Tooltip funciona con comandos con argumentos ✅
- Popup flota debajo del cursor sin tapar nada ✅
- ~20 commits en `main` ✅
- Preparado para Fase 3 ✅

**Próximo paso:** Fase 3 — detección de contexto (git, node, python, rust, docker), sugerencias contextuales, onboarding, y soporte de apps TUI.

---

## 2026-05-22 — Sesión 9: CKB ampliada de 12 a 62 comandos

**Estado al inicio:** v0.4.2 con tooltip funcionando pero CKB muy pequeña (12 comandos). El usuario quería una base amplia que sirviera tanto a principiantes como a developers expertos.

**Qué se hizo:**

### Expansión masiva de `ckb/commands.json`
- De 12 a 62 comandos totales (+50 nuevos)
- Organizados por categorías funcionales:

| Categoría | Comandos | Para quién |
|-----------|----------|------------|
| filesystem | 16 total | Todos — navegación básica y avanzada |
| search | 8 total | Dev — procesamiento de texto y búsqueda |
| process | 7 total | DevOps/sysadmin — gestión de procesos |
| network | 8 total | Dev/DevOps — conectividad y transferencia |
| development | 10 total | Developers — git, npm, docker, python, rust, etc. |
| system | 13 total | Todos — info del sistema, variables, alias |
| package_manager | 2 total | Todos — brew (macOS), apt (Linux) |

### Comandos principales agregados
- **Principiantes**: `touch`, `clear`, `history`, `man`, `sudo`, `exit`, `alias`, `env`, `whoami`, `date`
- **Developers web**: `node`, `python3`, `docker`, `make`, `gcc`, `curl`, `wget`, `ssh`, `scp`
- **DevOps/sysadmin**: `ps`, `top`, `kill`, `killall`, `ping`, `netstat`, `ifconfig`, `rsync`, `tar`, `gzip`, `chmod`, `chown`
- **Power users**: `find`, `sed`, `awk`, `xargs`, `sort`, `uniq`, `wc`, `cut`, `du`, `df`, `ln`, `unzip`

### Criterios de inclusión
- Comandos universales (funcionan en macOS y Linux)
- Descripción en español clara y sin jerga innecesaria
- Top 3-4 flags más útiles (no todos)
- 2-3 ejemplos prácticos reales
- Excluidos: comandos muy específicos de una distro, aliases internos de zsh, plugins

**Decisiones tomadas:**
- No incluir `vim`/`nano` como comandos de CKB: son apps TUI, no comandos con flags/ejemplos simples
- `ifconfig` incluido aunque está "deprecated" en Linux: sigue siendo el default en macOS
- `apt` y `brew` como representantes de gestores de paquetes (no `yum`/`pacman` por simplicidad)
- `python3` en vez de `python`: macOS y distros modernas usan python3
- Descripciones en español informal pero preciso: "Elimina archivos o carpetas (¡sin papelera!)"

**Estado al final:**
- 62 comandos en CKB ✅
- Todos con descripción_es, flags y ejemplos ✅
- Compila y carga correctamente en SQLite al arrancar ✅
- Tooltip y autocompletado funcionan con todos los comandos ✅

**Próximo paso:** Fase 3 — detección de contexto (git, node, python, etc.).

---

## 2026-05-22 — Sesión 8: Tooltip educativo de comandos

**Estado al inicio:** v0.4.1 con CKB, autocompletado, y explorador funcionando. `tooltip.js` era un placeholder roto (buscaba `#terminal-input` que ya no existe). El tooltip es uno de los diferenciadores clave del proyecto.

**Qué se hizo:**

### Reescritura de `tooltip.js`
- Eliminada la lógica antigua que dependía de `#terminal-input` (eliminado en v0.3.0)
- Nuevo sistema basado en eventos: escucha `window.onTerminalCommandExecuted(cmdName)`
- Consulta `get_command_info(name)` en la CKB via Tauri
- Renderiza card con:
  - Header: nombre del comando (naranja Ocote) + categoría (badge gris)
  - Descripción en español
  - Top 3 flags con su descripción
  - Ejemplo con el comando en verde + descripción
  - Hint: "Esc o click fuera para cerrar"
- Auto-cierra después de 8 segundos
- No muestra nada si el comando no está en la CKB

### Modificación de `terminal.js`
- En `updateCurrentInput()`, al detectar Enter: extrae la primera palabra del input como nombre de comando
- Llama `window.onTerminalCommandExecuted(cmdName)` después de manejar `cd` y antes de resetear `currentInput`
- Solo notifica si hay contenido (evita mostrar tooltip en Enter vacío)

### CSS del tooltip (`theme.css`)
- `.tooltip-header`: flex con justify-content: space-between
- `.tooltip-category`: badge pequeño uppercase con fondo oscuro
- `.tooltip-section-title`: "FLAGS COMUNES" / "EJEMPLO" en gris uppercase
- `.tooltip-flag`: layout horizontal con `code` (amarillo, fondo oscuro) + descripción
- `.tooltip-example`: bloque verde con `$ comando`
- `.tooltip-example-desc`: descripción del ejemplo en gris
- Separador sutil antes del hint de cierre

**Decisiones tomadas:**
- Mostrar tooltip al **ejecutar** comando (Enter) en vez de al escribirlo: menos intrusivo, aparece cuando el usuario ya decidió usar el comando
- Auto-close a los 8s: el usuario no debe cerrarlo manualmente, pero tampoco queda forever
- Top 3 flags en vez de todos: la CKB tiene hasta 4 flags por comando, pero 3 caben mejor en la card
- No mostrar si comando no está en CKB: evita cards vacías o "comando no encontrado"

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Tooltip no aparece | `tooltip.js` era placeholder roto que buscaba `#terminal-input` | Reescribir completamente con arquitectura de eventos |
| Card vacía para comandos desconocidos | No se validaba si `get_command_info` devolvía null | `if (info) showTooltip()` else `hideTooltip()` |

**Estado al final:**
- Tooltip educativo funcional ✅
- Aparece al ejecutar comandos reconocidos ✅
- Se cierra con Esc, click fuera, o auto-close a 8s ✅
- Sin errores de JS ✅

**Próximo paso:** Ampliar CKB de 12 a ~50-80 comandos. Luego Fase 3: detección de contexto.

---

## 2026-05-22 — Sesión 7: CKB en SQLite + Autocompletado visual

**Estado al inicio:** v0.3.0 con explorador de archivos funcional. CKB solo tenía `commands.json` (JSON estático). `autocomplete.js` era un placeholder vacío.

**Qué se hizo:**

### Implementación de `ckb.rs`
- Esquema SQLite en memoria (`:memory:`) con 3 tablas: `commands`, `flags`, `examples`
- Carga inicial al arrancar: parsea `ckb/commands.json` (12 comandos de muestra) con `serde_json`
- `get_suggestions(prefix)` — búsqueda por prefijo insensible a mayúsculas (`LIKE 'prefix%'`)
- `get_command_info(name)` — recupera descripción, categoría, flags y ejemplos de un comando
- Manejo de errores con `.map_err(|e| e.to_string())` para compatibilidad con `Result<T, String>` de Tauri

### Registro en `main.rs`
- Agregado `CkbState::new()` al estado de Tauri vía `.manage()`
- Registrados comandos `ckb::get_suggestions` y `ckb::get_command_info` en `generate_handler!`
- Agregada dependencia `rusqlite = { version = "0.31", features = ["bundled"] }` en `Cargo.toml`

### Implementación de `autocomplete.js`
- Escucha `window.onTerminalInputChanged(input)` desde `terminal.js`
- Debounce de 150ms para no saturar la CKB
- Si el input tiene 1+ caracteres y no contiene espacio: consulta CKB vía `invoke('get_suggestions', { prefix: input })`
- Renderiza popup flotante con nombre del comando + descripción en español
- Click en sugerencia: envía backspaces para borrar lo escrito + inyecta el comando completo en el PTY

### Modificación de `terminal.js`
- Agregada función `updateCurrentInput(data)` que trackea lo que el usuario escribe
- Detecta: backspace (`\x08`, `\x7f`), enter (`\r`, `\n`), escape/secuencias VT, caracteres de control, y caracteres imprimibles
- Resetea `currentInput` al detectar espacio o enter (indica que ya no es prefijo de comando)
- Notifica a `window.onTerminalInputChanged(currentInput)` después de cada cambio

### CSS
- No requirió cambios — los estilos del popup ya estaban en `theme.css` desde v0.1.0

**Decisiones tomadas:**
- SQLite en memoria (`:memory:`) por simplicidad en Fase 2. En Fase 3 se migrará a archivo en el directorio de datos de la app para persistencia entre sesiones.
- Autocompletado informativo (visual) en vez de interactivo vía teclado: más simple, no intercepta flechas/enter/escape que zsh usa para historial y tab-completion. El usuario ve la sugerencia y puede seguir escribiendo o hacer click.
- Debounce de 150ms: balance entre responsividad y no saturar la base de datos en cada tecla.
- Eliminado import `Result as SqliteResult` no usado tras cambiar `init_schema` a devolver `Result<(), String>`.

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Error de compilación en `ckb.rs` | `init_schema` devolvía `rusqlite::Result` pero `new()` devolvía `Result<Self, String>`; `?` no podía convertir el error | `.map_err(|e| e.to_string())` en cada operación SQL dentro de `init_schema` |
| Popup no aparece | `autocomplete.js` era un placeholder vacío | Implementación completa con debounce, query a CKB, renderizado y click handler |

**Estado al final:**
- CKB operativa con 12 comandos en SQLite ✅
- Autocompletado visual funcional ✅
- Build exitoso sin errores (4 warnings: imports/structs sin usar de Fases 2–3) ✅
- 13 commits en GitHub (rama `main`) ✅

---

## 2026-05-22 — Sesión 7b: Fixes de sincronización y errores

**Estado al inicio:** v0.4.0 con autocompletado visual funcionando, pero sincronización terminal→explorador lenta (2s de polling) y error `TypeError: null is not an object` en tooltip.js.

**Qué se hizo:**

### Fix: sincronización lenta
- **Problema**: polling cada 2s + `lsof` escanea todos los descriptores de archivos del proceso zsh. Con plugins cargados, `lsof` tarda. `cd ..` era más rápido que `cd <carpeta>` porque resuelve a paths más cortos.
- **Fast-path**: `terminal.js` detecta Enter después de `cd <target>` y llama `window.onTerminalCdExecuted(target)` inmediatamente. El explorador se actualiza al instante.
- **Fallback**: polling reducido de 2000ms a 1000ms para corregir casos edge (`cd -`, subshells, cd que falla).
- **`resolveCdPath()`**: resuelve rutas relativas, absolutas, `..`, `~`, y `cd` sin argumentos (→ home). Usa variable `homePath` guardada al inicializar.

### Fix: `tooltip.js` crash
- `const inputEl = document.getElementById('terminal-input')` devolvía `null` porque xterm.js eliminó el input HTML en v0.3.0.
- El `addEventListener` en `null` lanzaba `TypeError` en cada arranque.
- Fix: envolver todo en `if (inputEl) { ... }`.

### Quitar logs de debug
- `autocomplete.js` tenía `console.log` en cada tecla. Removidos para producción.

**Estado al final:**
- Sincronización terminal→explorador: instantánea para `cd` ✅
- Fallback polling: 1s ✅
- Sin errores de JS en consola ✅

---

## 2026-05-22 — Sesión 7c: Cache de directorios + optimización file_type

**Estado al inicio:** v0.4.0/v0.4.1 con sync instantáneo para `cd`, pero todavía perceptiblemente más lento que Terax. El usuario reportó que la navegación no es instantánea como debería ser.

**Qué se hizo:**

### Cache de directorios en frontend
- Agregado `dirCache` (Map) en `explorer.js`: almacena `{ entries, timestamp }` por path
- TTL de 30 segundos — directorios recién visitados se renderizan sin llamar a Rust
- `loadDirectory(path, { instant })`: centraliza toda la carga de directorios
  1. Si hay cache válido → `renderEntries()` inmediatamente
  2. Si no hay cache → muestra loading → llama `list_directory` → guarda en cache → renderiza
- `refreshDirectory(path)`: refresca en background sin bloquear UI

### Optimización en Rust
- `fs_explorer.rs`: reemplazado `entry.metadata()` por `entry.file_type()`
  - `metadata()` hace syscall para leer permisos, tamaño, timestamps
  - `file_type()` solo devuelve si es archivo o carpeta — syscall mucho más rápida
  - Eliminada lectura de `metadata.len()` (size) — el frontend no lo muestra actualmente

### Refactor de explorer.js
- `handleClick()` y `onTerminalCdExecuted()` ahora usan `loadDirectory()` en vez de lógica duplicada
- `initExplorer()` usa `loadDirectory()`
- `startSyncPolling()` usa `loadDirectory()`

**Decisiones tomadas:**
- Cache en frontend (no en Rust): el bottleneck no es la red (es local), es el syscall de leer directorio + serialización JSON + IPC Tauri. Cachear en JS evita todo eso.
- TTL de 30s: suficiente para navegación rápida, no demasiado largo para que archivos nuevos no aparezcan.
- `file_type()` en vez de `metadata()`: el size no se usa en la UI actualmente. Si se necesita en el futuro, se puede agregar como campo opcional.

**Problemas encontrados y soluciones:**

| Síntoma | Causa | Fix |
|---------|-------|-----|
| Navegación lenta aun con fast-path | Cada `cd` hace IPC + syscall + read_dir completo | Cache de directorios en frontend |
| `list_directory` tarda en directorios grandes | `metadata()` lee stats de cada archivo | `file_type()` solo chequea si es dir |

**Estado al final:**
- Navegación instantánea a directorios ya visitados ✅
- `file_type()` más rápido que `metadata()` ✅
- Refactor centralizado en `loadDirectory()` ✅
- Aún más lento que Terax (quizás por el IPC de Tauri vs Terax que usa Node.js nativo) — aceptable para v0.4.1

**Próximo paso:** Tooltip educativo (card de comando con ejemplos al presionar Enter). Luego Fase 3: detección de contexto (git, node, etc.).

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
