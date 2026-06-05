// shortcuts.js — Referencia de atajos de teclado (modal)
//
// Todos los atajos que Ocote define, agrupados y con detección de plataforma
// (⌘⌥⇧⌃ en macOS, Ctrl/Alt/Shift en Windows/Linux). 100% estático — no toca
// el backend. Es la "chuleta" para que el usuario descubra y recuerde los atajos.

(function () {
  'use strict';

  const overlay = document.getElementById('shortcuts-overlay');
  const card    = document.getElementById('shortcuts-card');
  if (!overlay || !card) return;

  const isMac = navigator.platform.toUpperCase().includes('MAC') ||
                navigator.userAgent.includes('Mac');

  // Mapa de tokens → etiqueta por plataforma.
  const MAC = { cmd: '⌘', alt: '⌥', shift: '⇧', ctrl: '⌃' };
  const WIN = { cmd: 'Ctrl', alt: 'Alt', shift: 'Shift', ctrl: 'Ctrl' };

  function kbd(tok) {
    const map = isMac ? MAC : WIN;
    return `<kbd class="kbd">${map[tok] || tok}</kbd>`;
  }

  // ── Datos: grupos de atajos (tokens → kbd) ─────────────────────────────────
  const GROUPS = [
    {
      title: 'Pestañas y paneles',
      items: [
        ['Nueva pestaña',                 ['cmd', 'T']],
        ['Cerrar panel o pestaña',        ['cmd', 'W']],
        ['Dividir lado a lado',           ['cmd', 'D']],
        ['Dividir apilado',               ['cmd', 'shift', 'D']],
        ['Ciclar el foco entre paneles',  ['cmd', 'alt', '← →']],
      ],
    },
    {
      title: 'Navegación y búsqueda',
      items: [
        ['Buscar archivo',                ['cmd', 'P']],
        ['Buscar texto en la terminal',   ['cmd', 'F']],
        ['Mostrar / ocultar explorador',  ['ctrl', 'B']],
      ],
    },
    {
      title: 'Terminal',
      items: [
        ['Buscar en el historial (fzf)',  ['ctrl', 'R']],
        ['Saltar a carpeta (fuzzy, fzf)', ['alt', 'C']],
        ['Aceptar sugerencia',            ['→']],
        ['Autocompletar',                 ['Tab']],
        ['Cancelar comando',              ['ctrl', 'C']],
        ['Limpiar pantalla',              ['ctrl', 'L']],
      ],
    },
    {
      title: 'Ayuda',
      items: [
        ['Ver pantalla de bienvenida',    ['ctrl', 'shift', '?']],
        ['Cerrar diálogos y menús',       ['Esc']],
      ],
    },
  ];

  // ── Render ─────────────────────────────────────────────────────────────────
  function render() {
    const groupsHtml = GROUPS.map(g => `
      <div class="sc-group">
        <h3 class="sc-group-title">${g.title}</h3>
        ${g.items.map(([action, keys]) => `
          <div class="sc-row">
            <span class="sc-action">${action}</span>
            <span class="sc-keys">${keys.map(kbd).join('')}</span>
          </div>
        `).join('')}
      </div>
    `).join('');

    const note = isMac
      ? '⌘ Cmd · ⌥ Option · ⇧ Shift · ⌃ Control'
      : 'En Windows/Linux, ⌘ equivale a Ctrl. Los divisores también tienen botones en la barra de pestañas.';

    card.innerHTML = `
      <div class="sc-header">
        <h2>Atajos de teclado</h2>
        <button id="shortcuts-close" aria-label="Cerrar">✕</button>
      </div>
      <div class="sc-grid">${groupsHtml}</div>
      <p class="sc-foot">${note}</p>
    `;
    document.getElementById('shortcuts-close')?.addEventListener('click', close);
  }

  // ── Abrir / cerrar ─────────────────────────────────────────────────────────
  function open() {
    render();
    overlay.classList.remove('hidden');
  }
  function close() {
    overlay.classList.add('hidden');
  }

  // ── Wiring ───────────────────────────────────────────────────────────────
  document.getElementById('shortcuts-btn')?.addEventListener('click', open);
  document.getElementById('shortcuts-backdrop')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
  });

  window.openShortcuts = open;
})();
