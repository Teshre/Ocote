// settings.js — Panel de configuración de Ocote (modal centrado con tabs)
// Maneja tema, tipografía, estilo de íconos, idioma y preset de prompt.
// Todas las preferencias se guardan en localStorage y se aplican inmediatamente.

(function () {
  'use strict';

  // ── Defaults ────────────────────────────────────────────────────────────
  const DEFAULTS = {
    theme:     'dark',
    font:      "'JetBrainsMono Nerd Font Mono', 'JetBrainsMonoNL Nerd Font Mono', 'MesloLGS NF', 'FiraCode Nerd Font Propo', 'Hack Nerd Font', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    iconTheme: 'seti',
    lang:      'es',
    prompt:    'pill',  // Preset por defecto — firma visual de Ocote
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

  // El prompt se aplica al crear el shell; tabs abiertos usan OCOTE_PROMPT.refresh()
  // para repintar las decoraciones con el nuevo preset sin reiniciar el shell.
  function applyPrompt(preset) {
    localStorage.setItem('ocote_prompt', preset);
    window.OCOTE_PROMPT?.refresh?.();
  }

  function applyAll() {
    applyTheme(state.theme);
    applyFont(state.font);
    applyIconTheme(state.iconTheme);
    applyLang(state.lang);
    applyPrompt(state.prompt);
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
      let matched = false;
      for (const opt of promptSelect.options) {
        if (opt.value === state.prompt) { opt.selected = true; matched = true; break; }
      }
      if (!matched) promptSelect.options[0].selected = true;
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

  // ── Tabs del modal (click) ────────────────────────────────────────────────

  overlay.addEventListener('click', e => {
    const tabBtn = e.target.closest('.settings-tab-btn');
    if (tabBtn) switchTab(tabBtn.dataset.tab);
  });

  // ── Botones segmentados (idioma, íconos) ──────────────────────────────

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.settings-seg-btn');
    if (!btn) return;

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
      state.prompt = promptSelect.value;
      persist();
      applyPrompt(state.prompt);

      // Abrir nueva pestaña: el nuevo preset se aplica al crear el shell.
      // Los tabs existentes ya ven el cambio vía OCOTE_PROMPT.refresh() en applyPrompt.
      if (window.TAB_MANAGER && window.TAB_MANAGER.createTab) {
        window.TAB_MANAGER.createTab();
      }
    });
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
  applyAll();
  if (window.I18N) window.I18N.apply();
  renderThemeGrid();

})();
