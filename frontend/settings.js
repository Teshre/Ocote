// settings.js — Panel de configuración de Ocote (modal centrado con tabs)
// Maneja tema, tipografía, estilo de íconos, idioma y prompt personalizado.
// Todas las preferencias se guardan en localStorage y se aplican inmediatamente.

(function () {
  'use strict';

  // ── Defaults ────────────────────────────────────────────────────────────
  const DEFAULTS = {
    theme:     'dark',
    font:      "'JetBrainsMono Nerd Font Mono', 'JetBrainsMonoNL Nerd Font Mono', 'MesloLGS NF', 'FiraCode Nerd Font Propo', 'Hack Nerd Font', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    iconTheme: 'seti',
    lang:      'es',
    prompt:    'git',   // Ocote de fábrica; 'mine' respeta la config del usuario
  };

  // ── Estado actual (lee localStorage) ────────────────────────────────────
  const state = {
    theme:     localStorage.getItem('ocote_theme')      || DEFAULTS.theme,
    font:      localStorage.getItem('ocote_font')       || DEFAULTS.font,
    iconTheme: localStorage.getItem('ocote_icon_theme') || DEFAULTS.iconTheme,
    lang:      localStorage.getItem('ocote_lang')       || DEFAULTS.lang,
    prompt:    localStorage.getItem('ocote_prompt')     || DEFAULTS.prompt,
  };

  // ── Helpers de aplicación ───────────────────────────────────────────────

  function setXtermOption(key, value) {
    if (!window.TAB_MANAGER) return;
    window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => {
      if (!tab || !tab.term) return;
      if (tab.term.options && typeof tab.term.options === 'object') {
        tab.term.options[key] = value;
      } else if (tab.term.setOption) {
        tab.term.setOption(key, value);
      }
    });
  }

  function applyTheme(themeId) {
    if (window.OCOTE_THEMES) {
      window.OCOTE_THEMES.applyTheme(themeId);
    } else {
      document.body.dataset.theme = themeId;
    }
  }

  function applyFont(font) {
    document.documentElement.style.setProperty('--font-mono', font);
    setXtermOption('fontFamily', font);
    if (window.TAB_MANAGER) {
      window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => {
        if (tab?.fitAddon) tab.fitAddon.fit();
      });
    }
  }

  function applyIconTheme(iconTheme) {
    localStorage.setItem('ocote_icon_theme', iconTheme);
    if (window._explorerRefresh) window._explorerRefresh();
  }

  function applyLang(lang) {
    localStorage.setItem('ocote_lang', lang);
    if (window.I18N) window.I18N.apply();
  }

  function applyPrompt(prompt) {
    localStorage.setItem('ocote_prompt', prompt);
  }

  function applyAll() {
    applyTheme(state.theme);
    applyFont(state.font);
    applyIconTheme(state.iconTheme);
    applyLang(state.lang);
    applyPrompt(state.prompt);
  }

  // ── Editor de prompt personalizado ─────────────────────────────────────
  // Config del editor: refleja la última configuración "custom:..." activa.
  const editorCfg = {
    pc:    'teal',   // color de la ruta (teal|blue|green|ember)
    gc:    'green',  // color de git     (green|teal|blue|ember)
    ac:    'ember',  // color de la ❯    (ember|teal|green|blue)
    git:   '1',      // mostrar rama git  (0|1)
    time:  '0',      // mostrar hora      (0|1)
    user:  '0',      // mostrar user@host (0|1)
    style: '2',      // 1=una línea, 2=dos líneas
  };

  /** Parsea "custom:pc=teal,gc=green,..." → editorCfg */
  function parseCustomConfig(value) {
    if (!value || !value.startsWith('custom:')) return;
    const cfg = value.slice('custom:'.length);
    cfg.split(',').forEach(pair => {
      const [k, v] = pair.split('=');
      if (k && v !== undefined && k in editorCfg) {
        editorCfg[k] = v;
      }
    });
  }

  /** Construye el string "custom:pc=teal,..." desde editorCfg */
  function buildCustomValue() {
    const c = editorCfg;
    return `custom:pc=${c.pc},gc=${c.gc},ac=${c.ac},git=${c.git},time=${c.time},user=${c.user},style=${c.style}`;
  }

  /** Paleta de colores del editor: nombre → hex real */
  const PALETTE = {
    ember: '#E8843A', teal: '#6DD8C8', green: '#7DC97A',
    blue:  '#82A6E0', muted: '#9C9480',
  };

  /** Renderiza el preview en vivo del prompt personalizado */
  function updatePromptPreview() {
    const box = document.getElementById('pe-preview-box');
    if (!box) return;

    const pathColor  = PALETTE[editorCfg.pc] || PALETTE.teal;
    const gitColor   = PALETTE[editorCfg.gc] || PALETTE.green;
    const arrowColor = PALETTE[editorCfg.ac] || PALETTE.ember;
    const muted      = PALETTE.muted;

    // Línea 1: [user@host] ruta [⎇ rama] [hora]
    let line1 = '';
    if (editorCfg.user === '1') {
      line1 += `<span style="color:${muted}">usuario@host </span>`;
    }
    line1 += `<span style="color:${pathColor}">~/proyecto/src</span>`;
    if (editorCfg.git === '1') {
      line1 += `<span style="color:${muted}">  </span>`;
      line1 += `<span style="color:${gitColor}">main</span>`;
    }
    if (editorCfg.time === '1') {
      line1 += `<span style="color:${muted}"> 14:32</span>`;
    }

    const arrowHtml = `<span style="color:${arrowColor}">❯</span>`;
    const cursorHtml = `<span class="pe-cursor"></span>`;

    if (editorCfg.style === '1') {
      box.innerHTML = `${line1} ${arrowHtml} ${cursorHtml}`;
    } else {
      box.innerHTML = `${line1}<br>${arrowHtml} ${cursorHtml}`;
    }
  }

  /** Sincroniza los controles del editor HTML con el estado actual de editorCfg */
  function syncEditorUI() {
    const editor = document.getElementById('prompt-editor');
    if (!editor) return;

    // Botones segmentados de estilo (1/2 líneas)
    editor.querySelectorAll('.pe-seg').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === editorCfg.style);
    });

    // Círculos de color por grupo
    editor.querySelectorAll('.pe-colors').forEach(group => {
      const key = group.dataset.pkey;
      group.querySelectorAll('.pe-color').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.value === editorCfg[key]);
      });
    });

    // Checkboxes de segmentos
    editor.querySelectorAll('input[data-pkey]').forEach(cb => {
      const key = cb.dataset.pkey;
      // Las claves de checkbox son: user, git, time
      cb.checked = editorCfg[key] === '1';
    });

    updatePromptPreview();
  }

  /** Muestra u oculta el editor según el preset seleccionado */
  function toggleEditor(promptValue) {
    const editor = document.getElementById('prompt-editor');
    if (!editor) return;
    const isCustom = promptValue && promptValue.startsWith('custom');
    editor.classList.toggle('hidden', !isCustom);
    if (isCustom) updatePromptPreview();
  }

  // ── Sincronizar UI con estado ───────────────────────────────────────────

  function updateUIFromState() {
    // ── Tab General ──────────────────────────────────────────────────────
    document.querySelectorAll('[data-setting="lang"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.lang);
    });

    // ── Tab Apariencia ─────────────────────────────────────────────────
    const fontSelect = document.getElementById('settings-font');
    if (fontSelect) {
      let matched = false;
      for (const opt of fontSelect.options) {
        if (opt.value === state.font) { opt.selected = true; matched = true; break; }
      }
      if (!matched) fontSelect.options[0].selected = true;
    }

    const promptSelect = document.getElementById('settings-prompt');
    if (promptSelect) {
      // El valor de state.prompt puede ser "custom:..." → el <option> tiene value="custom"
      const selectValue = state.prompt.startsWith('custom') ? 'custom' : state.prompt;
      let matched = false;
      for (const opt of promptSelect.options) {
        if (opt.value === selectValue) { opt.selected = true; matched = true; break; }
      }
      if (!matched) promptSelect.options[0].selected = true;

      // Parsear config custom si aplica
      if (state.prompt.startsWith('custom')) {
        parseCustomConfig(state.prompt);
      }
      toggleEditor(state.prompt);
      syncEditorUI();
    }

    document.querySelectorAll('[data-setting="iconTheme"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.iconTheme);
    });

    document.querySelectorAll('.theme-swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.theme === state.theme);
    });
  }

  // ── Persistir estado ────────────────────────────────────────────────────

  function persist() {
    localStorage.setItem('ocote_theme',      state.theme);
    localStorage.setItem('ocote_font',       state.font);
    localStorage.setItem('ocote_icon_theme', state.iconTheme);
    localStorage.setItem('ocote_lang',       state.lang);
    localStorage.setItem('ocote_prompt',     state.prompt);
  }

  // ── Tabs del modal ────────────────────────────────────────────────────────

  function switchTab(tabId) {
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.settings-tab-content').forEach(content => {
      content.classList.toggle('hidden', content.dataset.tab !== tabId);
    });
  }

  // ── Abrir / cerrar modal ────────────────────────────────────────────────

  const overlay = document.getElementById('settings-overlay');

  function openModal() {
    overlay.classList.remove('hidden');
    updateUIFromState();
    switchTab('general');
  }

  function closeModal() {
    overlay.classList.add('hidden');
  }

  document.getElementById('settings-btn').addEventListener('click', openModal);
  document.getElementById('settings-close').addEventListener('click', closeModal);
  document.getElementById('settings-backdrop').addEventListener('click', closeModal);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closeModal();
  });

  // ── Tabs del modal (click en botones) ────────────────────────────────────

  overlay.addEventListener('click', e => {
    const tabBtn = e.target.closest('.settings-tab-btn');
    if (tabBtn) switchTab(tabBtn.dataset.tab);
  });

  // ── Botones segmentados (idioma, iconos) ──────────────────────────────

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.settings-seg-btn');
    if (!btn) return;

    // Los pe-seg (editor de prompt) tienen su propio handler
    if (btn.classList.contains('pe-seg')) return;

    const setting = btn.dataset.setting;
    const value   = btn.dataset.value;
    if (!setting || value === undefined) return;

    state[setting] = value;
    persist();

    const group = overlay.querySelectorAll(`.settings-seg-btn[data-setting="${setting}"]`);
    group.forEach(b => b.classList.toggle('active', b === btn));

    if (setting === 'iconTheme') applyIconTheme(value);
    if (setting === 'lang')      applyLang(value);
  });

  // ── Theme swatches ────────────────────────────────────────────────────

  overlay.addEventListener('click', e => {
    const swatch = e.target.closest('.theme-swatch');
    if (!swatch) return;

    const themeId = swatch.dataset.theme;
    state.theme = themeId;
    persist();

    document.querySelectorAll('.theme-swatch').forEach(s => {
      s.classList.toggle('active', s.dataset.theme === themeId);
    });

    applyTheme(themeId);
  });

  // ── Select de fuente ──────────────────────────────────────────────────

  const fontSelect = document.getElementById('settings-font');
  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      state.font = fontSelect.value;
      persist();
      applyFont(state.font);
    });
  }

  // ── Select de prompt ──────────────────────────────────────────────────

  const promptSelect = document.getElementById('settings-prompt');
  if (promptSelect) {
    promptSelect.addEventListener('change', () => {
      const val = promptSelect.value;

      if (val === 'custom') {
        // Activar modo custom: construir valor desde editorCfg actual
        state.prompt = buildCustomValue();
      } else {
        state.prompt = val;
      }

      persist();
      applyPrompt(state.prompt);
      toggleEditor(state.prompt);
      syncEditorUI();

      // Abrir nueva pestaña para que el usuario vea el cambio de inmediato
      if (window.TAB_MANAGER && window.TAB_MANAGER.createTab) {
        window.TAB_MANAGER.createTab();
      }
    });
  }

  // ── Editor de prompt: botones de estilo (pe-seg) ──────────────────────

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.pe-seg');
    if (!btn) return;

    const key = btn.dataset.pkey;    // 'style'
    const val = btn.dataset.value;   // '1' o '2'
    editorCfg[key] = val;

    // Actualizar activos en el grupo
    btn.closest('.settings-segmented').querySelectorAll('.pe-seg').forEach(b => {
      b.classList.toggle('active', b === btn);
    });

    _saveEditorAndApply();
  });

  // ── Editor de prompt: círculos de color (pe-color) ────────────────────

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.pe-color');
    if (!btn) return;

    const group = btn.closest('.pe-colors');
    if (!group) return;

    const key = group.dataset.pkey;  // 'pc', 'gc', 'ac'
    const val = btn.dataset.value;   // 'teal', 'ember', etc.
    editorCfg[key] = val;

    // Actualizar activos en el grupo
    group.querySelectorAll('.pe-color').forEach(b => {
      b.classList.toggle('active', b === btn);
    });

    _saveEditorAndApply();
  });

  // ── Editor de prompt: checkboxes de segmentos ─────────────────────────

  overlay.addEventListener('change', e => {
    const cb = e.target.closest('input[data-pkey]');
    if (!cb) return;
    const key = cb.dataset.pkey;     // 'user', 'git', 'time'
    editorCfg[key] = cb.checked ? '1' : '0';
    _saveEditorAndApply();
  });

  /** Guardar config del editor → state → localStorage → preview */
  function _saveEditorAndApply() {
    state.prompt = buildCustomValue();
    persist();
    applyPrompt(state.prompt);
    updatePromptPreview();
    // No abrimos tab nuevo en cada clic del editor — solo al cambiar de preset
  }

  // ── Grid de temas ─────────────────────────────────────────────────────

  function renderThemeGrid() {
    const grid = document.getElementById('theme-grid');
    if (!grid || !window.OCOTE_THEMES) return;

    const list = window.OCOTE_THEMES.getThemeList();
    grid.innerHTML = list.map(t => `
      <button class="theme-swatch" data-theme="${t.id}" title="${t.name}">
        <span class="theme-swatch-color" style="background:${t.preview};border-color:${t.accent}"></span>
        <span class="theme-swatch-name">${t.name}</span>
      </button>
    `).join('');
  }

  // ── Inicializar ─────────────────────────────────────────────────────────
  // Si el prompt guardado es custom, parsear la config en editorCfg
  if (state.prompt.startsWith('custom')) {
    parseCustomConfig(state.prompt);
  }
  applyAll();
  if (window.I18N) window.I18N.apply();
  renderThemeGrid();

})();
