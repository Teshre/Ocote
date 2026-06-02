// themes.js — Temas oficiales de Ocote.
// ---------------------------------------------------------------------------
// Los 8 temas se generan PROGRAMÁTICAMENTE desde OCOTE_THEME_DATA (la misma
// fuente que el repo github.com/Teshre/ocote-themes). Cada entrada trae:
//   bg, fg, cursor, cursorText, selection, comment + ansi[16] (paleta base16).
// De ahí derivamos:
//   - xterm:  paleta para xterm.js
//   - css:    CSS variables de la UI (bg/sidebar/input se calculan del bg)
//   - tokens: {accent, green, blue, comment, warning, fg} para los prompts
//
// Para agregar/quitar un tema: editar OCOTE_THEME_DATA. Nada más.

(function () {
  'use strict';

  // ── Fuente de verdad: paletas oficiales de Ocote (base16) ─────────────────
  // Espejo de ocote-themes/ocote-themes.js. ansi = [black,red,green,yellow,
  // blue,magenta,cyan,white, brightBlack..brightWhite].
  const OCOTE_THEME_DATA = [
    { id: 'ocote',  name: 'Ocote',  type: 'dark',
      desc: 'Carbón y lumbre. La firma de la casa.',
      bg: '#14100C', fg: '#E7DCC6', cursor: '#E8843A', cursorText: '#14100C',
      selection: '#3A2E1C', comment: '#6B6253',
      ansi: ['#2A2218','#E8635A','#7DC97A','#E8B43A','#82A6E0','#C58AE0','#6DD8C8','#D8CDB6',
             '#4A3E2C','#F2847B','#97D894','#F2C863','#A0BEE8','#D6A6EC','#92E6D8','#FAF6EC'] },
    { id: 'brasa',  name: 'Brasa',  type: 'dark',
      desc: 'Rescoldos al rojo. Cálido e intenso.',
      bg: '#1A0F0A', fg: '#F0D8C0', cursor: '#FF7A4D', cursorText: '#1A0F0A',
      selection: '#45261A', comment: '#7A6150',
      ansi: ['#36241A','#F2685A','#B8C24A','#F0B23A','#9AA6E0','#E68AA2','#6BC8B8','#E8D0BC',
             '#5A3A28','#FF8A6A','#CCD66A','#FFC95E','#B4BEEC','#F2A6BA','#8EE0D2','#FBEAD8'] },
    { id: 'bosque', name: 'Bosque', type: 'dark',
      desc: 'Verde de monte y resina.',
      bg: '#0E1410', fg: '#CFE5D2', cursor: '#7DC97A', cursorText: '#0E1410',
      selection: '#1E3023', comment: '#5C6E5E',
      ansi: ['#1C2A20','#E2706A','#6FC56E','#C8B84A','#6DAE9E','#B894D0','#5FD0B8','#BCD4BE',
             '#35503E','#F08A82','#8FD88C','#DCCC66','#8FC4B6','#CEAAE2','#82E0CC','#E4F0E2'] },
    { id: 'noche',  name: 'Noche',  type: 'dark',
      desc: 'Azules profundos para la madrugada.',
      bg: '#0C0E16', fg: '#CBD4EC', cursor: '#82A6E0', cursorText: '#0C0E16',
      selection: '#232A40', comment: '#5A6178',
      ansi: ['#20253A','#E2727E','#7CC596','#D8C062','#7AA0E8','#B79AE0','#6DD8D0','#BAC2DC',
             '#3A4260','#F08A96','#98D8AE','#E8D484','#9CBAF0','#CEB4EC','#8EE6DE','#E6ECFA'] },
    { id: 'papel',  name: 'Papel',  type: 'light',
      desc: 'Claro, de día. Tinta sobre papel cálido.',
      bg: '#F5EFE2', fg: '#3A2E20', cursor: '#C25C1F', cursorText: '#F5EFE2',
      selection: '#E0D0AC', comment: '#9A8C76',
      ansi: ['#4A3E2E','#C0392B','#5E7A28','#A8761A','#2C6CA0','#9B4D8E','#2A8A7A','#D8CCB4',
             '#6E6353','#D04A38','#6E8A30','#C28A24','#3A7CB0','#A85C9C','#36A090','#EFE8D8'] },
    { id: 'tinta',  name: 'Tinta',  type: 'dark',
      desc: 'Casi monocromo. Negro tinta, acento brasa.',
      bg: '#101012', fg: '#D8D6D0', cursor: '#E8843A', cursorText: '#101012',
      selection: '#2C2C30', comment: '#62626A',
      ansi: ['#2A2A2E','#D0726A','#9AA890','#C8B86A','#8A9AB0','#B0A0B8','#80B8B4','#C4C2BC',
             '#4A4A50','#E08A80','#B2C0A8','#DCCC84','#A6B4C8','#C6B6CE','#98CEC8','#EEECE6'] },
    { id: 'mezcal', name: 'Mezcal', type: 'dark',
      desc: 'Agave y oro. Terroso y dorado.',
      bg: '#13110E', fg: '#E0D8C8', cursor: '#D9A441', cursorText: '#13110E',
      selection: '#36301E', comment: '#6E6450',
      ansi: ['#2C2818','#DA6E54','#A8B84A','#D9A441','#8AA6C0','#C28AA8','#6FC8AE','#D2C8B0',
             '#4E462C','#EC8A6E','#C0D066','#ECC468','#A6BED4','#DCA6C2','#8EE0C8','#F2EAD6'] },
    { id: 'cacao',  name: 'Cacao',  type: 'dark',
      desc: 'Chocolate amargo y ámbar.',
      bg: '#160F0C', fg: '#E8D6C4', cursor: '#C77B4A', cursorText: '#160F0C',
      selection: '#3A281E', comment: '#766052',
      ansi: ['#2E2018','#E0705C','#9AC97A','#E8A84A','#A89AD0','#CE8AB0','#74C8B0','#D8C4B0',
             '#4E382A','#F08A74','#B2D896','#F4C268','#BEB2E0','#E2A6C6','#92E0CC','#F4E6D6'] },
  ];

  // ── Helpers de color ───────────────────────────────────────────────────────
  function toRgb(hex) {
    const h = hex.replace('#', '');
    return { r: parseInt(h.slice(0,2),16), g: parseInt(h.slice(2,4),16), b: parseInt(h.slice(4,6),16) };
  }
  function rgba(hex, o) { const c = toRgb(hex); return `rgba(${c.r},${c.g},${c.b},${o})`; }

  /** Aclara/oscurece un hex por un factor: amount>0 aclara, <0 oscurece. */
  function shade(hex, amount) {
    const c = toRgb(hex);
    const adj = (v) => Math.max(0, Math.min(255, Math.round(v + 255 * amount)));
    const h = (v) => adj(v).toString(16).padStart(2, '0');
    return `#${h(c.r)}${h(c.g)}${h(c.b)}`;
  }

  // ── Generar un tema completo desde su entrada base16 ──────────────────────
  function buildTheme(d) {
    const isLight = d.type === 'light';
    const accent  = d.cursor;        // el cursor es el acento de marca del tema
    const a       = toRgb(accent);
    const accentRgba = (o) => `rgba(${a.r},${a.g},${a.b},${o})`;

    // ── Paleta xterm.js (16 colores ANSI + especiales) ──────────────────────
    const n = d.ansi;
    const xterm = {
      background: d.bg,
      foreground: d.fg,
      cursor: d.cursor,
      cursorAccent: d.cursorText,
      selectionBackground: rgba(d.selection, isLight ? 0.5 : 0.9),
      black:   n[0],  red:     n[1],  green:   n[2],  yellow:  n[3],
      blue:    n[4],  magenta: n[5],  cyan:    n[6],  white:   n[7],
      brightBlack:   n[8],  brightRed:     n[9],  brightGreen:   n[10], brightYellow:  n[11],
      brightBlue:    n[12], brightMagenta: n[13], brightCyan:    n[14], brightWhite:   n[15],
    };

    // ── CSS variables de la UI — bg/sidebar/input derivados del bg del tema ──
    // En oscuros el sidebar va más oscuro; en claros, más claro/distinto.
    const sidebar = isLight ? shade(d.bg, -0.03) : shade(d.bg, -0.025);
    const input   = isLight ? '#FFFFFF'          : shade(d.bg, +0.035);
    const border       = isLight ? 'rgba(0,0,0,0.07)'  : 'rgba(255,255,255,0.06)';
    const borderStrong = isLight ? 'rgba(0,0,0,0.13)'  : 'rgba(255,255,255,0.12)';
    const hoverBg      = isLight ? 'rgba(0,0,0,0.04)'  : 'rgba(255,255,255,0.06)';

    const common = isLight ? {
      '--focus-ring': accentRgba(0.4), '--selection-bg': accentRgba(0.15),
      '--accent-glow': accentRgba(0.1), '--accent-muted': accentRgba(0.04),
      '--scrollbar-thumb': accentRgba(0.28), '--scrollbar-thumb-hover': accentRgba(0.55),
      '--scrollbar-track': 'transparent', '--bg-overlay': 'rgba(0,0,0,0.4)',
      '--shadow-sm': '0 1px 3px rgba(0,0,0,0.08)', '--shadow-md': '0 4px 12px rgba(0,0,0,0.1)',
      '--shadow-lg': '0 8px 30px rgba(0,0,0,0.15)',
    } : {
      '--focus-ring': accentRgba(0.5), '--selection-bg': accentRgba(0.25),
      '--accent-glow': accentRgba(0.12), '--accent-muted': accentRgba(0.06),
      '--scrollbar-thumb': accentRgba(0.38), '--scrollbar-thumb-hover': accentRgba(0.62),
      '--scrollbar-track': 'transparent', '--bg-overlay': 'rgba(0,0,0,0.65)',
      '--shadow-sm': '0 1px 3px rgba(0,0,0,0.3)', '--shadow-md': '0 4px 12px rgba(0,0,0,0.4)',
      '--shadow-lg': '0 8px 30px rgba(0,0,0,0.5)',
    };

    const css = {
      '--bg-terminal': d.bg, '--bg-sidebar': sidebar, '--bg-input': input, '--bg-tooltip': input,
      '--text-primary': d.fg, '--text-secondary': isLight ? shade(d.fg,+0.18) : shade(d.fg,-0.18),
      '--text-dim': d.comment,
      '--accent': accent, '--accent-dim': accentRgba(isLight ? 0.14 : 0.18),
      '--border': border, '--border-strong': borderStrong, '--hover-bg': hoverBg,
      '--watermark': accent,
      '--transition-fast': '100ms ease', '--transition-normal': '200ms ease', '--transition-slow': '300ms ease',
      ...common,
    };

    // ── Tokens semánticos para los prompts ──────────────────────────────────
    // Mapeo base16: accent=cursor, green=ansi[2], blue=ansi[4], warning=ansi[3].
    // REGLA: tokens.accent === --accent del CSS (coherencia overlay ↔ UI).
    const tokens = {
      accent, green: n[2], blue: n[4], warning: n[3], comment: d.comment, fg: d.fg,
    };

    return { name: d.name, type: d.type, desc: d.desc, xterm, css, tokens };
  }

  // ── Construir THEMES + TOKENS desde los datos ─────────────────────────────
  const THEMES = {};
  const TOKENS = {};
  for (const d of OCOTE_THEME_DATA) {
    const t = buildTheme(d);
    THEMES[d.id] = { name: t.name, type: t.type, desc: t.desc, xterm: t.xterm, css: t.css };
    TOKENS[d.id] = t.tokens;
  }

  const DEFAULT_THEME = 'ocote';

  // ── API ─────────────────────────────────────────────────────────────────
  function applyTheme(themeId) {
    const theme = THEMES[themeId] || THEMES[DEFAULT_THEME];
    if (!theme) return;

    const root = document.documentElement;
    for (const [prop, value] of Object.entries(theme.css)) {
      root.style.setProperty(prop, value);
    }

    if (window.TAB_MANAGER) {
      window.TAB_MANAGER.getAllTabs().forEach(([, tab]) => {
        if (!tab || !tab.term) return;
        if (tab.term.options && typeof tab.term.options === 'object') {
          tab.term.options.theme = theme.xterm;
        } else if (tab.term.setOption) {
          tab.term.setOption('theme', theme.xterm);
        }
      });
    }

    window.OCOTE_PROMPT?.refresh?.();
  }

  /** Tokens semánticos del tema activo (accent, green, blue, comment, warning, fg, bg). */
  function getCurrentTokens() {
    const themeId = localStorage.getItem('ocote_theme') || DEFAULT_THEME;
    const tokens = TOKENS[themeId] ?? TOKENS[DEFAULT_THEME];
    const theme = THEMES[themeId] ?? THEMES[DEFAULT_THEME];
    return { ...tokens, bg: theme.xterm.background };
  }

  /** Lista de temas para el picker de Settings (en orden de OCOTE_THEME_DATA).
   *  Incluye los datos crudos (bg, fg, cursor, ansi…) para el mini-preview. */
  function getThemeList() {
    return OCOTE_THEME_DATA.map(d => ({
      id: d.id,
      name: d.name,
      type: d.type,
      desc: d.desc,
      preview: d.bg,
      accent: d.cursor,
      // datos para el preview de terminal en el picker
      bg: d.bg, fg: d.fg, cursor: d.cursor, comment: d.comment, ansi: d.ansi,
    }));
  }

  window.OCOTE_THEMES = {
    THEMES,
    TOKENS,
    DEFAULT_THEME,
    applyTheme,
    getThemeList,
    getCurrentTokens,
  };
})();
