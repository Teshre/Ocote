# Devlog — Ocote

Registro de cada sesión de desarrollo. Qué se hizo, qué se aprendió, qué quedó pendiente.
Formato: fecha → qué se construyó → decisiones tomadas → próximo paso.

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
