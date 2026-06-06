// searcher.js — Buscador de archivos (Ctrl+P)
//
// Busca archivos por nombre en el directorio actual y subdirectorios.
// Inspirado en el Ctrl+P de VSCode.
//
// Atajos:
//   Ctrl+P      → abrir buscador
//   Esc         → cerrar
//   ↑ / ↓      → navegar resultados
//   Enter       → abrir archivo en preview / navegar a carpeta
//   Cmd+Enter   → pegar ruta en la terminal activa

(function () {
  'use strict';

  const { invoke } = window.__TAURI__;

  // ── Estado ─────────────────────────────────────────────────────────────────
  let overlayEl    = null;
  let inputEl      = null;
  let resultsEl    = null;
  let selectedIdx  = 0;
  let results      = [];
  let searchTimer  = null;

  // ── Abrir / cerrar ────────────────────────────────────────────────────────

  function open() {
    if (overlayEl) { inputEl?.focus(); return; } // ya abierto → re-enfocar

    // Backdrop
    overlayEl = document.createElement('div');
    overlayEl.id = 'fs-overlay';
    overlayEl.addEventListener('mousedown', (e) => {
      if (e.target === overlayEl) close();
    });

    // Modal
    const modal = document.createElement('div');
    modal.id = 'fs-modal';

    // Encabezado con input
    const header = document.createElement('div');
    header.id = 'fs-header';

    // Ícono de lupa
    const lupa = document.createElement('span');
    lupa.id = 'fs-lupa';
    lupa.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" width="15" height="15" viewBox="0 0 24 24"
      fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
      <circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/>
    </svg>`;

    inputEl = document.createElement('input');
    inputEl.id = 'fs-input';
    inputEl.type = 'text';
    inputEl.placeholder = 'Buscar archivo...';
    inputEl.autocomplete = 'off';
    inputEl.spellcheck = false;

    // Hint de atajo
    const hint = document.createElement('span');
    hint.id = 'fs-hint';
    hint.textContent = 'Esc para cerrar';

    header.appendChild(lupa);
    header.appendChild(inputEl);
    header.appendChild(hint);

    // Lista de resultados
    resultsEl = document.createElement('div');
    resultsEl.id = 'fs-results';

    modal.appendChild(header);
    modal.appendChild(resultsEl);
    overlayEl.appendChild(modal);
    document.body.appendChild(overlayEl);

    inputEl.focus();

    // Listeners del input
    inputEl.addEventListener('input', onInput);
    inputEl.addEventListener('keydown', onKeyDown);
  }

  function close() {
    if (!overlayEl) return;
    overlayEl.remove();
    overlayEl = null;
    inputEl   = null;
    resultsEl = null;
    results   = [];
    selectedIdx = 0;
    clearTimeout(searchTimer);

    // Devolver el foco al terminal activo
    const tab = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
    if (tab?.term) tab.term.focus();
  }

  // ── Búsqueda ──────────────────────────────────────────────────────────────

  function onInput() {
    clearTimeout(searchTimer);
    const q = inputEl.value.trim();

    if (!q) {
      results = [];
      selectedIdx = 0;
      renderEmpty();
      return;
    }

    // Debounce 220ms — esperar a que el usuario deje de escribir
    searchTimer = setTimeout(() => doSearch(q), 220);
  }

  async function doSearch(query) {
    const base = window.ocoteCwd || '';
    if (!base) { renderEmpty(); return; }

    try {
      const data = await invoke('search_files', {
        base,
        query,
        shellId: window.ocoteActiveShellId,
      });
      results    = data;
      selectedIdx = 0;
      renderResults();
    } catch (err) {
      console.error('[Searcher]', err);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function renderEmpty() {
    if (!resultsEl) return;
    resultsEl.innerHTML = '';
    resultsEl.classList.remove('fs-has-results');
  }

  function renderResults() {
    if (!resultsEl) return;

    if (results.length === 0) {
      resultsEl.innerHTML = `<div class="fs-no-results">Sin resultados para "<em>${escHtml(inputEl.value)}</em>"</div>`;
      resultsEl.classList.add('fs-has-results');
      return;
    }

    const theme = localStorage.getItem('ocote_icon_theme') || 'seti';
    const IS    = window.ICON_SET;

    resultsEl.innerHTML = results.map((r, i) => {
      const icon = r.is_dir
        ? (IS?.getFolderHtmlForTheme(r.name, theme) || '📁')
        : (IS?.getIconHtmlForTheme(r.name, theme)   || '📄');

      // Resaltar la parte que coincide con la búsqueda
      const highlightedName = highlight(r.name, inputEl.value.trim());

      // Mostrar la carpeta padre para archivos, o "directorio" para carpetas
      const subpath = r.relative_path !== r.name
        ? r.relative_path.replace(/\/[^/]+$/, '') // quitar el nombre final → dir padre
        : '';

      return `<div class="fs-result ${i === selectedIdx ? 'fs-selected' : ''}" data-index="${i}" data-path="${escHtml(r.path)}" data-name="${escHtml(r.name)}" data-is-dir="${r.is_dir}">
        <span class="fs-result-icon explorer-icon">${icon}</span>
        <span class="fs-result-body">
          <span class="fs-result-name">${highlightedName}</span>
          ${subpath ? `<span class="fs-result-subpath">${escHtml(subpath)}</span>` : ''}
        </span>
        ${r.is_dir ? '<span class="fs-result-tag">carpeta</span>' : ''}
      </div>`;
    }).join('');

    resultsEl.classList.add('fs-has-results');

    // Click en resultado
    resultsEl.querySelectorAll('.fs-result').forEach(el => {
      el.addEventListener('mousedown', (e) => {
        e.preventDefault(); // evitar blur del input
        selectedIdx = parseInt(el.dataset.index, 10);
        updateSelection();
        confirmSelection(e.metaKey || e.ctrlKey);
      });
      el.addEventListener('mousemove', () => {
        const idx = parseInt(el.dataset.index, 10);
        if (idx !== selectedIdx) {
          selectedIdx = idx;
          updateSelection();
        }
      });
    });

    scrollSelectedIntoView();
  }

  function updateSelection() {
    if (!resultsEl) return;
    resultsEl.querySelectorAll('.fs-result').forEach((el, i) => {
      el.classList.toggle('fs-selected', i === selectedIdx);
    });
    scrollSelectedIntoView();
  }

  function scrollSelectedIntoView() {
    resultsEl?.querySelector('.fs-selected')?.scrollIntoView({ block: 'nearest' });
  }

  // ── Confirmar selección ────────────────────────────────────────────────────

  // pasteMode = true → pega la ruta en la terminal en lugar de abrir preview
  function confirmSelection(pasteMode = false) {
    const r = results[selectedIdx];
    if (!r) return;
    close();

    if (pasteMode) {
      // Cmd+Enter: pegar la ruta en el terminal activo
      const shellId = window.ocoteActiveShellId;
      if (shellId) {
        invoke('write_to_shell', { shellId, input: r.path }).catch(() => {});
      }
      return;
    }

    if (r.is_dir) {
      // Navegar a la carpeta en el explorador y en el shell
      const shellId = window.ocoteActiveShellId;
      if (shellId) {
        invoke('write_to_shell', { shellId, input: `\x15cd "${r.path}"\r` }).catch(() => {});
      }
    } else {
      // Abrir en el preview de archivos
      if (window.openPreview) {
        window.openPreview(r.path, r.name);
      }
    }
  }

  // ── Navegación con teclado ─────────────────────────────────────────────────

  function onKeyDown(e) {
    switch (e.key) {
      case 'Escape':
        e.preventDefault();
        close();
        break;

      case 'ArrowDown':
        e.preventDefault();
        if (results.length > 0) {
          selectedIdx = Math.min(results.length - 1, selectedIdx + 1);
          updateSelection();
        }
        break;

      case 'ArrowUp':
        e.preventDefault();
        if (results.length > 0) {
          selectedIdx = Math.max(0, selectedIdx - 1);
          updateSelection();
        }
        break;

      case 'Enter':
        e.preventDefault();
        confirmSelection(e.metaKey || e.ctrlKey);
        break;
    }
  }

  // ── Helpers ────────────────────────────────────────────────────────────────

  // Escapa HTML para seguridad
  function escHtml(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // Resalta los caracteres que coinciden con la búsqueda (case-insensitive)
  function highlight(name, query) {
    if (!query) return escHtml(name);
    const lname = name.toLowerCase();
    const lquery = query.toLowerCase();
    const idx = lname.indexOf(lquery);
    if (idx === -1) return escHtml(name);
    return (
      escHtml(name.slice(0, idx)) +
      `<mark class="fs-match">${escHtml(name.slice(idx, idx + query.length))}</mark>` +
      escHtml(name.slice(idx + query.length))
    );
  }

  // Nota: el botón visual de búsqueda vive en la barra del explorador
  // (explorer.js lo renderiza y llama a window.openFileSearcher).

  // ── Atajo de teclado global: Ctrl+P ───────────────────────────────────────
  // capture: true para interceptar ANTES que xterm.js reciba la tecla.
  // Ctrl+P en readline = "ir al comando anterior" (como ↑), pero es un
  // tradeoff razonable para una feature muy utilizada.
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'p' && !e.shiftKey && !e.altKey) {
      e.preventDefault();
      e.stopPropagation();
      open();
    }
  }, true); // capture phase

  // ── API pública ────────────────────────────────────────────────────────────
  window.openFileSearcher  = open;
  window.closeFileSearcher = close;

})();
