// tab-manager.js — Tabs + split panes (paneles divididos recursivos)
//
// Modelo de datos:
//   - panes: Map<shellId, paneData>  — registro PLANO de todos los terminales.
//       Preserva compatibilidad: getTab(shellId) y getAllTabs() operan aquí,
//       y window.ocoteActiveShellId siempre apunta al pane enfocado.
//   - tabs:  Map<tabId, tabData>     — cada tab tiene un ÁRBOL de layout.
//
// Árbol de layout (split binario recursivo, estilo iTerm/tmux):
//   - hoja:  { kind:'leaf', shellId }
//   - split: { kind:'split', dir:'row'|'col', a:nodo, b:nodo, ratio:0..1 }
//
// El DOM de cada pane (su xterm) vive en paneData.el y se MUEVE entre posiciones
// del árbol al re-renderizar (appendChild mueve, no clona → el canvas sobrevive).

(function () {
  'use strict';

  const { invoke } = window.__TAURI__;
  const { listen } = window.__TAURI__.event;

  // ── Estado ──────────────────────────────────────────────────────────────
  const panes = new Map();   // shellId → { shellId, term, fitAddon, searchAddon, el, tabId, name }
  const tabs  = new Map();   // tabId   → { tabId, element, container, root, activePaneShellId, name }
  let activeTabId   = null;
  let activeShellId = null;
  let nextTabId     = 1;

  // ── Espacios (workspaces conmutables) ──────────────────────────────────────
  // Cada tab pertenece a un "espacio". El espacio 'default' siempre existe; los
  // workspaces activados crean espacios 'ws:<nombre>'. Solo se muestran las tabs
  // del espacio activo. Mientras solo exista 'default' (toggle de workspaces
  // apagado), el comportamiento es idéntico al de tabs normales.
  let activeSpaceId = 'default';
  let onSpacesChanged = null;   // callback: la barra se re-renderiza (cambió espacio/lista)
  let onLayoutChanged = null;   // callback: auto-guardado (cambió estructura/cwd del espacio)

  function fireLayoutChanged() { if (onLayoutChanged) onLayoutChanged(); }

  // ── Foco real de la ventana (para notificaciones — ver onCommandFinished) ──
  let windowFocused = document.hasFocus();
  window.addEventListener('focus', () => { windowFocused = true;  });
  window.addEventListener('blur',  () => { windowFocused = false; });
  listen('tauri://focus', () => { windowFocused = true;  });
  listen('tauri://blur',  () => { windowFocused = false; });
  setInterval(() => { windowFocused = document.hasFocus(); }, 300);

  // ── Referencias DOM ─────────────────────────────────────────────────────
  const tabBar      = document.getElementById('tab-bar');
  const tabContents = document.getElementById('terminal-container');

  // ── Helpers del árbol ─────────────────────────────────────────────────────

  // Devuelve los shellIds de todas las hojas bajo un nodo.
  function leavesOf(node, acc = []) {
    if (!node) return acc;
    if (node.kind === 'leaf') acc.push(node.shellId);
    else { leavesOf(node.a, acc); leavesOf(node.b, acc); }
    return acc;
  }

  // Quita una hoja del árbol; su hermano ocupa el lugar del split padre.
  // Devuelve el nuevo subárbol (o null si el nodo era la hoja buscada).
  function removeLeaf(node, shellId) {
    if (node.kind === 'leaf') return node.shellId === shellId ? null : node;
    const a = removeLeaf(node.a, shellId);
    if (a === null) return node.b;   // a era la hoja → el hermano b sube
    const b = removeLeaf(node.b, shellId);
    if (b === null) return a;        // b era la hoja → a sube
    node.a = a; node.b = b;
    return node;
  }

  // Reemplaza una hoja por un nodo nuevo (usado al dividir un pane).
  function replaceLeaf(node, shellId, newNode) {
    if (node.kind === 'leaf') return node.shellId === shellId ? newNode : node;
    node.a = replaceLeaf(node.a, shellId, newNode);
    node.b = replaceLeaf(node.b, shellId, newNode);
    return node;
  }

  // ── Render del árbol a DOM ────────────────────────────────────────────────

  function renderNode(node) {
    if (node.kind === 'leaf') {
      const pane = panes.get(node.shellId);
      pane.el.style.flex = '1 1 0';
      return pane.el;
    }
    // split
    const splitEl = document.createElement('div');
    splitEl.className = 'pane-split';
    splitEl.dataset.dir = node.dir;

    const aEl = renderNode(node.a);
    const bEl = renderNode(node.b);
    aEl.style.flex = `${node.ratio} 1 0`;
    bEl.style.flex = `${1 - node.ratio} 1 0`;

    const resizer = document.createElement('div');
    resizer.className = 'pane-resizer';
    attachResizer(resizer, node, aEl, bEl);

    splitEl.append(aEl, resizer, bEl);
    return splitEl;
  }

  function renderTab(tab) {
    // replaceChildren mueve los pane.el existentes a su nueva posición
    // (preservando el xterm) y descarta los split-div viejos.
    tab.container.replaceChildren(renderNode(tab.root));
    requestAnimationFrame(() => {
      fitTab(tab);
      updateActivePaneClass(tab);
    });
  }

  function updateActivePaneClass(tab) {
    leavesOf(tab.root).forEach(sid => {
      const p = panes.get(sid);
      if (p) p.el.classList.toggle('pane-active', sid === tab.activePaneShellId);
    });
  }

  function fitTab(tab) {
    leavesOf(tab.root).forEach(sid => {
      const p = panes.get(sid);
      if (p?.fitAddon) { try { p.fitAddon.fit(); } catch (_) {} }
    });
  }

  // ── Resizer de paneles (arrastre del divisor) ─────────────────────────────

  function attachResizer(resizer, node, aEl, bEl) {
    resizer.addEventListener('mousedown', (e) => {
      e.preventDefault();
      const splitEl = resizer.parentElement;
      const rect = splitEl.getBoundingClientRect();
      const dir = node.dir;

      // Overlay para capturar el mouse aunque pase sobre el canvas de xterm
      const overlay = document.createElement('div');
      overlay.className = 'pane-drag-overlay';
      overlay.style.cursor = dir === 'row' ? 'col-resize' : 'row-resize';
      document.body.appendChild(overlay);
      resizer.classList.add('dragging');

      function move(ev) {
        let ratio = dir === 'row'
          ? (ev.clientX - rect.left) / rect.width
          : (ev.clientY - rect.top)  / rect.height;
        ratio = Math.max(0.1, Math.min(0.9, ratio));
        node.ratio = ratio;
        aEl.style.flex = `${ratio} 1 0`;
        bEl.style.flex = `${1 - ratio} 1 0`;
      }
      function up() {
        document.removeEventListener('mousemove', move);
        document.removeEventListener('mouseup', up);
        overlay.remove();
        resizer.classList.remove('dragging');
        const tab = tabs.get(activeTabId);
        if (tab) fitTab(tab);
      }
      document.addEventListener('mousemove', move);
      document.addEventListener('mouseup', up);
    });
  }

  // ── Crear un pane (xterm + PTY) ───────────────────────────────────────────

  async function createPane(tabId) {
    const tab = tabs.get(tabId);
    const paneEl = document.createElement('div');
    paneEl.className = 'terminal-pane';
    // Se añade al container (visible) ANTES de crear xterm para que mida bien.
    tab.container.appendChild(paneEl);

    const termData = window.createTerminalInstance(paneEl);
    const cols = termData.term.cols || 80;
    const rows = termData.term.rows || 24;

    const promptPreset = localStorage.getItem('ocote_prompt') || 'pill';
    const themeId   = localStorage.getItem('ocote_theme') || 'ocote';
    const accentHex = window.OCOTE_THEMES?.TOKENS?.[themeId]?.accent?.replace('#', '') ?? 'E8843A';
    const shellId = await invoke('create_shell', { rows, cols, prompt: promptPreset, accent: accentHex });
    paneEl.dataset.shellId = shellId;

    window.bindTerminalShell(termData.term, shellId);

    let nm;
    try { nm = getBasename(await invoke('get_shell_cwd', { shellId })); }
    catch { nm = 'zsh'; }

    panes.set(shellId, {
      shellId,
      term:        termData.term,
      fitAddon:    termData.fitAddon,
      searchAddon: termData.searchAddon,
      el:          paneEl,
      tabId,
      name:        nm,
    });

    // Click en el pane → enfocarlo
    paneEl.addEventListener('mousedown', () => setActivePane(shellId));

    return shellId;
  }

  // ── Crear tab ───────────────────────────────────────────────────────────

  // Scaffold común: crea el contenedor DOM + botón de tab + objeto tab + listeners.
  // Lo usan createTab (un pane) y createTabFromLayout (árbol restaurado).
  function scaffoldTab(name) {
    const tabId = nextTabId++;

    const container = document.createElement('div');
    container.className = 'terminal-tab-content';
    tabContents.appendChild(container);

    const tabEl = document.createElement('div');
    tabEl.className = 'terminal-tab';
    tabEl.dataset.tabId = tabId;
    tabEl.innerHTML = `
      <span class="tab-status" aria-hidden="true"></span>
      <span class="tab-name"></span>
      <span class="tab-count"></span>
      <button class="tab-close" title="Cerrar">×</button>
    `;
    tabBar.appendChild(tabEl);

    const tab = { tabId, element: tabEl, container, root: null, activePaneShellId: null,
                  name: name || '', spaceId: activeSpaceId };
    tabs.set(tabId, tab);

    tabEl.addEventListener('click', (e) => {
      if (!e.target.classList.contains('tab-close')) switchToTab(tabId);
    });
    tabEl.querySelector('.tab-close').addEventListener('click', (e) => {
      e.stopPropagation();
      closeTab(tabId);
    });

    return tab;
  }

  async function createTab(name) {
    const tab = scaffoldTab(name);

    const shellId = await createPane(tab.tabId);
    tab.root = { kind: 'leaf', shellId };
    tab.activePaneShellId = shellId;
    if (!tab.name) tab.name = panes.get(shellId).name;
    renderTabLabel(tab);

    renderTab(tab);
    switchToTab(tab.tabId);
    fireLayoutChanged();
    return shellId;
  }

  // ── Restaurar un tab desde un layout guardado (workspace) ──────────────────

  // Reconstruye el árbol guardado creando un pane (shell) por cada hoja y
  // haciendo cd a su cwd. Los splits conservan dir y ratio.
  async function materializeNode(tabId, sn) {
    if (!sn || sn.kind === 'leaf') {
      const shellId = await createPane(tabId);
      const cwd = sn && sn.cwd;
      if (cwd) {
        try {
          await invoke('write_to_shell', { shellId, input: `cd ${JSON.stringify(cwd)}\r` });
        } catch (_) {}
      }
      return { kind: 'leaf', shellId };
    }
    return {
      kind: 'split',
      dir:  sn.dir === 'col' ? 'col' : 'row',
      ratio: typeof sn.ratio === 'number' ? sn.ratio : 0.5,
      a: await materializeNode(tabId, sn.a),
      b: await materializeNode(tabId, sn.b),
    };
  }

  async function createTabFromLayout(spec) {
    const tab = scaffoldTab(spec && spec.name);
    tab.root = await materializeNode(tab.tabId, spec && spec.tree);
    const leaves = leavesOf(tab.root);
    tab.activePaneShellId = leaves[0];
    if (!tab.name) tab.name = panes.get(leaves[0])?.name || 'zsh';
    renderTabLabel(tab);
    renderTab(tab);
    switchToTab(tab.tabId);
    return tab.tabId;
  }

  // ── Dividir el pane activo ────────────────────────────────────────────────

  async function splitActivePane(dir) {
    if (activeShellId == null || activeTabId == null) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;

    const old = tab.activePaneShellId;
    const newShell = await createPane(tab.tabId);

    tab.root = replaceLeaf(tab.root, old, {
      kind: 'split', dir,
      a: { kind: 'leaf', shellId: old },
      b: { kind: 'leaf', shellId: newShell },
      ratio: 0.5,
    });

    renderTab(tab);
    renderTabLabel(tab);
    setActivePane(newShell);
    fireLayoutChanged();
  }

  // ── Cerrar pane (colapsa el árbol; si era el último, cierra el tab) ────────

  async function closePane(shellId) {
    const pane = panes.get(shellId);
    if (!pane) return;
    const tab = tabs.get(pane.tabId);
    if (!tab) return;

    if (leavesOf(tab.root).length <= 1) { closeTab(tab.tabId); return; }

    try { pane.term.dispose(); } catch (_) {}
    try { await invoke('close_shell', { shellId }); } catch (_) {}
    pane.el.remove();
    panes.delete(shellId);

    tab.root = removeLeaf(tab.root, shellId);
    const remain = leavesOf(tab.root);
    tab.activePaneShellId = remain[0];

    renderTab(tab);
    renderTabLabel(tab);
    if (tab.tabId === activeTabId) setActivePane(remain[0]);
    fireLayoutChanged();
  }

  // ── Cerrar tab (cierra todos sus panes) ───────────────────────────────────

  async function closeTab(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) return;

    for (const sid of leavesOf(tab.root)) {
      const p = panes.get(sid);
      if (p) {
        try { p.term.dispose(); } catch (_) {}
        try { await invoke('close_shell', { shellId: sid }); } catch (_) {}
        panes.delete(sid);
      }
    }
    tab.element.remove();
    tab.container.remove();
    tabs.delete(tabId);

    if (activeTabId === tabId) {
      activeTabId = null;
      activeShellId = null;
      window.ocoteActiveShellId = null;
      // Buscar otra tab DEL MISMO espacio; si no hay, crear una nueva en él.
      const sameSpace = Array.from(tabs.values()).filter(t => t.spaceId === activeSpaceId);
      if (sameSpace.length > 0) switchToTab(sameSpace[sameSpace.length - 1].tabId);
      else createTab();
    }
    if (onSpacesChanged) onSpacesChanged();
    fireLayoutChanged();
  }

  // ── Respawn del pane activo (settings: cambio de preset de prompt) ─────────

  async function respawnActive() {
    if (activeShellId == null || activeTabId == null) return;
    const tab = tabs.get(activeTabId);
    if (!tab) return;

    const old = tab.activePaneShellId;
    const oldPane = panes.get(old);
    if (oldPane?.term) window.OCOTE_PROMPT?.clearOverlays?.(oldPane.term);

    let cwd = null;
    try { cwd = await invoke('get_shell_cwd', { shellId: old }); } catch (_) {}

    const newShell = await createPane(tab.tabId);
    tab.root = replaceLeaf(tab.root, old, { kind: 'leaf', shellId: newShell });
    renderTab(tab);

    if (cwd) {
      try { await invoke('write_to_shell', { shellId: newShell, input: `cd ${JSON.stringify(cwd)}\r` }); } catch (_) {}
      updateTabName(newShell, cwd);
    }

    try { oldPane.term.dispose(); } catch (_) {}
    try { await invoke('close_shell', { shellId: old }); } catch (_) {}
    oldPane.el.remove();
    panes.delete(old);

    setActivePane(newShell);
    renderTabLabel(tab);
  }

  // ── Cambiar de tab ────────────────────────────────────────────────────────

  function switchToTab(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) return;

    if (activeTabId !== null && activeTabId !== tabId) {
      const prev = tabs.get(activeTabId);
      if (prev) {
        prev.element.classList.remove('active');
        prev.container.classList.add('hidden');
      }
    }

    tab.element.classList.add('active');
    tab.container.classList.remove('hidden');
    activeTabId = tabId;

    setActivePane(tab.activePaneShellId);
    clearTabStatus(tabId);
    requestAnimationFrame(() => fitTab(tab));
    fireLayoutChanged();
  }

  // ── Espacios (workspaces conmutables) ──────────────────────────────────────

  // Muestra solo las tabs del espacio activo (oculta botón + contenedor del resto).
  function refreshSpaceVisibility() {
    tabs.forEach(tab => {
      const inSpace = tab.spaceId === activeSpaceId;
      tab.element.style.display = inSpace ? '' : 'none';
      if (!inSpace) tab.container.classList.add('hidden');
    });
  }

  function tabsInSpace(spaceId) {
    return Array.from(tabs.values()).filter(t => t.spaceId === spaceId);
  }

  function spaceIsLive(spaceId) {
    return tabsInSpace(spaceId).length > 0;
  }

  // Cambia al espacio dado (debe estar vivo, o ser 'default'). Si está vacío,
  // crea una tab nueva en él.
  async function switchToSpace(spaceId) {
    if (spaceId === activeSpaceId) return;
    activeSpaceId = spaceId;
    activeTabId = null;            // forzar re-activación de tab en el nuevo espacio
    refreshSpaceVisibility();

    const here = tabsInSpace(spaceId);
    if (here.length === 0) {
      await createTab();            // createTab usa activeSpaceId → tab en este espacio
    } else {
      switchToTab(here[0].tabId);
    }
    if (onSpacesChanged) onSpacesChanged();
  }

  // Activa un workspace: si su espacio ya está vivo, conmuta; si no, lo
  // materializa creando sus tabs desde el layout guardado.
  async function openWorkspaceSpace(name, tabsLayout) {
    const spaceId = 'ws:' + name;
    if (spaceIsLive(spaceId)) { await switchToSpace(spaceId); return; }

    // Materializar: las tabs nuevas se etiquetan con este espacio.
    activeSpaceId = spaceId;
    activeTabId = null;
    refreshSpaceVisibility();       // oculta las del espacio anterior
    for (const t of (tabsLayout || [])) {
      await createTabFromLayout(t);
    }
    if (!tabsInSpace(spaceId).length) await createTab(); // workspace vacío → 1 tab
    if (onSpacesChanged) onSpacesChanged();
  }

  // ── Enfocar un pane ────────────────────────────────────────────────────────

  function setActivePane(shellId) {
    const pane = panes.get(shellId);
    if (!pane) return;
    const tab = tabs.get(pane.tabId);
    if (!tab) return;

    tab.activePaneShellId = shellId;
    if (pane.tabId === activeTabId) {
      activeShellId = shellId;
      window.ocoteActiveShellId = shellId;
    }

    updateActivePaneClass(tab);
    pane.term.focus();
    if (window._syncExplorerToActiveShell) window._syncExplorerToActiveShell();
  }

  // ── Ciclar foco entre panes del tab activo ────────────────────────────────

  function cyclePane(dir) {
    const tab = tabs.get(activeTabId);
    if (!tab) return;
    const leaves = leavesOf(tab.root);
    if (leaves.length < 2) return;
    let i = leaves.indexOf(activeShellId);
    i = (i + dir + leaves.length) % leaves.length;
    setActivePane(leaves[i]);
  }

  // ── Etiqueta del tab (nombre + contador de panes) ─────────────────────────

  function renderTabLabel(tab) {
    const nameEl  = tab.element.querySelector('.tab-name');
    const countEl = tab.element.querySelector('.tab-count');
    if (nameEl) nameEl.textContent = tab.name || 'zsh';
    if (countEl) {
      const n = leavesOf(tab.root).length;
      countEl.textContent = n > 1 ? String(n) : '';
      countEl.style.display = n > 1 ? '' : 'none';
    }
  }

  // ── Indicadores de estado en tabs (dot de notificación) ───────────────────

  function setTabStatus(tabId, status) {
    const tab = tabs.get(tabId);
    if (!tab) return;
    const dot = tab.element.querySelector('.tab-status');
    if (!dot) return;
    dot.dataset.status = status;
    if (status === 'success') {
      clearTimeout(tab._statusTimer);
      tab._statusTimer = setTimeout(() => clearTabStatus(tabId), 4000);
    }
  }

  function clearTabStatus(tabId) {
    const tab = tabs.get(tabId);
    if (!tab) return;
    clearTimeout(tab._statusTimer);
    const dot = tab.element.querySelector('.tab-status');
    if (dot) dot.dataset.status = '';
  }

  // ── Callback desde terminal.js cuando un comando termina ──────────────────

  function onCommandFinished(shellId, exitCode, durationSecs) {
    const pane = panes.get(shellId);
    if (!pane) return;
    const tab = tabs.get(pane.tabId);
    if (!tab) return;

    const isFocused       = shellId === activeShellId && tab.tabId === activeTabId;
    const appIsBackground = !windowFocused || !document.hasFocus();

    // El usuario está mirando este pane en vivo → nada
    if (isFocused && !appIsBackground) return;

    // Dot en el tab si el comando ocurrió en un tab que no es el activo
    if (tab.tabId !== activeTabId) {
      setTabStatus(tab.tabId, exitCode === 0 ? 'success' : 'error');
    }

    // Notificación del sistema si la app está en segundo plano
    const enabled   = localStorage.getItem('ocote_system_notifications') !== 'false';
    const threshold = parseInt(localStorage.getItem('ocote_notif_threshold') || '5', 10);
    if (enabled && appIsBackground && durationSecs >= threshold) {
      const nm    = pane.name || tab.name || 'Terminal';
      const title = exitCode === 0 ? `✅ Ocote — ${nm}` : `❌ Ocote — ${nm}`;
      const body  = exitCode === 0
        ? `El comando terminó correctamente (${durationSecs}s)`
        : `El comando falló con código ${exitCode} (${durationSecs}s)`;
      invoke('send_notification', { title, body }).catch(() => {});
    }
  }

  // ── Botones de la barra de tabs ───────────────────────────────────────────

  document.getElementById('tab-new')?.addEventListener('click', () => createTab());
  document.getElementById('split-row-btn')?.addEventListener('click', () => splitActivePane('row'));
  document.getElementById('split-col-btn')?.addEventListener('click', () => splitActivePane('col'));

  // ── Atajos de teclado globales ──────────────────────────────────────────
  // capture:true para tener prioridad sobre el webview.
  // NOTA: split usa SOLO la tecla Cmd (metaKey) en macOS — nunca Ctrl, porque
  // Ctrl+D = EOF en el shell. En Linux/Windows se usan los botones visibles.

  document.addEventListener('keydown', (e) => {
    // Ctrl/Cmd+T → nueva pestaña
    if ((e.ctrlKey || e.metaKey) && e.key === 't') { e.preventDefault(); createTab(); return; }
    // Ctrl/Cmd+W → cerrar pane activo (si es el último del tab, cierra el tab)
    if ((e.ctrlKey || e.metaKey) && e.key === 'w') { e.preventDefault(); if (activeShellId != null) closePane(activeShellId); return; }
    // Cmd+D → dividir lado a lado (row); Cmd+Shift+D → dividir apilado (col)
    if (e.metaKey && e.key.toLowerCase() === 'd') {
      e.preventDefault();
      splitActivePane(e.shiftKey ? 'col' : 'row');
      return;
    }
    // Cmd+Alt+Flechas → ciclar foco entre panes
    if (e.metaKey && e.altKey && (e.key === 'ArrowRight' || e.key === 'ArrowDown')) { e.preventDefault(); cyclePane(1);  return; }
    if (e.metaKey && e.altKey && (e.key === 'ArrowLeft'  || e.key === 'ArrowUp'))   { e.preventDefault(); cyclePane(-1); return; }
    // Ctrl+R → prevenir recarga del webview (el shell lo recibe como \x12, fzf)
    if (e.ctrlKey && e.key === 'r') { e.preventDefault(); }
  }, true);

  // ── Helpers ─────────────────────────────────────────────────────────────

  function getBasename(path) {
    if (!path || path === '/') return '/';
    const clean = path.replace(/\/$/, '');
    const idx = clean.lastIndexOf('/');
    return idx >= 0 ? clean.substring(idx + 1) : clean;
  }

  function updateTabName(shellId, path) {
    const pane = panes.get(shellId);
    if (!pane) return;
    pane.name = getBasename(path);
    const tab = tabs.get(pane.tabId);
    if (tab && tab.activePaneShellId === shellId) {
      tab.name = pane.name;
      renderTabLabel(tab);
    }
  }

  // ── Recuperación de foco + resize (AeroSpace / tiling WMs / alt+tab) ───────

  window.addEventListener('focus', () => {
    const pane = panes.get(activeShellId);
    if (pane?.term) pane.term.focus();
  });

  let _resizeTimer = null;
  window.addEventListener('resize', () => {
    clearTimeout(_resizeTimer);
    _resizeTimer = setTimeout(() => {
      panes.forEach(p => { if (p?.fitAddon) { try { p.fitAddon.fit(); } catch (_) {} } });
    }, 150);
  });

  // ── Inicializar ─────────────────────────────────────────────────────────
  createTab();

  // ── Workspaces: exportar / restaurar layout ────────────────────────────────

  // Serializa un nodo del árbol reemplazando shellId por el cwd actual del pane.
  async function serializeNode(node) {
    if (node.kind === 'leaf') {
      let cwd = null;
      try { cwd = await invoke('get_shell_cwd', { shellId: node.shellId }); } catch (_) {}
      return { kind: 'leaf', cwd: cwd || null };
    }
    return {
      kind: 'split',
      dir: node.dir,
      ratio: node.ratio,
      a: await serializeNode(node.a),
      b: await serializeNode(node.b),
    };
  }

  // Captura el layout del ESPACIO ACTIVO: { tabs: [{ name, tree }] }.
  // (Guardar un workspace = persistir el espacio en el que estás trabajando.)
  async function exportLayout() {
    const out = [];
    for (const [, tab] of tabs) {
      if (tab.spaceId !== activeSpaceId) continue;
      out.push({ name: tab.name, tree: await serializeNode(tab.root) });
    }
    return { tabs: out };
  }

  // Restaura un workspace agregando sus pestañas al espacio actual (aditivo).
  // Nota: con espacios conmutables se usa openWorkspaceSpace; applyLayout queda
  // para compatibilidad / modo lanzador.
  async function applyLayout(ws) {
    if (!ws || !Array.isArray(ws.tabs)) return;
    for (const t of ws.tabs) {
      await createTabFromLayout(t);
    }
  }

  // ── Exponer API (compatibilidad: getTab/getAllTabs operan sobre panes) ────
  window.TAB_MANAGER = {
    createTab,
    closeTab,
    closePane,
    splitActivePane,
    cyclePane,
    respawnActive,
    updateTabName,
    onCommandFinished,
    exportLayout,
    applyLayout,
    // Espacios conmutables (workspaces)
    switchToSpace,
    openWorkspaceSpace,
    getActiveSpaceId: () => activeSpaceId,
    spaceIsLive,
    setOnSpacesChanged: (cb) => { onSpacesChanged = cb; },
    setOnLayoutChanged: (cb) => { onLayoutChanged = cb; },
    // switchTab(shellId): cambia al tab que contiene ese shell y lo enfoca
    switchTab: (shellId) => {
      const p = panes.get(shellId);
      if (p) { switchToTab(p.tabId); setActivePane(shellId); }
    },
    getActiveShellId: () => activeShellId,
    getTab: (shellId) => panes.get(shellId),          // pane data (term, fitAddon, searchAddon, name)
    getAllTabs: () => Array.from(panes.entries()),    // todos los panes (para settings/themes)
  };
})();
