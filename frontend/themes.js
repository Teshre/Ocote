// themes.js — Definición de temas para Ocote
// Cada tema incluye colores para xterm.js + CSS variables.
// Paletas basadas en temas open-source (Dracula, One Dark, Monokai, Solarized,
// Gruvbox, Nord, Tokyo Night) — licencias MIT/GPL compatibles.

(function () {
  'use strict';

  const THEMES = {
    // ── Ocote Dark (default) ──────────────────────────────────────────────
    dark: {
      name: 'Ocote Dark',
      xterm: {
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
      css: {
        '--bg-terminal': '#1a1a1a',
        '--bg-sidebar':  '#141414',
        '--bg-input':    '#222222',
        '--bg-tooltip':  '#2a2a2a',
        '--text-primary':   '#e8e6df',
        '--text-secondary': '#9c9a92',
        '--text-dim':       '#5f5e5a',
        '--accent':         '#f5a623',
        '--accent-dim':     '#3d2a0a',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── Ocote Light ───────────────────────────────────────────────────────
    light: {
      name: 'Ocote Light',
      xterm: {
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
      css: {
        '--bg-terminal': '#f5f5f5',
        '--bg-sidebar':  '#ffffff',
        '--bg-input':    '#ffffff',
        '--bg-tooltip':  '#ffffff',
        '--text-primary':   '#1a1a1a',
        '--text-secondary': '#666666',
        '--text-dim':       '#999999',
        '--accent':         '#e67e22',
        '--accent-dim':     '#fdebd0',
        '--border':         'rgba(0,0,0,0.08)',
        '--border-strong':  'rgba(0,0,0,0.12)',
        '--hover-bg':       'rgba(0,0,0,0.04)',
      },
    },

    // ── Dracula (MIT, https://draculatheme.com) ────────────────────────────
    dracula: {
      name: 'Dracula',
      xterm: {
        background: '#282a36',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selectionBackground: 'rgba(68, 71, 90, 0.6)',
        black: '#000000', red: '#ff5555', green: '#50fa7b', yellow: '#f1fa8c',
        blue: '#bd93f9', magenta: '#ff79c6', cyan: '#8be9fd', white: '#bfbfbf',
        brightBlack: '#4d4d4d', brightRed: '#ff6e67', brightGreen: '#5af78e',
        brightYellow: '#ffffa5', brightBlue: '#caa9fa', brightMagenta: '#ff92d0',
        brightCyan: '#9aedfe', brightWhite: '#e6e6e6',
      },
      css: {
        '--bg-terminal': '#282a36',
        '--bg-sidebar':  '#21222c',
        '--bg-input':    '#44475a',
        '--bg-tooltip':  '#44475a',
        '--text-primary':   '#f8f8f2',
        '--text-secondary': '#bfbfbf',
        '--text-dim':       '#6272a4',
        '--accent':         '#ff79c6',
        '--accent-dim':     'rgba(255,121,198,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── One Dark (MIT, Atom editor theme) ──────────────────────────────────
    oneDark: {
      name: 'One Dark',
      xterm: {
        background: '#282c34',
        foreground: '#abb2bf',
        cursor: '#528bff',
        selectionBackground: 'rgba(82, 139, 255, 0.3)',
        black: '#282c34', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
        blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
        brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
        brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
        brightCyan: '#56b6c2', brightWhite: '#ffffff',
      },
      css: {
        '--bg-terminal': '#282c34',
        '--bg-sidebar':  '#21252b',
        '--bg-input':    '#3a3f4b',
        '--bg-tooltip':  '#3a3f4b',
        '--text-primary':   '#abb2bf',
        '--text-secondary': '#828997',
        '--text-dim':       '#5c6370',
        '--accent':         '#528bff',
        '--accent-dim':     'rgba(82,139,255,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── Monokai (MIT, https://www.monokai.pro) ─────────────────────────────
    monokai: {
      name: 'Monokai',
      xterm: {
        background: '#272822',
        foreground: '#f8f8f2',
        cursor: '#f8f8f2',
        selectionBackground: 'rgba(73, 72, 62, 0.8)',
        black: '#272822', red: '#f92672', green: '#a6e22e', yellow: '#f4bf75',
        blue: '#66d9ef', magenta: '#ae81ff', cyan: '#a1efe4', white: '#f8f8f2',
        brightBlack: '#75715e', brightRed: '#f92672', brightGreen: '#a6e22e',
        brightYellow: '#f4bf75', brightBlue: '#66d9ef', brightMagenta: '#ae81ff',
        brightCyan: '#a1efe4', brightWhite: '#f9f8f5',
      },
      css: {
        '--bg-terminal': '#272822',
        '--bg-sidebar':  '#1e1f1c',
        '--bg-input':    '#3e3d32',
        '--bg-tooltip':  '#3e3d32',
        '--text-primary':   '#f8f8f2',
        '--text-secondary': '#cfcfc2',
        '--text-dim':       '#75715e',
        '--accent':         '#f92672',
        '--accent-dim':     'rgba(249,38,114,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── Solarized Dark (MIT, Ethan Schoonover) ────────────────────────────
    solarizedDark: {
      name: 'Solarized Dark',
      xterm: {
        background: '#002b36',
        foreground: '#839496',
        cursor: '#93a1a1',
        selectionBackground: 'rgba(7, 54, 66, 0.8)',
        black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
        blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
        brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
        brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
      },
      css: {
        '--bg-terminal': '#002b36',
        '--bg-sidebar':  '#001f27',
        '--bg-input':    '#073642',
        '--bg-tooltip':  '#073642',
        '--text-primary':   '#93a1a1',
        '--text-secondary': '#839496',
        '--text-dim':       '#586e75',
        '--accent':         '#b58900',
        '--accent-dim':     'rgba(181,137,0,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── Solarized Light (MIT, Ethan Schoonover) ───────────────────────────
    solarizedLight: {
      name: 'Solarized Light',
      xterm: {
        background: '#fdf6e3',
        foreground: '#657b83',
        cursor: '#586e75',
        selectionBackground: 'rgba(238, 232, 213, 0.8)',
        black: '#073642', red: '#dc322f', green: '#859900', yellow: '#b58900',
        blue: '#268bd2', magenta: '#d33682', cyan: '#2aa198', white: '#eee8d5',
        brightBlack: '#002b36', brightRed: '#cb4b16', brightGreen: '#586e75',
        brightYellow: '#657b83', brightBlue: '#839496', brightMagenta: '#6c71c4',
        brightCyan: '#93a1a1', brightWhite: '#fdf6e3',
      },
      css: {
        '--bg-terminal': '#fdf6e3',
        '--bg-sidebar':  '#eee8d5',
        '--bg-input':    '#ffffff',
        '--bg-tooltip':  '#ffffff',
        '--text-primary':   '#586e75',
        '--text-secondary': '#657b83',
        '--text-dim':       '#93a1a1',
        '--accent':         '#b58900',
        '--accent-dim':     'rgba(181,137,0,0.12)',
        '--border':         'rgba(0,0,0,0.08)',
        '--border-strong':  'rgba(0,0,0,0.12)',
        '--hover-bg':       'rgba(0,0,0,0.04)',
      },
    },

    // ── Gruvbox Dark (MIT, Pavel Pertsev) ─────────────────────────────────
    gruvboxDark: {
      name: 'Gruvbox Dark',
      xterm: {
        background: '#282828',
        foreground: '#ebdbb2',
        cursor: '#ebdbb2',
        selectionBackground: 'rgba(102, 92, 84, 0.6)',
        black: '#282828', red: '#cc241d', green: '#98971a', yellow: '#d79921',
        blue: '#458588', magenta: '#b16286', cyan: '#689d6a', white: '#a89984',
        brightBlack: '#928374', brightRed: '#fb4934', brightGreen: '#b8bb26',
        brightYellow: '#fabd2f', brightBlue: '#83a598', brightMagenta: '#d3869b',
        brightCyan: '#8ec07c', brightWhite: '#ebdbb2',
      },
      css: {
        '--bg-terminal': '#282828',
        '--bg-sidebar':  '#1d2021',
        '--bg-input':    '#3c3836',
        '--bg-tooltip':  '#3c3836',
        '--text-primary':   '#ebdbb2',
        '--text-secondary': '#a89984',
        '--text-dim':       '#928374',
        '--accent':         '#d79921',
        '--accent-dim':     'rgba(215,153,33,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── Nord (MIT, Arctic Ice Studio) ──────────────────────────────────────
    nord: {
      name: 'Nord',
      xterm: {
        background: '#2e3440',
        foreground: '#d8dee9',
        cursor: '#d8dee9',
        selectionBackground: 'rgba(76, 86, 106, 0.6)',
        black: '#3b4252', red: '#bf616a', green: '#a3be8c', yellow: '#ebcb8b',
        blue: '#81a1c1', magenta: '#b48ead', cyan: '#88c0d0', white: '#e5e9f0',
        brightBlack: '#4c566a', brightRed: '#bf616a', brightGreen: '#a3be8c',
        brightYellow: '#ebcb8b', brightBlue: '#81a1c1', brightMagenta: '#b48ead',
        brightCyan: '#8fbcbb', brightWhite: '#eceff4',
      },
      css: {
        '--bg-terminal': '#2e3440',
        '--bg-sidebar':  '#242933',
        '--bg-input':    '#3b4252',
        '--bg-tooltip':  '#3b4252',
        '--text-primary':   '#d8dee9',
        '--text-secondary': '#81a1c1',
        '--text-dim':       '#4c566a',
        '--accent':         '#88c0d0',
        '--accent-dim':     'rgba(136,192,208,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },

    // ── Tokyo Night (MIT, Enkia) ──────────────────────────────────────────
    tokyoNight: {
      name: 'Tokyo Night',
      xterm: {
        background: '#1a1b26',
        foreground: '#a9b1d6',
        cursor: '#a9b1d6',
        selectionBackground: 'rgba(41, 46, 66, 0.8)',
        black: '#15161e', red: '#f7768e', green: '#9ece6a', yellow: '#e0af68',
        blue: '#7aa2f7', magenta: '#bb9af7', cyan: '#7dcfff', white: '#a9b1d6',
        brightBlack: '#414868', brightRed: '#f7768e', brightGreen: '#9ece6a',
        brightYellow: '#e0af68', brightBlue: '#7aa2f7', brightMagenta: '#bb9af7',
        brightCyan: '#7dcfff', brightWhite: '#c0caf5',
      },
      css: {
        '--bg-terminal': '#1a1b26',
        '--bg-sidebar':  '#16161e',
        '--bg-input':    '#24283b',
        '--bg-tooltip':  '#24283b',
        '--text-primary':   '#c0caf5',
        '--text-secondary': '#a9b1d6',
        '--text-dim':       '#565f89',
        '--accent':         '#7aa2f7',
        '--accent-dim':     'rgba(122,162,247,0.15)',
        '--border':         'rgba(255,255,255,0.08)',
        '--border-strong':  'rgba(255,255,255,0.15)',
        '--hover-bg':       'rgba(255,255,255,0.07)',
      },
    },
  };

  // ── Aplicar un tema ─────────────────────────────────────────────────────
  function applyTheme(themeId) {
    const theme = THEMES[themeId];
    if (!theme) return;

    // Aplicar CSS variables al :root
    const root = document.documentElement;
    for (const [prop, value] of Object.entries(theme.css)) {
      root.style.setProperty(prop, value);
    }

    // Aplicar tema a todos los tabs de xterm.js activos
    // (con el sistema de tabs, window.ocoteTerminal ya no existe;
    //  cada terminal vive en TAB_MANAGER.getAllTabs())
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
  }

  // ── Lista de temas para UI ────────────────────────────────────────────
  function getThemeList() {
    return Object.entries(THEMES).map(([id, t]) => ({
      id,
      name: t.name,
      preview: t.xterm.background,
      accent: t.xterm.cursor || t.css['--accent'],
    }));
  }

  // Exponer globalmente
  window.OCOTE_THEMES = {
    THEMES,
    applyTheme,
    getThemeList,
  };
})();
