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

  // Foco real de la ventana a nivel macOS/OS.
  //
  // Estrategia de tres capas (la primera que dispare gana):
  //
  //   1. window blur/focus (DOM nativo) — WKWebView los dispara cuando la
  //      ventana de macOS cambia de app. Son los más fiables en la práctica.
  //
  //   2. tauri://focus / tauri://blur — eventos del framework Tauri.
  //      Pueden no disparar en dev mode, pero no hacen daño.
  //
  //   3. document.hasFocus() al momento de decidir — chequeado inline en
  //      onCommandFinished como salvavidas final.
  //
  // Se inicializa desde document.hasFocus() para reflejar el estado real
  // al cargar (Ocote puede abrirse ya sin foco si otra app estaba en frente).
  let windowFocused = document.hasFocus();

  // Capa 1: eventos DOM nativos (más fiables en cambios de espacio macOS)
  window.addEventListener('focus', () => { windowFocused = true;  });
  window.addEventListener('blur',  () => { windowFocused = false; });

  // Capa 2: eventos Tauri (backup)
  listen('tauri://focus', () => { windowFocused = true;  });
  listen('tauri://blur',  () => { windowFocused = false; });

  // Capa 3: polling cada 300ms — necesario para AeroSpace y otros tiling WMs
  // que mantienen múltiples ventanas "activas" sin disparar blur/focus DOM.
  // document.hasFocus() sí refleja correctamente el foco del OS en WKWebView.
  setInterval(() => { windowFocused = document.hasFocus(); }, 300);

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
    const themeId = localStorage.getItem('ocote_theme') || 'ocote';
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
      <span class="tab-status" aria-hidden="true"></span>
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

  async function respawnActive() {
    if (!activeShellId) return;
    const oldShellId = activeShellId;
    const oldTab = tabs.get(oldShellId);
    // Limpiar overlays del tab que se va a cerrar
    if (oldTab?.term) window.OCOTE_PROMPT?.clearOverlays?.(oldTab.term);
    if (!oldTab) return;

    let cwd = null;
    try {
      cwd = await invoke('get_shell_cwd', { shellId: oldShellId });
    } catch (_) {}

    const newShellId = await createTab(oldTab.name);
    if (cwd) {
      try {
        await invoke('write_to_shell', { shellId: newShellId, input: `cd ${JSON.stringify(cwd)}\r` });
        updateTabName(newShellId, cwd);
      } catch (_) {}
    }

    await closeTab(oldShellId);
    switchTab(newShellId);
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

    // Limpiar indicador de notificación al activar el tab
    clearTabStatus(shellId);

    // Focus y resize
    tab.term.focus();
    setTimeout(() => tab.fitAddon.fit(), 30);

    // Actualizar el explorador para sincronizar con este shell
    if (window._syncExplorerToActiveShell) {
      window._syncExplorerToActiveShell();
    }
  }

  // ── Indicadores de estado en tabs ─────────────────────────────────────────

  // Aplica un estado visual al dot del tab (sin afectar al tab activo).
  function setTabStatus(shellId, status) {
    const tab = tabs.get(shellId);
    if (!tab) return;
    const dot = tab.element.querySelector('.tab-status');
    if (!dot) return;
    dot.dataset.status = status;

    // Éxito: el dot verde desaparece solo tras 4 segundos
    if (status === 'success') {
      clearTimeout(tab._statusTimer);
      tab._statusTimer = setTimeout(() => clearTabStatus(shellId), 4000);
    }
  }

  // Quita el indicador visual del tab (sin importar el estado actual).
  function clearTabStatus(shellId) {
    const tab = tabs.get(shellId);
    if (!tab) return;
    clearTimeout(tab._statusTimer);
    const dot = tab.element.querySelector('.tab-status');
    if (dot) dot.dataset.status = '';
  }

  // ── Callback desde terminal.js cuando un comando termina ──────────────────
  //
  // Recibe:
  //   shellId     — el shell que terminó el comando
  //   exitCode    — 0 = éxito, ≠ 0 = error
  //   durationSecs — segundos desde OSC 133 A (incluye tiempo de tipeo)
  //
  // Lógica:
  //   1. Si es el tab activo → no hacer nada (el usuario lo vio en vivo)
  //   2. Si es tab de fondo → mostrar dot de estado
  //   3. Si la ventana no tiene foco Y el comando duró lo suficiente
  //      Y las notificaciones están habilitadas → notificación del SO

  function onCommandFinished(shellId, exitCode, durationSecs) {
    const tab = tabs.get(shellId);
    if (!tab) { console.log('[Ocote:notif] skip — tab no encontrado'); return; }

    const isActiveTab     = shellId === activeShellId;
    const appIsBackground = !windowFocused || !document.hasFocus();

    // Si el usuario está en Ocote mirando este mismo tab → nada (lo ve en vivo)
    if (isActiveTab && !appIsBackground) return;

    // Dot en el tab: solo cuando el usuario está en otro tab dentro de Ocote
    if (!isActiveTab) {
      setTabStatus(shellId, exitCode === 0 ? 'success' : 'error');
    }

    // Notificación del sistema: si la app está en segundo plano,
    // sin importar si el comando fue en el tab activo o en uno de fondo
    const enabled   = localStorage.getItem('ocote_system_notifications') !== 'false';
    const threshold = parseInt(localStorage.getItem('ocote_notif_threshold') || '5', 10);

    if (enabled && appIsBackground && durationSecs >= threshold) {
      const tabName = tab.name || 'Terminal';
      const title   = exitCode === 0 ? `✅ Ocote — ${tabName}` : `❌ Ocote — ${tabName}`;
      const body    = exitCode === 0
        ? `El comando terminó correctamente (${durationSecs}s)`
        : `El comando falló con código ${exitCode} (${durationSecs}s)`;

      invoke('send_notification', { title, body }).catch(() => {});
    }
  }

  // ── Botón "+" para nuevo tab ───────────────────────────────────────────

  document.getElementById('tab-new').addEventListener('click', () => {
    createTab();
  });

  // ── Atajos de teclado globales ──────────────────────────────────────────
  // Se capturan en fase capture (true) para tener prioridad sobre el webview.
  // Importante: Ctrl+R es "Reload" en WKWebView/Chrome — debemos prevenirlo
  // para que llegue al shell (fzf Ctrl+R = búsqueda en historial).

  document.addEventListener('keydown', (e) => {
    // Ctrl+T → nueva pestaña
    if (e.ctrlKey && e.key === 't') {
      e.preventDefault();
      createTab();
    }
    // Ctrl+W → cerrar pestaña activa
    if (e.ctrlKey && e.key === 'w') {
      e.preventDefault();
      if (activeShellId) closeTab(activeShellId);
    }
    // Ctrl+R → prevenir recarga del webview; el shell lo recibe como \x12 (fzf)
    if (e.ctrlKey && e.key === 'r') {
      e.preventDefault();
    }
  }, true); // capture:true para interceptar antes que el webview nativo

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

  // ── Recuperación de foco (AeroSpace / tiling WMs / alt+tab) ────────────────
  //
  // Cuando un window manager como AeroSpace mueve o cambia el foco de ventana,
  // WKWebView pierde el foco del DOM → xterm.js deja de capturar el teclado
  // (el terminal "se traba"). Solución: al recuperar el foco de ventana, llamar
  // term.focus() en el tab activo para restaurar la captura de input.
  //
  // También manejamos 'resize' porque AeroSpace redimensiona la ventana al
  // reorganizar el layout — sin esto el PTY quedaría con las dimensiones viejas
  // hasta el próximo fit manual.

  window.addEventListener('focus', () => {
    const tab = tabs.get(activeShellId);
    if (tab?.term) tab.term.focus();
  });

  // Debounce del resize: AeroSpace puede enviar eventos de resize continuamente
  // mientras anima la ventana. Esperamos 150ms al último evento antes de hacer
  // fit, para no saturar el PTY con SIGWINCHs innecesarios.
  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      tabs.forEach(tab => {
        if (tab?.fitAddon) {
          try { tab.fitAddon.fit(); } catch (_) {}
        }
      });
    }, 150);
  });

  // ── Inicializar ─────────────────────────────────────────────────────────
  // Crear tab inicial al cargar (sin nombre → usará basename del CWD)
  createTab();

  // ── Exponer API ─────────────────────────────────────────────────────────
  window.TAB_MANAGER = {
    createTab,
    closeTab,
    respawnActive,
    switchTab,
    updateTabName,
    onCommandFinished,
    getActiveShellId: () => activeShellId,
    getTab: (shellId) => tabs.get(shellId),
    getAllTabs: () => Array.from(tabs.entries()),
  };
})();
