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

```
Usuario escribe en #terminal-input
  → terminal.js captura el keydown
  → invoke('write_to_shell', { input }) [Fase 1]
  → pty.rs escribe al stdin del proceso bash
  → bash produce output con secuencias ANSI
  → pty.rs lee el output en un thread separado
  → emit('pty-output', texto) hacia el frontend
  → vt_parser.rs convierte ANSI → HTML spans [Fase 1]
  → terminal.js inserta los spans en #terminal-output
```

```
Usuario escribe prefijo de comando
  → autocomplete.js detecta input sin espacios
  → invoke('get_suggestions', { prefix }) [Fase 2]
  → ckb.rs hace SELECT en SQLite
  → retorna Vec<Command> al frontend
  → autocomplete.js renderiza el popup
```

---

## Consideraciones de seguridad

- La app no hace ninguna petición de red en runtime. Todo es local.
- El PTY corre el shell con los mismos permisos del usuario — no hay escalada de privilegios.
- La CKB es de solo lectura en runtime; los usuarios no pueden modificarla desde la UI.
- No se almacenan contraseñas ni tokens en ninguna parte.
