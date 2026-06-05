// aliases.js — Editor visual de aliases (Settings → Aliases)
//
// CRUD sobre la lista de aliases. La fuente de verdad vive en Rust
// (app_data_dir/aliases.json); aquí editamos y guardamos la lista completa.
// Los aliases se aplican en pestañas NUEVAS (las configs de shell sourcean el
// archivo generado al arrancar — ver aliases.rs + pty.rs).

(function () {
  'use strict';

  const invoke = window.__TAURI__?.invoke;
  if (!invoke) return;

  let aliases = []; // [{ name, command }]

  const $list = () => document.getElementById('alias-list');
  const $name = () => document.getElementById('alias-name');
  const $cmd  = () => document.getElementById('alias-cmd');
  const $err  = () => document.getElementById('alias-error');

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function showError(msg) {
    const e = $err();
    if (e) { e.textContent = msg; e.classList.remove('hidden'); }
  }
  function clearError() {
    const e = $err();
    if (e) { e.textContent = ''; e.classList.add('hidden'); }
  }

  // Nombre válido: letra o _ al inicio, luego letras/números/_/-
  function validName(n) {
    return /^[A-Za-z_][A-Za-z0-9_-]*$/.test(n);
  }

  // ── Carga / persistencia ───────────────────────────────────────────────────

  async function load() {
    try {
      aliases = (await invoke('get_aliases')) || [];
    } catch {
      aliases = [];
    }
    clearError();
    render();
  }

  async function persist() {
    try {
      await invoke('save_aliases', { aliases });
    } catch (e) {
      showError('No se pudo guardar: ' + e);
    }
  }

  // ── Operaciones ─────────────────────────────────────────────────────────────

  async function add() {
    const name = $name().value.trim();
    const command = $cmd().value.trim();
    clearError();

    if (!name || !command) { showError('Completa el nombre y el comando.'); return; }
    if (!validName(name)) {
      showError('Nombre inválido: usa letras, números, _ o - (sin empezar con número ni espacios).');
      return;
    }
    if (aliases.some(a => a.name === name)) {
      showError(`Ya existe un alias "${name}".`);
      return;
    }

    aliases.push({ name, command });
    aliases.sort((a, b) => a.name.localeCompare(b.name));
    await persist();

    $name().value = '';
    $cmd().value = '';
    $name().focus();
    render();
  }

  async function remove(name) {
    aliases = aliases.filter(a => a.name !== name);
    await persist();
    render();
  }

  // ── Render ────────────────────────────────────────────────────────────────

  function render() {
    const el = $list();
    if (!el) return;

    if (!aliases.length) {
      el.innerHTML = '<div class="alias-empty">Aún no tienes aliases. Crea el primero arriba ↑</div>';
      return;
    }

    el.innerHTML = aliases.map(a => `
      <div class="alias-row">
        <span class="alias-row-name">${esc(a.name)}</span>
        <span class="alias-row-arrow">→</span>
        <span class="alias-row-cmd" title="${esc(a.command)}">${esc(a.command)}</span>
        <button class="alias-del" data-name="${esc(a.name)}" title="Eliminar" aria-label="Eliminar">✕</button>
      </div>
    `).join('');

    el.querySelectorAll('.alias-del').forEach(btn => {
      btn.addEventListener('click', () => remove(btn.dataset.name));
    });
  }

  // ── Wiring ───────────────────────────────────────────────────────────────

  document.getElementById('alias-add')?.addEventListener('click', add);

  // Enter en cualquiera de los dos inputs agrega el alias
  ['alias-name', 'alias-cmd'].forEach(id => {
    document.getElementById(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); add(); }
    });
  });

  // settings.js llama esto al abrir la tab de Aliases
  window.loadAliases = load;
})();
