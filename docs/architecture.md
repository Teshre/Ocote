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
│   ├── index.html      — Layout principal
│   ├── terminal.js     — Render de output + manejo de input
│   ├── explorer.js     — Panel lateral de archivos
│   ├── autocomplete.js — Popup de sugerencias
│   ├── tooltip.js      — Card educativa de comandos
│   └── theme.css       — Estilos y variables de color
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

## Consideraciones de seguridad

- La app no hace ninguna petición de red en runtime. Todo es local.
- El PTY corre el shell con los mismos permisos del usuario — no hay escalada de privilegios.
- La CKB es de solo lectura en runtime; los usuarios no pueden modificarla desde la UI.
- No se almacenan contraseñas ni tokens en ninguna parte.
