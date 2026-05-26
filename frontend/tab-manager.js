// tab-manager.js — Barra de tabs de terminal + gestión de sesiones PTY
// Cada tab es una terminal independiente con su propio proceso shell.

(function () {
  'use strict';

  const { invoke } = window.__TAURI__;
  const { listen } = window.__TAURI__.event;

  // ── Estado ──────────────────────────────────────────────────────────────
  const tabs = new Map();        // shell_id → tab data
  let activeShellId = null;
  let nextTabNum = 1;

  // ── Referencias DOM ─────────────────────────────────────────────────────
  const tabBar      = document.getElementById('tab-bar');
  const tabContents = document.getElementById('terminal-container');

  // ── Crear tab ───────────────────────────────────────────────────────────

  async function createTab(name) {
    const shellId = await invoke('create_shell');
    const tabNum  = nextTabNum++;

    // Si no hay nombre explícito, leer el CWD del shell recién creado
    // y usar el basename como nombre del tab
    let displayName = name;
    if (!displayName) {
      try {
        const cwd = await invoke('get_shell_cwd', { shellId });
        displayName = getBasename(cwd);
      } catch {
        displayName = `zsh ${tabNum}`;
      }
    }

    // ── DOM: tab en la barra ──────────────────────────────────────────
    const tabEl = document.createElement('div');
    tabEl.className = 'terminal-tab';
    tabEl.dataset.shellId = shellId;
    tabEl.innerHTML = `
      <span class="tab-name">${escapeHtml(displayName)}</span>
      <button class="tab-close" title="Cerrar">×</button>
    `;

    // ── DOM: contenedor del terminal ──────────────────────────────────
    const container = document.createElement('div');
    container.className = 'terminal-tab-content hidden';
    container.dataset.shellId = shellId;

    tabBar.appendChild(tabEl);
    tabContents.appendChild(container);

    // ── Crear xterm.js ────────────────────────────────────────────────
    const termData = window.createTerminalInstance(shellId, container);

    // ── Guardar datos del tab ─────────────────────────────────────────
    tabs.set(shellId, {
      element:   tabEl,
      container: container,
      term:      termData.term,
      fitAddon:  termData.fitAddon,
      name:      displayName,
    });

    // ── Event listeners del tab ─────────────────────────────────────
    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) {
        switchTab(shellId);
      }
    });

    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(shellId);
    });

    // ── Activar nuevo tab ────────────────────────────────────────────
    switchTab(shellId);

    return shellId;
  }

  // ── Cerrar tab ──────────────────────────────────────────────────────────

  async function closeTab(shellId) {
    const tab = tabs.get(shellId);
    if (!tab) return;

    // Limpiar DOM
    tab.element.remove();
    tab.container.remove();
    tab.term.dispose();

    // Notificar al backend
    try {
      await invoke('close_shell', { shellId });
    } catch (err) {
      console.error('[TabManager] Error cerrando shell:', err);
    }

    tabs.delete(shellId);

    // Si cerramos el tab activo, cambiar a otro
    if (activeShellId === shellId) {
      const remaining = Array.from(tabs.keys());
      if (remaining.length > 0) {
        switchTab(remaining[remaining.length - 1]);
      } else {
        activeShellId = null;
        window.ocoteActiveShellId = null;
        // Sin tabs: crear uno nuevo automáticamente
        createTab();
      }
    }
  }

  // ── Cambiar tab activo ────────────────────────────────────────────────

  function switchTab(shellId) {
    if (activeShellId === shellId) return;

    // Desactivar anterior
    if (activeShellId) {
      const prev = tabs.get(activeShellId);
      if (prev) {
        prev.element.classList.remove('active');
        prev.container.classList.add('hidden');
      }
    }

    // Activar nuevo
    const tab = tabs.get(shellId);
    if (!tab) return;

    tab.element.classList.add('active');
    tab.container.classList.remove('hidden');
    activeShellId = shellId;
    window.ocoteActiveShellId = shellId;

    // Focus y resize
    tab.term.focus();
    setTimeout(() => tab.fitAddon.fit(), 30);

    // Actualizar el explorador para sincronizar con este shell
    if (window._syncExplorerToActiveShell) {
      window._syncExplorerToActiveShell();
    }
  }

  // ── Botón "+" para nuevo tab ───────────────────────────────────────────

  document.getElementById('tab-new').addEventListener('click', () => {
    createTab();
  });

  // ── Atajo de teclado: Ctrl+T → nuevo tab ──────────────────────────────

  document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      createTab();
    }
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (activeShellId) closeTab(activeShellId);
    }
  });

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getBasename(path) {
    if (!path || path === '/') return '/';
    const clean = path.replace(/\/$/, '');
    const idx = clean.lastIndexOf('/');
    return idx >= 0 ? clean.substring(idx + 1) : clean;
  }

  function updateTabName(shellId, path) {
    const tab = tabs.get(shellId);
    if (!tab) return;
    const name = getBasename(path);
    tab.name = name;
    const nameEl = tab.element.querySelector('.tab-name');
    if (nameEl) nameEl.textContent = name;
  }

  // ── Inicializar ─────────────────────────────────────────────────────────
  // Crear tab inicial al cargar (sin nombre → usará basename del CWD)
  createTab();

  // ── Exponer API ─────────────────────────────────────────────────────────
  window.TAB_MANAGER = {
    createTab,
    closeTab,
    switchTab,
    updateTabName,
    getActiveShellId: () => activeShellId,
    getTab: (shellId) => tabs.get(shellId),
    getAllTabs: () => Array.from(tabs.entries()),
  };
})();
