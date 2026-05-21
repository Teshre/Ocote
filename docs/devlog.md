# Devlog — Ocote

Registro de cada sesión de desarrollo. Qué se hizo, qué se aprendió, qué quedó pendiente.
Formato: fecha → qué se construyó → decisiones tomadas → próximo paso.

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
