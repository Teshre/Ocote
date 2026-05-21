// explorer.js — Panel lateral de archivos
//
// Muestra el árbol de archivos del directorio actual.
// Cuando el usuario hace click en una carpeta, ejecuta `cd <ruta>` en la terminal.
//
// FASE 2 — Semanas 17-19

const { invoke } = window.__TAURI__;

const explorerEl = document.getElementById('explorer-panel');
const breadcrumbEl = document.getElementById('breadcrumb');

let currentPath = '~';

// FASE 2: Cargar y mostrar directorio
// async function loadDirectory(path) {
//   const entries = await invoke('list_directory', { path });
//   renderExplorer(entries, path);
//   breadcrumbEl.textContent = path;
// }

// function renderExplorer(entries, basePath) {
//   explorerEl.innerHTML = '';
//
//   // Separar carpetas de archivos, carpetas primero
//   const dirs  = entries.filter(e => e.is_dir);
//   const files = entries.filter(e => !e.is_dir);
//
//   [...dirs, ...files].forEach(entry => {
//     const item = document.createElement('div');
//     item.className = 'explorer-item ' + (entry.is_dir ? 'is-dir' : 'is-file');
//     item.textContent = (entry.is_dir ? '📁 ' : '   ') + entry.name;
//
//     if (entry.is_dir) {
//       item.addEventListener('click', () => {
//         // Ejecutar cd en la terminal PTY
//         invoke('write_to_shell', { input: `cd "${entry.path}"\n` });
//         loadDirectory(entry.path);
//       });
//     }
//
//     explorerEl.appendChild(item);
//   });
// }

// Placeholder visible hasta Fase 2
explorerEl.innerHTML = `
  <div style="padding: 12px 14px; color: #5f5e5a; font-size: 12px; line-height: 1.6;">
    Explorador de archivos<br>
    <span style="font-size: 11px;">(Fase 2)</span>
  </div>
`;
