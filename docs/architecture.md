# Arquitectura de Ocote

Decisiones técnicas del proyecto — por qué elegimos cada cosa y qué alternativas se descartaron.

---

## Stack general

| Capa | Tecnología | Alternativas descartadas |
|---|---|---|
| Backend | Rust | Go, C++ |
| UI framework | Tauri v1 | Electron, Flutter, Qt |
| Frontend | HTML/CSS/JS vanilla | React, Vue, Svelte |
| Base de datos | SQLite (rusqlite) | JSON en disco, sled |
| PTY | portable-pty | libc directo, nix crate |
| VT parser | vte | termwiz, implementación propia |
| Package manager | pnpm | npm, yarn |

---

## Decisiones de arquitectura

### Por qué Rust y no Go o Python

Rust da control total sobre el PTY sin overhead de GC, lo cual importa en una terminal donde cada milisegundo de latencia es perceptible. Go habría sido más fácil de aprender pero tiene pausas de GC y su ecosistema de PTY es más limitado. Python está descartado por rendimiento y por distribución (requiere runtime instalado).

### Por qué Tauri y no Electron

Tauri usa el webview nativo del sistema operativo (WKWebView en macOS, WebView2 en Windows, WebKitGTK en Linux). El binario resultante pesa ~5 MB vs ~150 MB de Electron. Para una terminal que se vende como "ligera y offline", el tamaño importa. Tauri también tiene mejor integración con código Rust nativo.

### Por qué Tauri v1 y no v2

v2 salió en 2024 y tiene una API de plugins diferente. Al empezar el proyecto (Mayo 2026), v1 tiene más documentación, más ejemplos en la comunidad y más tutoriales disponibles. La migración a v2 se puede considerar en la Fase 3 o 4 cuando el proyecto esté más maduro.

### Por qué SQLite para la CKB y no JSON en disco

JSON en disco es simple pero no escala bien a búsquedas por prefijo (autocompletado). SQLite permite `SELECT * FROM commands WHERE name LIKE 'git%'` con un índice, lo que da respuesta en microsegundos sin cargar toda la base en memoria. El archivo `commands.json` sigue siendo la fuente de datos editable por humanos; SQLite es solo el motor de consulta en runtime.

### Por qué frontend vanilla y no React/Vue

La UI de Ocote tiene tres componentes claramente delimitados (terminal output, explorador, tooltip). No hay estado compartido complejo ni re-renders frecuentes en cascada. Un framework completo agrega ~100 KB de JS, tiempo de compilación y una capa de abstracción innecesaria. JS vanilla con módulos ES es suficiente y el resultado es más rápido.

### Por qué portable-pty y no llamadas directas a libc

`portable-pty` abstrae las diferencias entre Unix (openpty/forkpty) y Windows (ConPTY). Como el objetivo es cross-platform desde el inicio, usar la crate evita mantener dos implementaciones separadas de algo tan delicado como el PTY.

---

## Estructura de carpetas

```
Ocote/
├── src-tauri/          — Backend Rust
│   ├── src/
│   │   ├── main.rs     — Entry point, registra comandos Tauri
│   │   ├── pty.rs      — PTY wrapper (Fase 1)
│   │   ├── vt_parser.rs— Parser ANSI/VT (Fase 1)
│   │   ├── ckb.rs      — Command Knowledge Base / SQLite (Fase 2)
│   │   ├── fs_explorer.rs — Árbol de archivos (Fase 2)
│   │   └── context.rs  — Detección de contexto (Fase 3)
│   ├── Cargo.toml      — Dependencias Rust
│   ├── build.rs        — Script requerido por Tauri (no modificar)
│   ├── tauri.conf.json — Configuración de ventana y bundle
│   └── icons/          — Íconos de la app
├── frontend/           — UI (HTML/CSS/JS)
│   ├── index.html      — Layout principal (3 paneles: explorador, terminal, preview)
│   ├── terminal.js     — xterm.js + OSC handlers (6731, 133 A/D)
│   ├── tab-manager.js  — Múltiples terminales en tabs
│   ├── explorer.js     — Panel lateral, breadcrumb, menú contextual, operaciones
│   ├── preview.js      — Preview de archivos (highlight.js + imágenes base64)
│   ├── resizer.js      — Drag-to-resize de los 3 paneles
│   ├── icons.js        — SVG Tabler Icons + 5 temas de íconos
│   ├── autocomplete.js — Popup de sugerencias contextuales
│   ├── tooltip.js      — Card educativa de comandos (CKB)
│   ├── settings.js     — Modal de configuración con previews en vivo
│   ├── prompt.js       — Overlay HTML de prompts (5 presets)
│   ├── themes.js       — 8 temas Ocote generados desde OCOTE_THEME_DATA
│   ├── ui-i18n.js      — Internacionalización (ES/EN/PT/FR/DE)
│   ├── onboarding.js   — Overlay de primer uso
│   └── theme.css       — Variables CSS + estilos base
├── ckb/
│   └── commands.json   — Fuente de datos de la CKB (editable por humanos)
├── docs/               — Esta carpeta
├── CHANGELOG.md        — Historial de cambios por versión
├── CLAUDE.md           — Contexto del proyecto para sesiones con IA
└── package.json        — Scripts de desarrollo (pnpm dev / pnpm build)
```

---

## Flujo de datos

### Input (tecla → PTY)
```
Usuario presiona tecla en #terminal-output (tabindex="0")
  → terminal.js captura keydown
  → traduce a secuencia de escape correcta (\r, \x08, \x1b[A, etc.)
  → invoke('write_to_shell', { input })
  → pty.rs escribe bytes al stdin del proceso bash/zsh
  → ZLE (Zsh Line Editor) recibe cada carácter individualmente
  → ZLE hace echo del carácter + redibuja el prompt si es necesario
```

### Output (PTY → pantalla)
```
bash/zsh produce output con secuencias ANSI/VT
  → pty.rs lee bytes en thread separado (buffer 4 KB)
  → emit('pty-output', string) hacia el frontend vía Tauri event
  → terminal.js recibe el evento
  → vtParser.write(payload) — VtParser procesa byte a byte
  → secuencias ANSI parseadas:
      \x1b[K  → limpiar línea actual
      \x1b[A/B → mover cursor arriba/abajo en el DOM
      \x1b[0J → limpiar desde línea actual hasta el final
      \x1b[m  → aplicar estilos SGR (color, bold, etc.)
      \x1b[G  → IGNORADO (no limpia ni mueve en el DOM)
      \r\n / \n → avanzar línea (_advanceLine)
      \r solo → limpiar línea actual (sin avanzar)
  → _writeText() inserta <span style="..."> en el div actual
  → requestAnimationFrame hace scroll al final
```

### Autocompletado (Fase 2 — pendiente)
```
Usuario escribe prefijo de comando
  → autocomplete.js detecta input sin espacios
  → invoke('get_suggestions', { prefix })
  → ckb.rs hace SELECT en SQLite
  → retorna Vec<Command> al frontend
  → autocomplete.js renderiza el popup
```

### Modelo DOM del parser (VtParser)
```
outputEl (#terminal-output)
  └── div.term-line          ← línea 0
  └── div.term-line          ← línea 1
  └── div.term-line.current  ← línea activa (cursor aquí)
        └── span[style]      ← texto con color/bold/etc.
        └── texto plano      ← texto sin estilo
```
- `this.lines[]` — array de todos los divs en el DOM
- `this.lineIdx` — índice de la línea activa
- `_advanceLine()` — reutiliza el siguiente div existente; solo crea uno nuevo al llegar al final. Crítico para evitar el gap visual cuando p10k mueve el cursor hacia arriba.

---

## Por qué `ocoteConfirm()` en lugar de `window.confirm()`

`window.confirm()` no funciona de forma fiable en Tauri/WKWebView (macOS). WKWebView requiere que el `WKUIDelegate` implemente `webView:runJavaScriptConfirmPanelWithMessage:...` para que `confirm()` muestre un diálogo; si no se implementa, retorna `true` inmediatamente sin bloquear — lo que causaba borrados silenciosos al hacer click en "Eliminar".

Solución: `ocoteConfirm(message)` en `explorer.js` crea un modal HTML propio con `Promise<boolean>`. Ventajas adicionales: se puede estilizar con las variables CSS de Ocote (fondo charcoal, borde ember), muestra el conteo de elementos para carpetas no vacías, y tiene `Escape`/`Enter` como atajos. Foco inicial en "Cancelar" para proteger contra click accidental.

## Layout de 3 paneles y resize (`resizer.js`)

El layout principal es `flex-direction: row` con tres paneles:

```
[#explorer-panel] [#resizer-explorer] [#terminal-panel] [#resizer-preview] [#preview-panel]
```

- **Explorer** y **Preview**: ancho fijo en px, controlado por inline `style.width`.
- **Terminal**: `flex: 1`, toma el espacio restante automáticamente.
- **Resizers**: divs de 5px. Transparentes por defecto; línea accent en hover/drag.
- El CSS tiene `transition: width 200ms ease` en los paneles para la animación del colapso. Durante el drag se desactiva (`style.transition = 'none'`) para que el resize sea fluido sin lag visual.
- Después de cada cambio de tamaño se llama `fitAddon.fit()` para que xterm.js recalcule filas/columnas y el PTY reciba `SIGWINCH`.
- Los anchos se persisten en `localStorage` y se restauran antes del primer paint.
- Cuando el explorador está colapsado (`.collapsed` → `width: 0 !important`), el `!important` del CSS prevalece sobre el inline style del resizer — el colapso siempre gana. Al expandir, el inline width toma efecto de nuevo.
- `MutationObserver` sobre las clases del panel oculta/muestra el handle correspondiente.

## Sistema de temas de íconos (`icons.js`)

Cinco temas con una API unificada:

| Tema | Renderizado | Colores |
|---|---|---|
| `seti` | SVG stroke Tabler Icons | Fijos por extensión (del mapa `ICON_FILE_MAP`) |
| `badge` | SVG rect + texto | Fijos (colores de tecnología) |
| `ember` | SVG rect outline + fill 18% | **CSS runtime** — lee `getComputedStyle(documentElement)` en cada render |
| `brand` | SVG rect sólido | Fijos (colores oficiales de tecnología) |
| `symbols` | SVG texto Unicode | Fijos (colores de tecnología) |

El tema Ember es el único que reacciona al tema de color activo porque resuelve variables CSS (`--syntax-yellow`, `--accent`, etc.) en tiempo de ejecución. Esto significa que cuando el usuario cambia de "Ocote" a "Noche", los íconos Ember también cambian de color sin recargar el explorador — solo hay que llamar `_explorerRefresh()`.

Las funciones están divididas en tres capas:
- `getIconForFile / getIconForFolder` — flujo legacy seti (retorna `{svg, color}`)
- `getThemedIconHtml / getThemedFolderHtml` — brand/ember/symbols (retorna HTML string completo)
- `getIconHtmlForTheme / getFolderHtmlForTheme` — API unificada para los 5 temas (usada por el preview de settings)

## Preview de archivos (`preview.js`)

El backend tiene dos comandos:
- `read_text_file(path)` → `String` (UTF-8). Falla si es binario.
- `read_file_base64(path)` → `String` (base64). Para imágenes.

El frontend detecta la extensión y decide qué hacer:
- Código/texto → `read_text_file` + `hljs.highlightAuto()` (highlight.js bundleado, sin CDN).
- Imágenes (png/jpg/gif/svg/webp) → `read_file_base64` + data URL en `<img>`.
- Archivos >512KB → warning + truncado a 512KB en el preview.
- Archivos >10MB → el backend rechaza con error (`MAX_PREVIEW_SIZE` en `fs_explorer.rs`).
- Resto → mensaje "Vista previa no disponible".

Highlight.js corre completamente en el frontend, sin servidor. El archivo bundleado pesa ~400KB y soporta 40+ lenguajes.

## Consideraciones de seguridad

### Defensa contra XSS y path traversal

Cualquier string que viene del shell (vía OSC 6731: `cwd`, `branch`, `time`) o del
filesystem (nombres de archivo) se trata como no-confiable. Dos capas de defensa:

**1. Escapado en frontend.** Cada renderer que pinta metadata del shell escapa:
- `prompt.js` → `esc()` aplicada a `m.cwd`, `m.branch`, `m.time` en los 8 renderers.
- `explorer.js` → `escapeHtml()` en entries, breadcrumbs, mensajes de error.
- `aliases.js` → `esc()` en el editor.
- `searcher.js` → `escHtml()` en los resultados del buscador.

**2. Validación de path en backend.** Las 10 funciones de `fs_explorer.rs`
(`list_directory`, `read_text_file`, `read_file_base64`, `create_file`,
`create_directory`, `delete_item`, `delete_item_recursive`,
`count_dir_entries`, `rename_item`, `search_files`) reciben `shell_id` y
validan que su `path` sea hijo del `cwd` del shell activo (canonicalize +
`starts_with`).

El `cwd` del shell vive en `pty.rs` como `ShellState.cwd: Mutex<Option<PathBuf>>`
por `shellId`. La única forma de setearlo es a través del comando
`set_shell_cwd`, llamado desde el handler OSC 6731 con el JSON que el
shell emite en cada prompt. El frontend NUNCA lo setea directamente.

`check_path_for_shell` en `fs_explorer.rs`:
```rust
fn check_path_for_shell(path: &str, shell_id: Option<&str>) -> Result<PathBuf, String> {
    let canonical = std::fs::canonicalize(path)
        .map_err(|e| format!("No se pudo resolver la ruta: {}", e))?;
    let cwd = shell_id
        .and_then(|id| pty::get_shell_cwd(id))
        .or_else(home_dir)
        .ok_or("No se pudo determinar el directorio permitido")?;
    if !canonical.starts_with(&cwd) {
        return Err(format!("Operación fuera del directorio permitido: '{}' no está dentro de '{}'",
            canonical.display(), cwd.display()));
    }
    Ok(canonical)
}
```

El `shell_id: Option<String>` permite el caso edge del primer arranque (el
explorador necesita cargar el directorio antes del primer OSC 6731). En ese
caso, fallback a `home_dir()`.

**3. Sincronización sin race condition.** El handler OSC 6731 en `terminal.js`
encadena `invoke('set_shell_cwd').finally(() => onShellCwdChanged)` — el
explorador SIEMPRE se sincroniza después de que el backend tiene el nuevo
CWD. Esto evita el bug `"Operación fuera del directorio permitido"` que
aparecía al hacer `cd ..` desde una subcarpeta.

**4. CSP estricto** (`tauri.conf.json`):
```
default-src 'self'
img-src 'self' data: asset: https://asset.localhost
style-src 'self' 'unsafe-inline'
script-src 'self'
font-src 'self' data:
```
`'unsafe-inline'` se mantiene en styles porque el JS genera estilos
dinámicos (preview de highlight.js, position de overlays).

**5. Límite de tamaño de archivo.** `MAX_PREVIEW_SIZE = 10 * 1024 * 1024` en
`fs_explorer.rs::read_text_file` y `read_file_base64`. Previene DoS por
preview de archivos grandes.

**6. Escapado de `osascript`.** Notificaciones del sistema en macOS dev
usan `osascript_escape()` en `main.rs` que escapa `\n`/`\r`/`\t` y descarta
controles ASCII. Sin esto, un title con `"` o `\` ejecuta AppleScript
arbitrario.

### Otras consideraciones

- La app no hace ninguna petición de red en runtime. Todo es local.
- El PTY corre el shell con los mismos permisos del usuario — no hay escalada de privilegios.
- La CKB es de solo lectura en runtime; los usuarios no pueden modificarla desde la UI.
- No se almacenan contraseñas ni tokens en ninguna parte.
- `delete_item_recursive` usa `remove_dir_all` — operación irreversible. El frontend siempre llama `count_dir_entries` primero y muestra confirmación explícita con el número de elementos. Nunca se llama sin confirmación del usuario.
- Los SVG de íconos se generan desde constantes locales (no input del usuario), por lo que `innerHTML` de SVG strings es seguro.
