# Changelog — Ocote

Todos los cambios notables del proyecto están documentados aquí.
Formato basado en [Keep a Changelog](https://keepachangelog.com/es/1.0.0/).

---

## [Unreleased]

### En progreso
- PTY wrapper: conectar bash/zsh al input/output de la ventana (Fase 1)

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
