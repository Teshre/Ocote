// shell-config.js — Config visual del shell (Settings → Shell)
//
// Deja a usuarios sin conocimientos de shell:
//   - elegir el shell por defecto de las pestañas nuevas (zsh/bash/fish/PowerShell)
//   - definir variables de entorno y carpetas en el PATH
//   - ajustar preferencias (tamaño de historial, no duplicados, autocd)
//   - escribir comandos de inicio "avanzados" (raw, por familia de shell)
// …sin abrir .zshrc / config.fish a mano.
//
// La fuente de verdad de TODO menos el shell por defecto vive en Rust
// (app_data_dir/shell-config.json, ver shell_config.rs). El shell por defecto
// es preferencia del frontend en localStorage('ocote_default_shell'); lo lee
// tab-manager.js al crear cada pestaña. Todo aplica en pestañas NUEVAS.

(function () {
  'use strict';

  const invoke = window.__TAURI__?.invoke;
  if (!invoke) return;

  // Config por defecto (mismo shape que ShellConfig en Rust, snake_case).
  const DEFAULT_PREFS = {
    history_size: 0,
    no_duplicate_history: false,
    autocd: false,
    share_history: false,
    timestamps_history: false,
  };

  let config = {
    env_vars: [],   // [{ name, value }]
    path_dirs: [],  // [string]
    prefs: { ...DEFAULT_PREFS },
    init: { sh: '', fish: '', ps1: '' },
  };

  // Variables que tienen "picker" de valores comunes (atajos para principiantes).
  const PICKER_VARS = ['EDITOR', 'LANG', 'PAGER'];

  let shells = [];        // [{ id, name, path, available }] desde detect_shells
  let initFamily = 'sh';  // familia activa del editor avanzado: 'sh'|'fish'|'ps1'

  // ── Helpers ────────────────────────────────────────────────────────────────

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s ?? '';
    return d.innerHTML;
  }

  const $ = (id) => document.getElementById(id);

  // id de shell → familia de archivo generado (para el editor avanzado)
  function familyOf(shellId) {
    if (shellId === 'fish') return 'fish';
    if (shellId === 'pwsh' || shellId === 'powershell') return 'ps1';
    return 'sh'; // zsh + bash
  }

  // Shell por defecto guardado: { id, path } o null (usar $SHELL del sistema).
  function getDefaultShell() {
    try { return JSON.parse(localStorage.getItem('ocote_default_shell') || 'null'); }
    catch { return null; }
  }
  function setDefaultShell(sh) {
    if (sh) localStorage.setItem('ocote_default_shell', JSON.stringify({ id: sh.id, path: sh.path }));
    else    localStorage.removeItem('ocote_default_shell');
  }

  // ── Carga / persistencia ────────────────────────────────────────────────────

  async function load() {
    try {
      config = (await invoke('get_shell_config')) || config;
    } catch { /* deja el default */ }
    // Normalizar por si el JSON viejo no tiene algún campo.
    config.env_vars  = config.env_vars  || [];
    config.path_dirs = config.path_dirs || [];
    config.prefs     = Object.assign({ ...DEFAULT_PREFS }, config.prefs || {});
    config.init      = Object.assign({ sh: '', fish: '', ps1: '' }, config.init || {});

    try { shells = (await invoke('detect_shells')) || []; }
    catch { shells = []; }

    // El editor avanzado arranca en la familia del shell por defecto elegido.
    const def = getDefaultShell();
    initFamily = familyOf(def?.id || firstAvailableId());

    renderAll();
  }

  async function persist() {
    try {
      await invoke('save_shell_config', { config });
    } catch (e) {
      console.error('[shell-config] no se pudo guardar:', e);
    }
  }

  function firstAvailableId() {
    const a = shells.find(s => s.available);
    return a ? a.id : 'zsh';
  }

  // ── Render ──────────────────────────────────────────────────────────────────

  function renderAll() {
    renderShells();
    renderEnv();
    renderPickers();
    renderPaths();
    renderPrefs();
    renderAdvanced();
    refreshPreview();
  }

  // Shell que realmente usarán las pestañas nuevas: el elegido por el usuario,
  // o (si no eligió ninguno) el shell de login del sistema ($SHELL).
  function effectiveShellId() {
    const def = getDefaultShell();
    if (def?.id) return def.id;
    const login = shells.find(s => s.is_login_shell);
    return login ? login.id : firstAvailableId();
  }

  // Selector de shell por defecto: una card por shell detectado.
  function renderShells() {
    const el = $('sc-shell-list');
    if (!el) return;

    const effId = effectiveShellId();
    el.innerHTML = shells.map(s => {
      const selected = s.id === effId;   // el que está EN USO
      const cls = ['sc-shell-card'];
      if (selected) cls.push('selected');
      if (!s.available) cls.push('unavailable');

      let sub;
      if (!s.available)          sub = 'No instalado en tu sistema';
      else if (s.is_login_shell) sub = esc(s.path) + '  ·  sistema';
      else                       sub = esc(s.path);

      const badge = selected ? '<span class="sc-shell-badge">En uso</span>' : '';
      return `
        <button class="${cls.join(' ')}" data-id="${esc(s.id)}" ${s.available ? '' : 'disabled'}>
          <span class="sc-shell-name">${esc(s.name)}</span>
          <span class="sc-shell-path">${sub}</span>
          ${badge}
        </button>`;
    }).join('');

    el.querySelectorAll('.sc-shell-card:not([disabled])').forEach(btn => {
      btn.addEventListener('click', () => {
        const s = shells.find(x => x.id === btn.dataset.id);
        if (!s) return;
        setDefaultShell(s);
        initFamily = familyOf(s.id);
        renderShells();
        renderAdvanced();
      });
    });
  }

  // Lista de variables de entorno.
  function renderEnv() {
    const el = $('sc-env-list');
    if (!el) return;
    if (!config.env_vars.length) {
      el.innerHTML = '<div class="sc-empty">Sin variables. Añade una arriba ↑</div>';
      return;
    }
    el.innerHTML = config.env_vars.map((v, i) => `
      <div class="sc-row">
        <span class="sc-row-name">${esc(v.name)}</span>
        <span class="sc-row-eq">=</span>
        <span class="sc-row-val" title="${esc(v.value)}">${esc(v.value)}</span>
        <button class="sc-del" data-i="${i}" title="Eliminar" aria-label="Eliminar">✕</button>
      </div>`).join('');
    el.querySelectorAll('.sc-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        config.env_vars.splice(parseInt(btn.dataset.i, 10), 1);
        await persist();
        renderEnv();
        renderPickers();
        refreshPreview();
      });
    });
  }

  // Pickers de valores comunes: refleja el valor actual de cada variable.
  function renderPickers() {
    document.querySelectorAll('.sc-pick').forEach(sel => {
      const v = config.env_vars.find(x => x.name === sel.dataset.var);
      sel.value = v ? v.value : '';
    });
  }

  // Lista de carpetas del PATH.
  function renderPaths() {
    const el = $('sc-path-list');
    if (!el) return;
    if (!config.path_dirs.length) {
      el.innerHTML = '<div class="sc-empty">Sin carpetas. Añade una arriba ↑</div>';
      return;
    }
    el.innerHTML = config.path_dirs.map((d, i) => `
      <div class="sc-row">
        <span class="sc-row-path" title="${esc(d)}">${esc(d)}</span>
        <button class="sc-del" data-i="${i}" title="Eliminar" aria-label="Eliminar">✕</button>
      </div>`).join('');
    el.querySelectorAll('.sc-del').forEach(btn => {
      btn.addEventListener('click', async () => {
        config.path_dirs.splice(parseInt(btn.dataset.i, 10), 1);
        await persist();
        renderPaths();
        refreshPreview();
      });
    });
  }

  // Preferencias: input de historial + 2 toggles.
  function renderPrefs() {
    const hist = $('sc-history');
    if (hist) hist.value = config.prefs.history_size || '';
    const dup = $('sc-nodup');
    if (dup) dup.checked = !!config.prefs.no_duplicate_history;
    const acd = $('sc-autocd');
    if (acd) acd.checked = !!config.prefs.autocd;
    const shr = $('sc-share');
    if (shr) shr.checked = !!config.prefs.share_history;
    const ts = $('sc-timestamps');
    if (ts) ts.checked = !!config.prefs.timestamps_history;

    // Nota contextual: si el shell por defecto es fish, las preferencias no
    // aplican (fish maneja historial/dedup nativo y no tiene autocd).
    const note = $('sc-prefs-note');
    if (note) {
      const def = getDefaultShell();
      const isFish = (def?.id || firstAvailableId()) === 'fish';
      note.classList.toggle('hidden', !isFish);
    }
  }

  // Editor avanzado: selector de familia + textarea.
  function renderAdvanced() {
    const sel = $('sc-init-family');
    if (sel) sel.value = initFamily;
    const ta = $('sc-init-text');
    if (ta) ta.value = config.init[initFamily] || '';

    const label = $('sc-init-label');
    if (label) {
      label.textContent = initFamily === 'fish' ? 'fish'
        : initFamily === 'ps1' ? 'PowerShell'
        : 'zsh y bash';
    }
  }

  // ── Operaciones ──────────────────────────────────────────────────────────────

  function validEnvName(n) {
    return /^[A-Za-z_][A-Za-z0-9_]*$/.test(n);
  }

  function showEnvError(msg) {
    const e = $('sc-env-error');
    if (e) { e.textContent = msg || ''; e.classList.toggle('hidden', !msg); }
  }

  async function addEnv() {
    const name = $('sc-env-name').value.trim();
    const value = $('sc-env-value').value.trim();
    showEnvError('');
    if (!name) { showEnvError('Escribe el nombre de la variable.'); return; }
    if (!validEnvName(name)) {
      showEnvError('Nombre inválido: usa letras, números o _ (sin empezar con número).');
      return;
    }
    if (config.env_vars.some(v => v.name === name)) {
      showEnvError(`Ya existe la variable "${name}".`);
      return;
    }
    config.env_vars.push({ name, value });
    config.env_vars.sort((a, b) => a.name.localeCompare(b.name));
    await persist();
    $('sc-env-name').value = '';
    $('sc-env-value').value = '';
    $('sc-env-name').focus();
    renderEnv();
    renderPickers();
    refreshPreview();
  }

  async function addPath() {
    const dir = $('sc-path-input').value.trim();
    if (!dir) return;
    if (config.path_dirs.includes(dir)) { $('sc-path-input').value = ''; return; }
    config.path_dirs.push(dir);
    await persist();
    $('sc-path-input').value = '';
    $('sc-path-input').focus();
    renderPaths();
    refreshPreview();
  }

  async function savePrefs() {
    const raw = parseInt($('sc-history').value, 10);
    config.prefs.history_size = Number.isFinite(raw) && raw > 0 ? raw : 0;
    config.prefs.no_duplicate_history = $('sc-nodup').checked;
    config.prefs.autocd = $('sc-autocd').checked;
    config.prefs.share_history = $('sc-share').checked;
    config.prefs.timestamps_history = $('sc-timestamps').checked;
    await persist();
    refreshPreview();
  }

  async function saveInit() {
    const ta = $('sc-init-text');
    if (!ta) return;
    config.init[initFamily] = ta.value;
    await persist();
    refreshPreview();
  }

  // Picker de valor común: setea/actualiza/borra la variable de entorno.
  async function setCommon(name, value) {
    const i = config.env_vars.findIndex(v => v.name === name);
    if (!value) {
      if (i >= 0) config.env_vars.splice(i, 1);   // "— sin definir —" → quitar
    } else if (i >= 0) {
      config.env_vars[i].value = value;
    } else {
      config.env_vars.push({ name, value });
    }
    config.env_vars.sort((a, b) => a.name.localeCompare(b.name));
    await persist();
    renderEnv();
    renderPickers();
    refreshPreview();
  }

  // ── Ver el código generado ───────────────────────────────────────────────────

  // Pide al backend el contenido EXACTO que se generaría (sin escribir a disco)
  // y muestra el de la familia activa del editor avanzado.
  async function refreshPreview() {
    const pre = $('sc-preview');
    if (!pre) return;
    try {
      const files = await invoke('preview_shell_config', { config });
      pre.textContent = (files && files[initFamily]) || '';
    } catch (e) {
      pre.textContent = '';
    }
    const fam = $('sc-preview-fam');
    if (fam) {
      fam.textContent = initFamily === 'fish' ? 'fish'
        : initFamily === 'ps1' ? 'PowerShell' : 'zsh y bash';
    }
  }

  // ── Copia de seguridad / restaurar ───────────────────────────────────────────

  function backupMsg(msg) {
    const e = $('sc-backup-msg');
    if (e) { e.textContent = msg || ''; e.classList.toggle('hidden', !msg); }
    if (msg) setTimeout(() => backupMsg(''), 2500);
  }

  // Exportar: copia el JSON de la config al portapapeles.
  async function exportConfig() {
    const json = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(json);
      backupMsg('✓ Copiado al portapapeles');
    } catch {
      // Fallback para webviews que no exponen clipboard async.
      const ta = document.createElement('textarea');
      ta.value = json;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand('copy'); backupMsg('✓ Copiado'); }
      catch { backupMsg('No se pudo copiar'); }
      document.body.removeChild(ta);
    }
  }

  // Importar: parsea el JSON pegado y lo aplica (validado en el backend al guardar).
  async function importConfig() {
    const ta = $('sc-import-text');
    const msg = $('sc-import-msg');
    const setMsg = (m) => { if (msg) msg.textContent = m || ''; };
    let parsed;
    try {
      parsed = JSON.parse(ta.value);
    } catch {
      setMsg('JSON inválido.');
      return;
    }
    if (typeof parsed !== 'object' || parsed === null) {
      setMsg('JSON inválido.');
      return;
    }
    // Normalizar al shape esperado (campos faltantes → defaults).
    config = {
      env_vars:  Array.isArray(parsed.env_vars) ? parsed.env_vars : [],
      path_dirs: Array.isArray(parsed.path_dirs) ? parsed.path_dirs : [],
      prefs:     Object.assign({ ...DEFAULT_PREFS }, parsed.prefs || {}),
      init:      Object.assign({ sh: '', fish: '', ps1: '' }, parsed.init || {}),
    };
    await persist();   // el backend sanea (nombres válidos, clamp, escape)
    await load();      // recargar la versión saneada
    setMsg('');
    $('sc-import-box').classList.add('hidden');
    ta.value = '';
    backupMsg('✓ Importado');
  }

  // Restaurar: vuelve todo a vacío (con confirmación).
  async function resetConfig() {
    const ok = window.ocoteConfirm
      ? await window.ocoteConfirm('¿Restaurar la configuración de shell a los valores por defecto? Se borrarán tus variables, PATH y preferencias.', { confirmLabel: 'Restaurar', danger: true })
      : true;
    if (!ok) return;
    config = {
      env_vars: [], path_dirs: [],
      prefs: { ...DEFAULT_PREFS },
      init: { sh: '', fish: '', ps1: '' },
    };
    await persist();
    renderAll();
    backupMsg('✓ Restaurado');
  }

  // ── Wiring ───────────────────────────────────────────────────────────────────

  $('sc-env-add')?.addEventListener('click', addEnv);
  ['sc-env-name', 'sc-env-value'].forEach(id => {
    $(id)?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addEnv(); }
    });
  });

  $('sc-path-add')?.addEventListener('click', addPath);
  $('sc-path-input')?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { e.preventDefault(); addPath(); }
  });

  // Preferencias: guardar al cambiar (toggles) o al perder foco (número).
  ['sc-history', 'sc-nodup', 'sc-autocd', 'sc-share', 'sc-timestamps'].forEach(id => {
    $(id)?.addEventListener('change', savePrefs);
  });

  // Avanzado: cambiar de familia recarga el textarea; guardar al perder foco.
  $('sc-init-family')?.addEventListener('change', (e) => {
    initFamily = e.target.value;
    renderAdvanced();
    refreshPreview();
  });
  $('sc-init-text')?.addEventListener('blur', saveInit);

  // Pickers de valores comunes (EDITOR / LANG / PAGER).
  document.querySelectorAll('.sc-pick').forEach(sel => {
    sel.addEventListener('change', () => setCommon(sel.dataset.var, sel.value));
  });

  // Copia de seguridad / restaurar.
  $('sc-export')?.addEventListener('click', exportConfig);
  $('sc-reset')?.addEventListener('click', resetConfig);
  $('sc-import-apply')?.addEventListener('click', importConfig);
  $('sc-import-toggle')?.addEventListener('click', () => {
    $('sc-import-box')?.classList.toggle('hidden');
    $('sc-import-text')?.focus();
  });

  // settings.js llama esto al abrir la tab de Shell.
  window.loadShellConfig = load;
})();
