<div align="center">

<img src="docs/assets/ocote-icon-200.png" width="140" alt="Ocote">

# Ocote

### La terminal que ilumina la pantalla negra
**Offline · sin IA · hecha para humanos**

[English](README.md) · [**Español**](README.es.md)

[![License: MIT](https://img.shields.io/badge/License-MIT-E8843A.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/plataformas-macOS%20·%20Windows%20·%20Linux-82A6E0.svg)]()
[![Built with Rust](https://img.shields.io/badge/hecho%20con-Rust%20+%20Tauri-7DC97A.svg)]()
[![No AI](https://img.shields.io/badge/IA%20en%20runtime-cero-E8635A.svg)]()
[![GitHub stars](https://img.shields.io/github/stars/Teshre/Ocote?style=social)](https://github.com/Teshre/Ocote/stargazers)

<video src="https://github.com/user-attachments/assets/d8507064-9b59-4821-a684-7fa7c51472bd" width="800" controls></video>

</div>

---

## ¿Qué es Ocote?

**Ocote** es una terminal de línea de comandos pensada para ser la más **accesible** del mercado — desde principiantes absolutos hasta desarrolladores experimentados. Toma su nombre del *ocote*, la madera resinosa que en Mesoamérica se usa para encender el fuego: la chispa que ilumina lo que antes era una pantalla negra e intimidante.

A diferencia de las terminales modernas que apuestan por asistentes de IA en la nube, Ocote es **radicalmente offline**: toda la ayuda — descripciones de comandos, autocompletado, sugerencias — vive en una base de datos local. Lo que corre en tu máquina, se queda en tu máquina.

**Posicionamiento:** anti-IA, determinista, offline-first.
**Mercado objetivo:** América Latina primero — español como lengua primaria.

---

## ✨ Características

### 🎓 Aprende mientras escribes
- **Base de Conocimiento de Comandos (CKB):** 153 comandos documentados en **5 idiomas** (español, inglés, portugués, francés, alemán), almacenados en SQLite local.
- **Tooltip educativo:** al ejecutar un comando reconocido, una tarjeta no invasiva muestra su descripción, flags comunes y un ejemplo.
- **Autocompletado contextual:** escribe el inicio de un comando y aparecen sugerencias con su descripción. En un proyecto Rust verás `cargo build` primero; en uno Node, `npm run dev`.

### 📁 Explorador de archivos integrado
- Panel lateral que muestra tu directorio actual con íconos por tipo de archivo.
- **Sincronización bidireccional:** navega con clics en el explorador o con `cd` en la terminal — ambos se mantienen en sync.
- Breadcrumb navegable con segmentos clicables.

### 🎨 Prompt visual con identidad propia
5 presets de prompt diseñados como una capa visual sobre la terminal (sin romper la salida ANSI):

| Preset | Estilo |
|--------|--------|
| `pill` | Cápsulas redondeadas — la firma de Ocote |
| `block` | Cada comando es una tarjeta, estilo Warp |
| `rail` | Riel vertical que ancla el prompt |
| `ribbon` | Subrayado tenue tipo tab-indicator |
| `minimal` | Solo tipografía, limpio y silencioso |
| `passthrough` | Respeta tu prompt nativo (p10k, oh-my-zsh…) |

- **10 temas de color:** Ocote Dark/Light, Dracula, One Dark, Monokai, Solarized Dark/Light, Gruvbox, Nord, Tokyo Night.
- **Nerd Fonts** incluidas: JetBrainsMono NF, FiraCode NF, MesloLGS NF.

### 🐚 Listo para usar — 4 shells, sin configurar nada
Ocote trae integradas las herramientas que normalmente instalas y configuras a mano:

| | zsh | bash | fish | PowerShell |
|---|:---:|:---:|:---:|:---:|
| Prompt + presets | ✅ | ✅ | ✅ | ✅ |
| **fzf** (Ctrl+R historial, Alt+C cd fuzzy) | ✅ | ✅ | ✅ | ✅ |
| **zoxide** (`z` — cd inteligente) | ✅ | ✅ | ✅ | ✅ |
| **bat** (cat con colores) | ✅ | ✅ | ✅ | ✅ |
| Resaltado de sintaxis | ✅ | — | ✅ | ✅ |
| Autosugerencias | ✅ | — | ✅ | ✅ |

*Todo bundleado: el usuario no instala ni configura nada.*

### 🧩 Otros detalles
- **Múltiples pestañas** de terminal (`Ctrl+T` nueva, `Ctrl+W` cerrar).
- **Interfaz traducida** a 5 idiomas.
- **Ícono de la app** seleccionable (claro/oscuro).
- **Ajustes** de tamaño de fuente, estilo de cursor e historial.
- **Onboarding** de bienvenida al primer uso.

---

## 🚀 Diferenciadores

1. **Sin IA en runtime** — 100% offline, cero peticiones de red.
2. **Command Knowledge Base** en SQLite local — respuesta en microsegundos.
3. **Explorador de archivos** integrado con sincronización en vivo.
4. **Autocompletado visual** con descripción del comando.
5. **Tooltip educativo** no invasivo (`Esc` para cerrar).
6. **Sugerencias contextuales** por heurísticas puras — sin ML.
7. **Sistema de prompt visual** con presets HTML sobre el canvas.

---

## 📦 Instalación

> ⚠️ Ocote está en desarrollo activo (Fase 4 / pre-lanzamiento). Los binarios firmados llegarán pronto.

### Desde binarios (próximamente)
Descarga la última versión para tu plataforma desde [Releases](https://github.com/Teshre/Ocote/releases):
- **macOS:** `.dmg` (Apple Silicon / Intel)
- **Windows:** `.exe` (instalador NSIS)
- **Linux:** `.AppImage` / `.deb`

### Desde el código fuente
Requisitos: [Rust](https://rustup.rs), [Node.js](https://nodejs.org) y [pnpm](https://pnpm.io).

```bash
git clone https://github.com/Teshre/Ocote.git
cd Ocote
pnpm install

# Desarrollo (hot-reload)
pnpm tauri dev

# Build de producción
pnpm tauri build
```

---

## 🛠️ Stack técnico

| Capa | Tecnología |
|------|-----------|
| Backend | **Rust** (`portable-pty`, `rusqlite`, `serde`) |
| Framework UI | **Tauri v1** (webview nativo del SO) |
| Frontend | HTML/CSS/JS vanilla (sin frameworks) |
| Renderizado de terminal | **xterm.js** (canvas/WebGL) |
| Base de datos | SQLite local |
| Plataformas | macOS · Windows · Linux |

**¿Por qué Tauri y no Electron?** El binario pesa ~33 MB (vs ~150 MB de Electron) porque usa el webview nativo del sistema. Para una terminal que se vende como ligera y offline, el tamaño importa.

---

## 🗺️ Estado del proyecto

Ocote está en la **Fase 4** de su roadmap (preparación para lanzamiento). Ya funcionan:

- ✅ PTY real con zsh/bash/fish/PowerShell conectados
- ✅ Renderizado con xterm.js + sistema de overlays propio
- ✅ Explorador de archivos con sincronización
- ✅ CKB multilenguaje (153 comandos × 5 idiomas)
- ✅ Autocompletado y tooltip educativo
- ✅ 10 temas + 5 presets de prompt
- ✅ Herramientas out-of-the-box (fzf, zoxide, bat, syntax highlighting, autosuggestions)
- ✅ Distribución multiplataforma vía GitHub Actions

**Próximos pasos:** firma de código (macOS Developer ID), auto-updater, sitio web y comunidad.

Consulta el [CHANGELOG](CHANGELOG.md) para el historial detallado y el [devlog](docs/devlog.md) para las decisiones de diseño.

---

## 🤝 Contribuir

Ocote es un proyecto abierto. Si quieres aportar comandos al CKB, traducciones, temas o código, ¡las contribuciones son bienvenidas! Abre un [issue](https://github.com/Teshre/Ocote/issues) para discutir cambios grandes antes de un PR.

---

## ⭐ Historial de estrellas

<a href="https://star-history.com/#Teshre/Ocote&Date">
  <img src="https://api.star-history.com/svg?repos=Teshre/Ocote&type=Date" width="600" alt="Star History Chart">
</a>

---

## 📄 Licencia

[MIT](LICENSE) © 2026 Eduardo Perry Rangel

<div align="center">

---

*Hecho con 🔥 en América Latina.*

</div>
