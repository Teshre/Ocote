// settings.js — Panel de configuración de Ocote
// Maneja tema, tipografía, estilo de íconos e idioma.
// Todas las preferencias se guardan en localStorage y se aplican inmediatamente.

(function () {
  'use strict';

  // ── Defaults ────────────────────────────────────────────────────────────
  const DEFAULTS = {
    theme:     'dark',
    font:      "'SF Mono', 'Menlo', 'Fira Code', 'Cascadia Code', monospace",
    iconTheme: 'seti',
    lang:      'es',
  };

  // ── Temas de xterm.js ───────────────────────────────────────────────────
  const XTERM_THEMES = {
    dark: {
      background: '#1a1a1a',
      foreground: '#e8e6df',
      cursor: '#f5a623',
      selectionBackground: 'rgba(245, 166, 35, 0.3)',
      black: '#1a1a1a', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
      blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
      brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
      brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
      brightCyan: '#56b6c2', brightWhite: '#ffffff',
    },
    light: {
      background: '#f5f5f5',
      foreground: '#1a1a1a',
      cursor: '#e67e22',
      selectionBackground: 'rgba(230, 126, 34, 0.2)',
      black: '#1a1a1a', red: '#c0392b', green: '#27ae60', yellow: '#f39c12',
      blue: '#2980b9', magenta: '#8e44ad', cyan: '#16a085', white: '#bdc3c7',
      brightBlack: '#7f8c8d', brightRed: '#e74c3c', brightGreen: '#2ecc71',
      brightYellow: '#f1c40f', brightBlue: '#3498db', brightMagenta: '#9b59b6',
      brightCyan: '#1abc9c', brightWhite: '#000000',
    },
  };

  // ── Estado actual (lee localStorage) ────────────────────────────────────
  const state = {
    theme:     localStorage.getItem('ocote_theme')      || DEFAULTS.theme,
    font:      localStorage.getItem('ocote_font')       || DEFAULTS.font,
    iconTheme: localStorage.getItem('ocote_icon_theme') || DEFAULTS.iconTheme,
    lang:      localStorage.getItem('ocote_lang')       || DEFAULTS.lang,
  };

  // ── Helpers de aplicación ───────────────────────────────────────────────

  function setXtermOption(key, value) {
    const term = window.ocoteTerminal;
    if (!term) return;
    // xterm.js v5+ usa term.options; versiones anteriores setOption
    if (term.options && typeof term.options === 'object') {
      term.options[key] = value;
    } else if (term.setOption) {
      term.setOption(key, value);
    }
  }

  function applyTheme(theme) {
    document.body.dataset.theme = theme;
    setXtermOption('theme', XTERM_THEMES[theme] || XTERM_THEMES.dark);
  }

  function applyFont(font) {
    document.documentElement.style.setProperty('--font-mono', font);
    setXtermOption('fontFamily', font);
    if (window.ocoteFitAddon) {
      window.ocoteFitAddon.fit();
    }
  }

  function applyIconTheme(iconTheme) {
    localStorage.setItem('ocote_icon_theme', iconTheme);
    if (window._explorerRefresh) window._explorerRefresh();
  }

  function applyLang(lang) {
    localStorage.setItem('ocote_lang', lang);
    // autocomplete.js y tooltip.js leen localStorage en cada uso,
    // así que no necesitamos hacer nada más aquí.
  }

  function applyAll() {
    applyTheme(state.theme);
    applyFont(state.font);
    // iconTheme y lang ya están en localStorage, pero forzamos refresh
    applyIconTheme(state.iconTheme);
    applyLang(state.lang);
  }

  // ── Sincronizar UI con estado ───────────────────────────────────────────

  function updateUIFromState() {
    // Tema
    document.querySelectorAll('[data-setting="theme"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.theme);
    });

    // Tipografía
    const fontSelect = document.getElementById('settings-font');
    if (fontSelect) {
      // Buscar la opción que coincida exactamente con el valor guardado
      let matched = false;
      for (const opt of fontSelect.options) {
        if (opt.value === state.font) {
          opt.selected = true;
          matched = true;
          break;
        }
      }
      if (!matched) {
        // Si no hay match (ej. fuente personalizada futura), seleccionar "Sistema"
        fontSelect.options[0].selected = true;
      }
    }

    // Íconos
    document.querySelectorAll('[data-setting="iconTheme"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.iconTheme);
    });

    // Idioma
    document.querySelectorAll('[data-setting="lang"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.lang);
    });
  }

  // ── Persistir estado ────────────────────────────────────────────────────

  function persist() {
    localStorage.setItem('ocote_theme', state.theme);
    localStorage.setItem('ocote_font', state.font);
    localStorage.setItem('ocote_icon_theme', state.iconTheme);
    localStorage.setItem('ocote_lang', state.lang);
  }

  // ── Abrir / cerrar panel ────────────────────────────────────────────────

  const overlay = document.getElementById('settings-overlay');

  function openPanel() {
    overlay.classList.remove('hidden');
    updateUIFromState();
  }

  function closePanel() {
    overlay.classList.add('hidden');
  }

  document.getElementById('settings-btn').addEventListener('click', openPanel);
  document.getElementById('settings-close').addEventListener('click', closePanel);
  document.getElementById('settings-backdrop').addEventListener('click', closePanel);

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape') closePanel();
  });

  // ── Manejar clicks en botones segmentados ─────────────────────────────

  overlay.addEventListener('click', e => {
    const btn = e.target.closest('.settings-seg-btn');
    if (!btn) return;

    const setting = btn.dataset.setting;
    const value   = btn.dataset.value;
    if (!setting || value === undefined) return;

    // Actualizar estado
    state[setting] = value;
    persist();

    // Actualizar UI visual del grupo
    const group = overlay.querySelectorAll(`.settings-seg-btn[data-setting="${setting}"]`);
    group.forEach(b => b.classList.toggle('active', b === btn));

    // Aplicar cambio
    if (setting === 'theme')     applyTheme(value);
    if (setting === 'iconTheme') applyIconTheme(value);
    if (setting === 'lang')      applyLang(value);
  });

  // ── Manejar cambio en select de fuente ──────────────────────────────────

  const fontSelect = document.getElementById('settings-font');
  if (fontSelect) {
    fontSelect.addEventListener('change', () => {
      state.font = fontSelect.value;
      persist();
      applyFont(state.font);
    });
  }

  // ── Aplicar preferencias guardadas al cargar la app ─────────────────────
  applyAll();

})();
