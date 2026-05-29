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
    const tabNum = nextTabNum++;

    // ── DOM: contenedor del terminal ──────────────────────────────────
    // Se crea VISIBLE (sin 'hidden') para que xterm.js pueda medir su tamaño
    // real. Los contenedores son position:absolute inset:0, así que tienen el
    // tamaño completo del panel. switchTab() oculta los demás al final.
    const container = document.createElement('div');
    container.className = 'terminal-tab-content';
    tabContents.appendChild(container);

    // ── Crear xterm.js y MEDIR el tamaño antes de lanzar el shell ─────
    // Clave anti-fantasma: abrimos el PTY ya al tamaño medido, así zsh/p10k
    // dibujan el prompt una sola vez (sin redibujado por resize inicial).
    const termData = window.createTerminalInstance(container);
    const cols = termData.term.cols || 80;
    const rows = termData.term.rows || 24;

    // ── Crear el shell (PTY) al tamaño correcto + preset de prompt ─────
    // El preset elegido en Settings. Default 'pill' = firma visual de Ocote.
    const promptPreset = localStorage.getItem('ocote_prompt') || 'pill';
    // Accent del tema activo (hex sin #) para que el shell coloree el ❯ en minimal.
    const themeId = localStorage.getItem('ocote_theme') || 'dark';
    const accentHex = window.OCOTE_THEMES?.TOKENS?.[themeId]?.accent?.replace('#', '') ?? 'E8843A';
    const shellId = await invoke('create_shell', { rows, cols, prompt: promptPreset, accent: accentHex });
    container.dataset.shellId = shellId;

    // ── Vincular input/resize ahora que tenemos shell_id ──────────────
    window.bindTerminalShell(termData.term, shellId);

    // ── Nombre del tab: basename del CWD del shell ────────────────────
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
    tabBar.appendChild(tabEl);

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

    // ── Activar nuevo tab (oculta los demás) ──────────────────────────
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
