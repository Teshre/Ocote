// settings.js — Panel de configuración de Ocote (modal centrado con tabs)
// Maneja tema, tipografía, estilo de íconos, idioma y preset de prompt.
// Todas las preferencias se guardan en localStorage y se aplican inmediatamente.

(function () {
  'use strict';

  // ── Defaults ────────────────────────────────────────────────────────────
  const DEFAULTS = {
    theme:               'ocote',
    font:                "'JetBrainsMono Nerd Font Mono', 'JetBrainsMonoNL Nerd Font Mono', 'MesloLGS NF', 'FiraCode Nerd Font Propo', 'Hack Nerd Font', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    iconTheme:           'seti',
    lang:                'es',
    prompt:              'pill',
    appIcon:             'light',
    fontSize:            14,
    cursorStyle:         'block',
    scrollback:          10000,
    systemNotifications: true,   // notificaciones del SO activadas por defecto
    notifThreshold:      5,      // avisar solo si el comando tardó ≥ 5 segundos
  };

  // Migración: los IDs viejos ('dark'/'light' + temas ajenos) ya no existen.
  // Mapear lo razonable al nuevo set oficial; cualquier otro → 'ocote'.
  function migrateThemeId(id) {
    if (!id) return DEFAULTS.theme;
    if (window.OCOTE_THEMES?.THEMES?.[id]) return id;  // ya es un tema válido
    const map = { dark: 'ocote', light: 'papel' };     // equivalentes más cercanos
    return map[id] || DEFAULTS.theme;
  }

  // ── Estado actual (lee localStorage) ────────────────────────────────────
  const state = {
    theme:               migrateThemeId(localStorage.getItem('ocote_theme')),
    font:                localStorage.getItem('ocote_font')         || DEFAULTS.font,
    iconTheme:           localStorage.getItem('ocote_icon_theme')   || DEFAULTS.iconTheme,
    lang:                localStorage.getItem('ocote_lang')         || DEFAULTS.lang,
    prompt:              localStorage.getItem('ocote_prompt')       || DEFAULTS.prompt,
    appIcon:             localStorage.getItem('ocote_app_icon')     || DEFAULTS.appIcon,
    fontSize:            parseInt(localStorage.getItem('ocote_font_size') || DEFAULTS.fontSize),
    cursorStyle:         localStorage.getItem('ocote_cursor_style') || DEFAULTS.cursorStyle,
    scrollback:          parseInt(localStorage.getItem('ocote_scrollback') || DEFAULTS.scrollback),
    // Notificaciones: 'false' explícito = desactivado; cualquier otra cosa = activado
    systemNotifications: localStorage.getItem('ocote_system_notifications') !== 'false',
    notifThreshold:      parseInt(localStorage.getItem('ocote_notif_threshold') || DEFAULTS.notifThreshold),
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

  // El PS1 base se fija al arrancar zsh; cambiar preset requiere re-spawn
  // del tab activo para que el shell nazca con el nuevo OCOTE_PROMPT_PRESET.
  function applyPrompt(preset) {
    localStorage.setItem('ocote_prompt', preset);
  }

  // invoke puede estar en window.__TAURI__.invoke o window.__TAURI__.tauri.invoke
  // según la versión; usamos la misma ruta que terminal.js confirma que funciona.
  const _invoke = window.__TAURI__?.invoke ?? window.__TAURI__?.tauri?.invoke ?? null;

  function applyAppIcon(variant) {
    localStorage.setItem('ocote_app_icon', variant);
    if (_invoke) {
      _invoke('set_app_icon', { variant }).catch(e => console.warn('set_app_icon:', e));
    }
  }

  function applyFontSize(size) {
    // Clamp entre 10 y 20
    size = Math.max(10, Math.min(20, size));
    state.fontSize = size;
    localStorage.setItem('ocote_font_size', size);
    const display = document.getElementById('font-size-display');
    if (display) display.textContent = size + 'px';
    setXtermOption('fontSize', size);
    // Re-fit todos los tabs después de cambiar tamaño — cambia las dimensiones de celda
    if (window.TAB_MANAGER) {
      window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => {
        if (tab?.fitAddon) tab.fitAddon.fit();
      });
    }
  }

  function applyCursorStyle(style) {
    localStorage.setItem('ocote_cursor_style', style);
    setXtermOption('cursorStyle', style);
  }

  function applyScrollback(lines) {
    localStorage.setItem('ocote_scrollback', lines);
    setXtermOption('scrollback', lines);
  }

  function applyAll() {
    applyTheme(state.theme);
    applyFont(state.font);
    applyIconTheme(state.iconTheme);
    applyLang(state.lang);
    applyPrompt(state.prompt);
    applyFontSize(state.fontSize);
    applyCursorStyle(state.cursorStyle);
    applyScrollback(state.scrollback);
    // El ícono de la app se aplica al arrancar solo si difiere del default
    // (en dev mode set_app_icon puede no estar disponible)
    if (state.appIcon !== DEFAULTS.appIcon && window.__TAURI__) {
      applyAppIcon(state.appIcon);
    }
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

    document.querySelectorAll('[data-setting="iconTheme"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.iconTheme);
    });

    document.querySelectorAll('.theme-swatch').forEach(swatch => {
      swatch.classList.toggle('active', swatch.dataset.theme === state.theme);
    });

    // Ícono de app
    document.querySelectorAll('.icon-variant-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.icon === state.appIcon);
    });

    // Tamaño de fuente
    const display = document.getElementById('font-size-display');
    if (display) display.textContent = state.fontSize + 'px';

    // Cursor style y scrollback (segmented buttons)
    document.querySelectorAll('[data-setting="cursorStyle"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === state.cursorStyle);
    });
    document.querySelectorAll('[data-setting="scrollback"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === String(state.scrollback));
    });

    // Notificaciones
    const notifToggle = document.getElementById('toggle-system-notif');
    if (notifToggle) notifToggle.checked = state.systemNotifications;
    syncNotifThresholdVisibility();

    // Workspaces (estado real desde OCOTE_WORKSPACES)
    const wsToggle = document.getElementById('toggle-workspaces');
    if (wsToggle) wsToggle.checked = window.OCOTE_WORKSPACES?.isEnabled?.() || false;

    document.querySelectorAll('[data-setting="notifThreshold"]').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.value === String(state.notifThreshold));
    });
  }

  // Ocultar la fila de umbral cuando las notificaciones están desactivadas
  function syncNotifThresholdVisibility() {
    const row = document.getElementById('notif-threshold-row');
    if (row) row.style.opacity = state.systemNotifications ? '1' : '0.35';
  }

  // ── Persistir estado ────────────────────────────────────────────────────

  function persist() {
    localStorage.setItem('ocote_theme',                state.theme);
    localStorage.setItem('ocote_font',                 state.font);
    localStorage.setItem('ocote_icon_theme',           state.iconTheme);
    localStorage.setItem('ocote_lang',                 state.lang);
    localStorage.setItem('ocote_prompt',               state.prompt);
    localStorage.setItem('ocote_app_icon',             state.appIcon);
    localStorage.setItem('ocote_font_size',            state.fontSize);
    localStorage.setItem('ocote_cursor_style',         state.cursorStyle);
    localStorage.setItem('ocote_scrollback',           state.scrollback);
    localStorage.setItem('ocote_system_notifications', state.systemNotifications ? 'true' : 'false');
    localStorage.setItem('ocote_notif_threshold',      state.notifThreshold);
  }

  // ── Tabs del modal ────────────────────────────────────────────────────────

  function switchTab(tabId) {
    document.querySelectorAll('.settings-tab-btn').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.tab === tabId);
    });
    document.querySelectorAll('.settings-tab-content').forEach(content => {
      content.classList.toggle('hidden', content.dataset.tab !== tabId);
    });
    if (tabId === 'appearance') {
      renderPromptPicker();
      renderIconPreview(state.iconTheme);
    }
    if (tabId === 'aliases' && window.loadAliases) {
      window.loadAliases();
    }
  }

  // ── Preview en vivo de íconos ────────────────────────────────────────────
  // Muestra una cuadrícula de archivos y carpetas representativos con el tema
  // de íconos seleccionado. Se actualiza sin cerrar la configuración.

  const ICON_PREVIEW_FILES = [
    'index.js', 'main.rs', 'styles.css', 'App.tsx',
    'README.md', 'config.json', 'script.sh', 'image.png',
  ];
  const ICON_PREVIEW_FOLDERS = ['src', 'node_modules', 'docs', 'dist'];

  function renderIconPreview(theme) {
    const el = document.getElementById('icon-theme-preview');
    if (!el || !window.ICON_SET?.getIconHtmlForTheme) return;

    const IS = window.ICON_SET;

    // Archivos
    const fileHtml = ICON_PREVIEW_FILES.map(name =>
      `<div class="iprev-item">
         <span class="explorer-icon">${IS.getIconHtmlForTheme(name, theme)}</span>
         <span class="iprev-name">${name}</span>
       </div>`
    ).join('');

    // Separador + Carpetas
    const folderHtml = ICON_PREVIEW_FOLDERS.map(name =>
      `<div class="iprev-item">
         <span class="explorer-icon">${IS.getFolderHtmlForTheme(name, theme)}</span>
         <span class="iprev-name">${name}</span>
       </div>`
    ).join('');

    el.innerHTML = fileHtml +
      '<div class="iprev-separator"></div>' +
      folderHtml;
  }

  // ── Prompt picker ───────────────────────────────────────────────────────

  const PROMPT_META = { cwd: '~/dev', branch: 'main', dirty: 2, time: '14:32', exit: 0 };
  const PROMPT_PRESETS = [
    { id: 'pill',        name: 'Pill',            tag: 'Marca', desc: 'Cápsulas redondeadas. La firma de Ocote.' },
    { id: 'block',       name: 'Block',           tag: 'Pro',   desc: 'Cada comando es una tarjeta, estilo Warp.' },
    { id: 'minimal',     name: 'Minimal',         tag: null,    desc: 'Solo tipografía. Limpio y silencioso.' },
    { id: 'ribbon',      name: 'Ribbon',          tag: null,    desc: 'Subrayado tenue tipo tab-indicator.' },
    { id: 'rail',        name: 'Rail',            tag: null,    desc: 'Riel vertical que ancla el prompt.' },
    { id: 'passthrough', name: 'Mi configuración',tag: null,    desc: 'Respeta tu prompt nativo (p10k, omz).' },
  ];

  function alpha(hex, value) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${value})`;
  }

  function currentTokens() {
    return window.OCOTE_THEMES?.getCurrentTokens?.() ?? {
      accent: '#E8843A', green: '#7DC97A', blue: '#82A6E0',
      comment: '#6F6552', warning: '#E8C03A', fg: '#E2D6BD', bg: '#14100C',
    };
  }

  // SVGs para los previews en settings (mismo estilo que prompt.js pero inline)
  const _svgF = (c, s=11) =>
    `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
    `<path d="M1.5 4.2C1.5 3.5 2 3 2.7 3H6L7.2 4.2H13.3C14 4.2 14.5 4.7 14.5 5.4V11.6` +
    `C14.5 12.3 14 12.8 13.3 12.8H2.7C2 12.8 1.5 12.3 1.5 11.6Z" ` +
    `fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/></svg>`;
  const _svgB = (c, s=10) =>
    `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
    `<circle cx="4" cy="3.5" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
    `<circle cx="4" cy="12.5" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
    `<circle cx="12" cy="8" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
    `<path d="M4 5.1V10.9M5.6 3.5H10C11.1 3.5 12 4.4 12 5.5V6.4" ` +
    `fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`;
  const _svgC = (c, s=10) =>
    `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
    `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
    `<path d="M8 4.6V8L10.4 9.4" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`;

  function promptInfoHtml(presetId, t) {
    if (presetId === 'passthrough') {
      return `<div style="display:flex;align-items:stretch;height:18px">` +
        `<span style="background:${t.blue};color:${t.bg};padding:0 6px;display:inline-flex;align-items:center;font-size:9px">~/src</span>` +
        `<span style="background:${t.green};color:${t.bg};padding:0 6px;display:inline-flex;align-items:center;font-size:9px">main</span>` +
        `</div><div style="margin-top:4px;color:${t.fg}">$ _</div>`;
    }
    // Ribbon usa layout específico con iconos — el renderer de la terminal usa
    // position:relative + height:100% que no funciona fuera del contexto de decoration.
    if (presetId === 'ribbon') {
      const git = PROMPT_META.branch
        ? `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green}">` +
          `${_svgB(t.green)}${PROMPT_META.branch}` +
          (PROMPT_META.dirty > 0 ? `<span style="color:${t.warning};font-weight:600;margin-left:1px">+${PROMPT_META.dirty}</span>` : '') +
          `</span>`
        : '';
      return (
        `<div style="display:inline-flex;align-items:center;gap:11px;` +
        `padding:2px 0 6px;border-bottom:1.5px solid ${t.accent};` +
        `position:relative;max-width:100%">` +
        `<span style="position:absolute;left:0;right:0;bottom:-1.5px;height:1.5px;` +
        `background:linear-gradient(90deg,${t.accent} 0%,transparent 100%)"></span>` +
        `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.accent};font-weight:600">` +
        `${_svgF(t.accent)}${PROMPT_META.cwd}</span>` +
        git +
        `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.comment};font-size:.9em">` +
        `${_svgC(t.comment)}${PROMPT_META.time}</span>` +
        `</div>`
      );
    }
    return window.OCOTE_PROMPT?.previewHtml?.(presetId, PROMPT_META, t) || '';
  }

  function blockPreview(t) {
    const a = alpha;
    const header = window.OCOTE_PROMPT?.previewHtml?.('block', PROMPT_META, t) || '';
    return (
      `<div style="border:1px solid ${a(t.accent,.22)};border-left:2px solid ${t.accent};` +
      `border-radius:6px;overflow:hidden;font-size:inherit">` +
      `<div style="padding:7px 10px;border-bottom:1px solid ${a(t.accent,.14)}">${header}</div>` +
      `<div style="padding:8px 10px 10px">` +
      `<div style="display:flex;align-items:center;gap:7px">` +
      `<span style="color:${t.accent};font-weight:600;font-size:14px;line-height:1">❯</span>` +
      `<span style="color:${t.fg};font-size:11px">cargo run</span>` +
      `</div>` +
      `<div style="color:${t.comment};padding-left:20px;margin-top:3px;font-size:10.5px">` +
      `Compiling <span style="color:${t.blue}">proyecto</span> v0.1.0</div>` +
      `<div style="color:${t.comment};padding-left:20px;font-size:10.5px">` +
      `<span style="color:${t.green}">Finished</span> release in 0.84s</div>` +
      `</div>` +
      `</div>`
    );
  }

  // Preview de Rail para el pane grande — usa stripe de altura fija (no height:100%)
  // para evitar que el gradiente se estire a toda la altura del contenedor.
  function railBigPreview(t) {
    const a = alpha;
    const git = PROMPT_META.branch
      ? `<span style="color:${a(t.comment,.6)}">·</span>` +
        `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green}">` +
        `<svg viewBox="0 0 16 16" width="10" height="10" style="vertical-align:-1px"><circle cx="4" cy="3.5" r="1.6" fill="none" stroke="${t.green}" stroke-width="1.3"/><circle cx="4" cy="12.5" r="1.6" fill="none" stroke="${t.green}" stroke-width="1.3"/><circle cx="12" cy="8" r="1.6" fill="none" stroke="${t.green}" stroke-width="1.3"/><path d="M4 5.1V10.9M5.6 3.5H10C11.1 3.5 12 4.4 12 5.5V6.4" fill="none" stroke="${t.green}" stroke-width="1.3" stroke-linecap="round"/></svg>` +
        `${PROMPT_META.branch}` +
        (PROMPT_META.dirty > 0 ? `<span style="color:${t.warning}">+${PROMPT_META.dirty}</span>` : '') +
        `</span>`
      : '';
    const info =
      `<div style="display:flex;align-items:center;gap:10px;margin-bottom:8px">` +
      `<div style="width:3px;height:20px;flex-shrink:0;border-radius:2px;` +
      `background:linear-gradient(180deg,${t.accent} 0%,${a(t.accent,.35)} 100%)"></div>` +
      `<div style="display:inline-flex;align-items:center;gap:8px;font-size:12px">` +
      `<span style="color:${t.accent};font-weight:600">` +
      `<svg viewBox="0 0 16 16" width="11" height="11" style="vertical-align:-2px;margin-right:4px"><path d="M1.5 4.2C1.5 3.5 2 3 2.7 3H6L7.2 4.2H13.3C14 4.2 14.5 4.7 14.5 5.4V11.6C14.5 12.3 14 12.8 13.3 12.8H2.7C2 12.8 1.5 12.3 1.5 11.6Z" fill="none" stroke="${t.accent}" stroke-width="1.3" stroke-linejoin="round"/></svg>` +
      `${PROMPT_META.cwd}</span> ${git} ` +
      `<span style="color:${a(t.comment,.6)}">·</span>` +
      `<span style="color:${t.comment};font-size:11px">${PROMPT_META.time}</span>` +
      `</div></div>`;
    return info;
  }

  function renderPromptBigPreview(presetId) {
    const t = currentTokens();
    const el = document.getElementById('prompt-preview');
    if (!el) return;
    if (presetId === 'block') {
      el.innerHTML = blockPreview(t);
      return;
    }
    if (presetId === 'passthrough') {
      el.innerHTML = `${promptInfoHtml(presetId, t)}<div style="margin-top:7px;color:${t.fg}">cargo run<span class="ppv-blink"></span></div>`;
      return;
    }
    // Rail: el renderer genérico usa height:100% que se estira en el pane grande.
    // Usamos un renderer propio con stripe de altura fija.
    if (presetId === 'rail') {
      const out = `<div style="color:${t.comment};padding-left:22px;margin-top:5px">` +
        `Compiling <span style="color:${t.blue}">proyecto</span> v0.1.0</div>` +
        `<div style="color:${t.comment};padding-left:22px">` +
        `<span style="color:${t.green}">Finished</span> release in 0.84s</div>`;
      const promptChar = `<span style="color:${t.accent};font-weight:600;font-size:15px">❯</span>`;
      const cmd = `<div style="display:flex;align-items:center;gap:8px;margin-top:2px">${promptChar}<span style="color:${t.fg}">cargo run</span><span class="ppv-blink"></span></div>`;
      el.innerHTML = `${railBigPreview(t)}${cmd}${out}`;
      return;
    }

    const out = `<div style="color:${t.comment};padding-left:22px;margin-top:5px">` +
      `Compiling <span style="color:${t.blue}">proyecto</span> v0.1.0</div>` +
      `<div style="color:${t.comment};padding-left:22px">` +
      `<span style="color:${t.green}">Finished</span> release in 0.84s</div>`;

    // Minimal: previewHtml ya incluye el ❯, no agregar otro encima.
    if (presetId === 'minimal') {
      const git = PROMPT_META.branch
        ? ` <span style="color:${t.green}"> ${PROMPT_META.branch}` +
          (PROMPT_META.dirty > 0 ? ` <span style="color:${t.warning}">+${PROMPT_META.dirty}</span>` : '') +
          `</span>`
        : '';
      const path = `<div><span style="color:${t.comment}">${PROMPT_META.cwd}</span>` +
        `${git} <span style="color:${t.comment}">· ${PROMPT_META.time}</span></div>`;
      const cmdLine = `<div style="margin-top:2px"><span style="color:${t.accent};font-weight:700;font-size:15px">❯</span>` +
        ` <span style="color:${t.fg}">cargo run</span><span class="ppv-blink"></span></div>`;
      el.innerHTML = `<div style="line-height:1.75">${path}${cmdLine}</div>${out}`;
      return;
    }

    const info = promptInfoHtml(presetId, t);
    const promptChar = `<span style="color:${t.accent};font-weight:600;font-size:15px">❯</span>`;
    const cmd = `<div style="display:flex;align-items:center;gap:8px;margin-top:7px">${promptChar}<span style="color:${t.fg}">cargo run</span><span class="ppv-blink"></span></div>`;
    el.innerHTML = `${info}${cmd}${out}`;
  }

  function renderPromptGrid() {
    const t = currentTokens();
    const grid = document.getElementById('prompt-preset-grid');
    if (!grid) return;
    const cur = localStorage.getItem('ocote_prompt') || DEFAULTS.prompt;
    grid.innerHTML = PROMPT_PRESETS.map(p => `
      <button class="prompt-preset-card ${p.id === cur ? 'active' : ''}" data-prompt="${p.id}">
        <div class="ppc-mini">${p.id === 'block' ? blockPreview(t) : promptInfoHtml(p.id, t)}</div>
        <div class="ppc-meta">
          <div class="ppc-name">${p.name}${p.tag ? `<span class="ppc-tag">${p.tag}</span>` : ''}</div>
          <div class="ppc-desc">${p.desc}</div>
        </div>
      </button>
    `).join('');
  }

  function renderPromptPicker() {
    renderPromptGrid();
    renderPromptBigPreview(localStorage.getItem('ocote_prompt') || DEFAULTS.prompt);
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

  // Toggle de notificaciones del sistema
  document.getElementById('toggle-system-notif')?.addEventListener('change', (e) => {
    state.systemNotifications = e.target.checked;
    persist();
    syncNotifThresholdVisibility();
  });

  // Toggle de workspaces (opt-in) — delega en OCOTE_WORKSPACES
  document.getElementById('toggle-workspaces')?.addEventListener('change', (e) => {
    window.OCOTE_WORKSPACES?.setEnabled?.(e.target.checked);
  });

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

    if (setting === 'iconTheme')      { applyIconTheme(value); renderIconPreview(value); }
    if (setting === 'lang')             applyLang(value);
    if (setting === 'cursorStyle')      applyCursorStyle(value);
    if (setting === 'scrollback')       applyScrollback(parseInt(value));
    if (setting === 'notifThreshold')   state.notifThreshold = parseInt(value);
  });

  // ── Ícono de la app ───────────────────────────────────────────────────

  overlay.addEventListener('click', e => {
    const iconBtn = e.target.closest('.icon-variant-btn');
    if (!iconBtn) return;
    const variant = iconBtn.dataset.icon;
    state.appIcon = variant;
    persist();
    document.querySelectorAll('.icon-variant-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.icon === variant);
    });
    applyAppIcon(variant);
  });

  // ── Font size stepper ─────────────────────────────────────────────────

  document.getElementById('font-size-dec')?.addEventListener('click', () => {
    applyFontSize(state.fontSize - 1);
    persist();
  });
  document.getElementById('font-size-inc')?.addEventListener('click', () => {
    applyFontSize(state.fontSize + 1);
    persist();
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
    renderPromptPicker();
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

  // ── Prompt picker ─────────────────────────────────────────────────────

  const promptGrid = document.getElementById('prompt-preset-grid');
  if (promptGrid) {
    promptGrid.addEventListener('click', e => {
      const card = e.target.closest('.prompt-preset-card');
      if (!card) return;
      state.prompt = card.dataset.prompt;
      persist();
      applyPrompt(state.prompt);
      renderPromptPicker();
      window.TAB_MANAGER?.respawnActive?.();
    });
    promptGrid.addEventListener('mouseover', e => {
      const card = e.target.closest('.prompt-preset-card');
      if (card) renderPromptBigPreview(card.dataset.prompt);
    });
    promptGrid.addEventListener('mouseout', () => {
      renderPromptBigPreview(localStorage.getItem('ocote_prompt') || DEFAULTS.prompt);
    });
  }

  // ── Grid de temas — card con mini-preview de terminal ─────────────────────
  // Porteado de ocote-themes/gallery.js: muestra un mini-terminal coloreado con
  // la paleta ANSI real del tema, su nombre, descripción y swatches de paleta.

  function themeCard(t) {
    const isLight = t.type === 'light';
    const a = t.ansi, fg = t.fg, c = t.comment;
    // helpers de coloreado (índices ANSI: 1 red, 2 green, 3 yellow, 4 blue, 5 magenta, 6 cyan)
    const S = (i, s, bold) => `<span class="${bold ? 'b' : ''}" style="color:${a[i]}">${s}</span>`;
    const F = (s) => `<span style="color:${fg}">${s}</span>`;
    const D = (s) => `<span style="color:${c}">${s}</span>`;
    const chev = `<span style="color:${t.cursor}">❯</span>`;
    const prompt = `${S(6, '~/ocote', 1)} ${S(2, '⎇ main', 0)} ${chev} `;

    // Mini-sesión: 2 comandos cortos para que quepa en la card
    const body = [
      `${prompt}${F('ls')}`,
      `${S(4, 'src/', 1)} ${S(2, 'build.sh', 1)} ${F('README')} ${S(5, 'ocote.toml', 0)}`,
      `${prompt}${F('cat')} ${S(3, 'theme.rs', 0)}`,
      `${S(5, 'pub fn', 0)} ${S(4, 'load', 0)}() ${D('// lumbre')}`,
      `${prompt}<span class="tsw-cur" style="background:${t.cursor}"></span>`,
    ].join('\n');

    const barBg = isLight ? 'rgba(0,0,0,.05)' : 'rgba(255,255,255,.04)';
    // Swatches: una muestra representativa de la paleta (red, green, yellow, blue, magenta, cyan)
    const palette = [a[1], a[2], a[3], a[4], a[5], a[6], t.cursor]
      .map(hex => `<i style="background:${hex}"></i>`).join('');

    return `
      <button class="theme-swatch" data-theme="${t.id}" title="${t.name} — ${t.desc || ''}">
        <div class="tsw-preview" style="background:${t.bg}">
          <div class="tsw-bar" style="background:${barBg}">
            <span class="tsw-dot" style="background:#ff5f57"></span>
            <span class="tsw-dot" style="background:#febc2e"></span>
            <span class="tsw-dot" style="background:#28c840"></span>
            <span class="tsw-title" style="color:${t.fg}">ocote — ${t.id}</span>
          </div>
          <div class="tsw-body" style="color:${t.fg}">${body}</div>
        </div>
        <div class="tsw-meta">
          <div class="tsw-name">${t.name}<span class="tsw-tag">${isLight ? 'Claro' : 'Oscuro'}</span></div>
          <div class="tsw-desc">${t.desc || ''}</div>
          <div class="tsw-palette">${palette}</div>
        </div>
      </button>`;
  }

  function renderThemeGrid() {
    const grid = document.getElementById('theme-grid');
    if (!grid || !window.OCOTE_THEMES) return;

    const list = window.OCOTE_THEMES.getThemeList();
    grid.innerHTML = list.map(t => themeCard(t)).join('');
  }

  // ── Inicializar ─────────────────────────────────────────────────────────
  applyAll();
  if (window.I18N) window.I18N.apply();
  renderThemeGrid();
  renderPromptPicker();

})();
