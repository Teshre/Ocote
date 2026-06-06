// workspaces.js — Espacios de trabajo conmutables con auto-guardado (opt-in)
//
// Cada workspace es un "espacio" VIVO con su propio conjunto de pestañas. Crear
// uno ("+ Workspace") abre un espacio nuevo y vacío donde empiezas a trabajar;
// TODO lo que hagas (tabs, splits, cd) se guarda AUTOMÁTICAMENTE bajo su nombre.
//
//   [◈ Default]  [proyecto]  [otro]            [+ Workspace]
//
// Default = espacio borrador (no se persiste). Es OPT-IN: se activa en Settings.

(function () {
  'use strict';

  const invoke = window.__TAURI__?.invoke;
  if (!invoke) return;

  let workspaces = [];   // [{ name, tabs:[{name, tree}] }]  (definiciones persistidas)
  let enabled    = false;
  let saveTimer  = null;

  const bar = () => document.getElementById('workspace-bar');
  function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

  // ── Persistencia ─────────────────────────────────────────────────────────────

  async function loadWorkspaces() {
    try { workspaces = (await invoke('get_workspaces')) || []; } catch { workspaces = []; }
    if (!Array.isArray(workspaces)) workspaces = [];
  }
  async function persist() {
    try { await invoke('save_workspaces', { workspaces }); } catch (e) { console.error('[Workspaces]', e); }
  }

  // ── Auto-guardado del espacio activo ──────────────────────────────────────────
  // Exporta el layout del espacio activo (si es un workspace) y lo persiste.
  async function autosaveActive() {
    const sid = window.TAB_MANAGER.getActiveSpaceId();
    if (!sid || !sid.startsWith('ws:')) return;   // Default no se guarda
    const name = sid.slice(3);
    let layout;
    try { layout = await window.TAB_MANAGER.exportLayout(); } catch { return; }
    const entry = { name, tabs: layout.tabs };
    const i = workspaces.findIndex(w => w.name === name);
    if (i >= 0) workspaces[i] = entry; else workspaces.push(entry);
    await persist();
  }
  function scheduleAutosave() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(autosaveActive, 700);
  }

  // ── Barra ─────────────────────────────────────────────────────────────────────

  function renderBar() {
    const el = bar();
    if (!el) return;
    if (!enabled) { el.classList.add('hidden'); el.innerHTML = ''; return; }
    el.classList.remove('hidden');

    const active = window.TAB_MANAGER.getActiveSpaceId();

    let html = `<button class="wsb-chip ${active === 'default' ? 'active' : ''}" data-space="default">
                  <span class="wsb-dot">◈</span> Default
                </button>`;

    html += workspaces.map(ws => {
      const sid = 'ws:' + ws.name;
      const tabsHint = ws.tabs.map(t => t.name).join(' · ');
      return `<button class="wsb-chip ${active === sid ? 'active' : ''}" data-ws="${esc(ws.name)}" title="${esc(tabsHint)}">
                <span class="wsb-name">${esc(ws.name)}</span>
                <span class="wsb-x" data-del="${esc(ws.name)}" title="Eliminar">✕</span>
              </button>`;
    }).join('');

    html += `<button class="wsb-add" id="wsb-new" title="Crear un workspace nuevo">+ Workspace</button>`;

    el.innerHTML = html;

    el.querySelector('.wsb-chip[data-space]')?.addEventListener('click', gotoDefault);
    el.querySelectorAll('.wsb-chip[data-ws]').forEach(b =>
      b.addEventListener('click', (e) => { if (!e.target.closest('.wsb-x')) openWs(b.dataset.ws); }));
    el.querySelectorAll('.wsb-x').forEach(x =>
      x.addEventListener('click', (e) => { e.stopPropagation(); delWs(x.dataset.del); }));
    document.getElementById('wsb-new')?.addEventListener('click', startCreate);
  }

  // ── Acciones ────────────────────────────────────────────────────────────────

  async function gotoDefault() {
    await autosaveActive();                       // guarda el espacio que dejas
    await window.TAB_MANAGER.switchToSpace('default');
  }

  async function openWs(name) {
    await autosaveActive();                       // guarda el espacio que dejas
    const ws = workspaces.find(w => w.name === name);
    await window.TAB_MANAGER.openWorkspaceSpace(name, ws ? ws.tabs : []);
  }

  async function delWs(name) {
    workspaces = workspaces.filter(w => w.name !== name);
    await persist();
    renderBar();
  }

  // ── Crear workspace (input inline en la barra) ────────────────────────────────

  function startCreate() {
    const btn = document.getElementById('wsb-new');
    if (!btn) return;
    btn.outerHTML = `<input id="wsb-new-input" class="wsb-new-input" type="text"
                            placeholder="nombre del workspace…" autocomplete="off" spellcheck="false">`;
    const inp = document.getElementById('wsb-new-input');
    inp.focus();
    inp.addEventListener('keydown', (e) => {
      if (e.key === 'Enter')  { e.preventDefault(); createNew(inp.value.trim()); }
      if (e.key === 'Escape') { e.preventDefault(); renderBar(); }
    });
    inp.addEventListener('blur', () => {
      // Si sigue vacío y pierde foco, cancela; si tiene texto, deja que Enter cree.
      if (document.getElementById('wsb-new-input') && !inp.value.trim()) renderBar();
    });
  }

  function uniqueName(base) {
    let n = base || 'workspace', i = 2;
    while (workspaces.some(w => w.name === n)) { n = `${base}-${i}`; i++; }
    return n;
  }

  async function createNew(rawName) {
    await autosaveActive();                       // guarda el espacio actual antes de irte
    const name = uniqueName(rawName || 'workspace');
    workspaces.push({ name, tabs: [] });
    await persist();
    // Abre el espacio nuevo (vacío → openWorkspaceSpace crea 1 tab para empezar).
    await window.TAB_MANAGER.openWorkspaceSpace(name, []);
    renderBar();
    // El auto-guardado capturará la primera tab en cuanto se cree.
  }

  // ── Toggle de activación ────────────────────────────────────────────────────

  function setEnabled(v) {
    enabled = !!v;
    localStorage.setItem('ocote_workspaces_enabled', enabled ? '1' : '0');
    if (!enabled) window.TAB_MANAGER.switchToSpace('default');
    renderBar();
  }

  // ── Init ─────────────────────────────────────────────────────────────────────

  async function init() {
    enabled = localStorage.getItem('ocote_workspaces_enabled') === '1';
    await loadWorkspaces();
    window.TAB_MANAGER?.setOnSpacesChanged?.(renderBar);
    window.TAB_MANAGER?.setOnLayoutChanged?.(scheduleAutosave);
    // Red de seguridad: guardar al perder foco (captura cd's recientes).
    window.addEventListener('blur', autosaveActive);
    renderBar();
  }

  init();

  window.OCOTE_WORKSPACES = { setEnabled, isEnabled: () => enabled };
})();
