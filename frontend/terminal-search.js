// terminal-search.js — Búsqueda de texto dentro del output del terminal (Ctrl+F)
//
// Usa el SearchAddon oficial de xterm.js para resaltar coincidencias directamente
// en el canvas del terminal. No interfiere con el PTY ni con el scrollback.
//
// Atajos:
//   Ctrl+F        → abrir barra de búsqueda
//   Enter         → siguiente coincidencia
//   Shift+Enter   → coincidencia anterior
//   Esc           → cerrar barra y devolver foco al terminal

(function () {
  'use strict';

  // ── Elementos DOM ─────────────────────────────────────────────────────────
  const bar     = document.getElementById('terminal-search-bar');
  const input   = document.getElementById('tsb-input');
  const countEl = document.getElementById('tsb-count');
  const btnPrev = document.getElementById('tsb-prev');
  const btnNext = document.getElementById('tsb-next');
  const btnClose= document.getElementById('tsb-close');

  if (!bar || !input) return; // guard: HTML no cargado aún

  // ── Opciones de búsqueda para el SearchAddon ───────────────────────────────
  const SEARCH_OPTS = {
    caseSensitive: false,
    wholeWord:     false,
    regex:         false,
    incremental:   true,   // resaltar mientras se escribe
    decorations: {
      // Colores sobrescritos por .xterm-find-result-decoration en theme.css,
      // pero el addon necesita valores no vacíos para activar las decoraciones.
      matchBackground:              'rgba(232,132,58,0.25)',
      matchBorder:                  'rgba(232,132,58,0.5)',
      matchOverviewRuler:           '#E8843A',
      activeMatchBackground:        'rgba(232,132,58,0.45)',
      activeMatchBorder:            '#E8843A',
      activeMatchColorOverviewRuler:'#E8843A',
    },
  };

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Obtiene el searchAddon del tab activo
  function getSearchAddon() {
    const tab = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
    return tab?.searchAddon ?? null;
  }

  // ── Abrir / cerrar ─────────────────────────────────────────────────────────

  // Botón visual en la barra de tabs — se resalta cuando la barra está abierta
  const toggleBtn = document.getElementById('terminal-search-btn');

  function open() {
    bar.classList.remove('hidden');
    toggleBtn?.classList.add('active');
    input.focus();
    input.select();
    // Si ya hay texto en el input, buscar de inmediato
    if (input.value.trim()) {
      findNext(true);
    }
  }

  function close() {
    bar.classList.add('hidden');
    toggleBtn?.classList.remove('active');
    countEl.textContent = '';

    // Limpiar los highlights del terminal
    const sa = getSearchAddon();
    if (sa) {
      try { sa.clearDecorations?.(); } catch (_) {}
      // findNext con string vacío limpia highlights en algunas versiones
      try { sa.findNext('', SEARCH_OPTS); } catch (_) {}
    }

    // Devolver foco al terminal activo
    const tab = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
    if (tab?.term) tab.term.focus();
  }

  function isOpen() {
    return !bar.classList.contains('hidden');
  }

  // ── Búsqueda ───────────────────────────────────────────────────────────────

  let searchTimer = null;

  function onInput() {
    clearTimeout(searchTimer);
    const q = input.value;
    if (!q) { countEl.textContent = ''; return; }
    // Pequeño debounce mientras se escribe rápido
    searchTimer = setTimeout(() => findNext(true), 80);
  }

  // forward = true → siguiente, false → anterior
  function findNext(incrementalOrForward = true) {
    const q  = input.value.trim();
    const sa = getSearchAddon();
    if (!sa || !q) { countEl.textContent = ''; return; }

    const found = sa.findNext(q, SEARCH_OPTS);
    updateCount(found);
  }

  function findPrev() {
    const q  = input.value.trim();
    const sa = getSearchAddon();
    if (!sa || !q) { countEl.textContent = ''; return; }

    const found = sa.findPrevious(q, SEARCH_OPTS);
    updateCount(found);
  }

  function updateCount(found) {
    // El SearchAddon no expone el número total de coincidencias en la v0.16,
    // así que solo mostramos si encontró o no.
    countEl.textContent = found ? '' : '0 resultados';
    countEl.style.color = found
      ? 'var(--text-dim)'
      : 'var(--syntax-red, #E8635A)';
  }

  // ── Listeners del input ────────────────────────────────────────────────────

  input.addEventListener('input', onInput);

  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
    } else if (e.key === 'Enter') {
      e.preventDefault();
      if (e.shiftKey) {
        findPrev();
      } else {
        findNext();
      }
    }
  });

  // Prevenir que las teclas del input lleguen al terminal
  input.addEventListener('keydown', (e) => e.stopPropagation());

  // ── Botones ────────────────────────────────────────────────────────────────

  btnPrev?.addEventListener('click', findPrev);
  btnNext?.addEventListener('click', () => findNext());
  btnClose?.addEventListener('click', close);

  // ── Botón visual en la barra de tabs (toggle) ─────────────────────────────
  toggleBtn?.addEventListener('click', () => {
    isOpen() ? close() : open();
  });

  // ── Atajo global: Ctrl+F ──────────────────────────────────────────────────
  // capture: true — se intercepta antes de que xterm.js procese la tecla.
  // Ctrl+F en readline = "avanzar un carácter" (como →), tradeoff aceptable
  // para una feature estándar en todos los entornos modernos.

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'f' && !e.shiftKey && !e.altKey) {
      // No capturar si el foco está en el input del file-searcher (Ctrl+P)
      if (document.activeElement?.id === 'fs-input') return;

      e.preventDefault();
      e.stopPropagation();
      isOpen() ? findNext() : open();
    }
  }, true); // capture phase

  // ── API pública ────────────────────────────────────────────────────────────
  window.terminalSearchOpen  = open;
  window.terminalSearchClose = close;

})();
