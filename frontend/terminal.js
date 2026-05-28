// terminal.js — Terminal con xterm.js (múltiples instancias por tabs)
// Reemplaza el parser VT custom por xterm.js, que maneja correctamente
// zsh-autosuggestions, p10k, bash readline, y apps TUI (vim, htop, fzf).
//
// Ahora soporta múltiples tabs: cada tab es una xterm.js + PTY independiente.
// createTerminalInstance() es llamada por tab-manager.js por cada nuevo tab.

const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

// ── Tema Ocote (xterm.js) ─────────────────────────────────────────────────
const OCOTE_THEME = {
  background: '#1a1a1a',
  foreground: '#e8e6df',
  cursor: '#f5a623',
  selectionBackground: 'rgba(245, 166, 35, 0.3)',
  black: '#1a1a1a', red: '#e06c75', green: '#98c379', yellow: '#e5c07b',
  blue: '#61afef', magenta: '#c678dd', cyan: '#56b6c2', white: '#abb2bf',
  brightBlack: '#5c6370', brightRed: '#e06c75', brightGreen: '#98c379',
  brightYellow: '#e5c07b', brightBlue: '#61afef', brightMagenta: '#c678dd',
  brightCyan: '#56b6c2', brightWhite: '#ffffff',
};

// ── Factory: crear instancia xterm.js para un tab ────────────────────────

function createTerminalInstance(shellId, container) {
  // Leer el tema activo guardado en localStorage.
  // Si themes.js ya cargó, usar su paleta; si no, caer al default oscuro.
  const savedThemeId = localStorage.getItem('ocote_theme') || 'dark';
  const activeXtermTheme = window.OCOTE_THEMES?.THEMES?.[savedThemeId]?.xterm ?? OCOTE_THEME;

  const term = new Terminal({
    // Terminal opaca (sin allowTransparency): apps que redibujan como p10k
    // "borran" con espacios de fondo default; si el fondo es transparente, esos
    // espacios no tapan el texto viejo y se ve fantasma. El watermark se muestra
    // ENCIMA con opacidad baja (ver #terminal-watermark en theme.css), no detrás.
    theme: activeXtermTheme,
    fontFamily: "'JetBrainsMono Nerd Font Mono', 'JetBrainsMonoNL Nerd Font Mono', 'MesloLGS NF', 'FiraCode Nerd Font Propo', 'Hack Nerd Font', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    fontSize: 14,
    // lineHeight 1.2 (no 1.5): con 1.5 los caracteres de marco de p10k
    // (─ ╮ ╰ │) no conectan entre líneas y el prompt se ve "fantasma"/flotante.
    // 1.2 deja aire pero los conecta como en Terax/iTerm.
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: 'block',
    scrollback: 10000,
    // convertEol: false — un PTY ya envía \r\n. Con true, xterm reconvierte
    // \n→\r\n y desalinea el cursor en redibujados complejos (p10k).
    convertEol: false,
    rightClickSelectsWord: false,
  });

  const fitAddon = new FitAddon.FitAddon();
  term.loadAddon(fitAddon);

  term.open(container);
  fitWithRetries(fitAddon);

  // Sincronizar tamaño PTY ↔ xterm.js
  term.onResize(({ rows, cols }) => {
    invoke('resize_pty', { shellId, rows, cols }).catch(console.error);
  });

  // Enviar input al PTY correcto
  term.onData((data) => {
    updateCurrentInput(data, shellId);
    invoke('write_to_shell', { shellId, input: data }).catch(console.error);
  });

  // Exponer la instancia para que tab-manager.js pueda acceder
  return { term, fitAddon };
}

function fitWithRetries(fitAddon) {
  if (!fitAddon || !fitAddon.fit) return;

  const safeFit = () => {
    try {
      fitAddon.fit();
    } catch (err) {
      // Silencioso: xterm puede lanzar si el contenedor aún no está listo
    }
  };

  safeFit();
  requestAnimationFrame(safeFit);
  setTimeout(safeFit, 80);
  setTimeout(safeFit, 240);

  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(safeFit).catch(() => {});
  }
}

// Exponer factory globalmente
window.createTerminalInstance = createTerminalInstance;

// ── Trackear input del usuario (global, aplica al tab activo) ──────────────
let currentInput = '';
let currentCommandLine = '';

function updateCurrentInput(data, shellId) {
  // Solo trackear input si este tab es el activo
  if (window.ocoteActiveShellId && shellId !== window.ocoteActiveShellId) return;

  // Backspace: \x08 (BS) o \x7f (DEL)
  if (data === '\x08' || data === '\x7f') {
    currentInput = currentInput.slice(0, -1);
    currentCommandLine = currentCommandLine.slice(0, -1);
  }
  // Enter: \r o \n
  else if (data === '\r' || data === '\n') {
    const trimmed = currentCommandLine.trim();
    if (trimmed) {
      const cmdName = trimmed.split(/\s+/)[0];

      // Fast-path: si el usuario ejecutó un cd, notificar al explorador
      if (trimmed.startsWith('cd ')) {
        const target = trimmed.substring(3).trim();
        if (window.onTerminalCdExecuted) {
          window.onTerminalCdExecuted(target);
        }
      }

      // Notificar a tooltip
      if (window.onTerminalCommandExecuted) {
        window.onTerminalCommandExecuted(cmdName);
      }
    }
    currentInput = '';
    currentCommandLine = '';
    if (window.onTerminalInputChanged) {
      window.onTerminalInputChanged('');
    }
  }
  // Escape o secuencias de escape: ignorar
  else if (data.startsWith('\x1b')) {
    return;
  }
  // Caracteres de control: ignorar
  else if (data.length === 1 && data.charCodeAt(0) < 32) {
    return;
  }
  // Caracter imprimible
  else {
    if (data === ' ') {
      currentInput = '';
      currentCommandLine += data;
      if (window.onTerminalInputChanged) {
        window.onTerminalInputChanged('');
      }
      return;
    }
    currentInput += data;
    currentCommandLine += data;
  }

  if (window.onTerminalInputChanged) {
    window.onTerminalInputChanged(currentInput);
  }
}

// ── Reset externo del tracking de input ───────────────────────────────────
window.resetTerminalInput = function () {
  currentInput = '';
  currentCommandLine = '';
  if (window.onTerminalInputChanged) {
    window.onTerminalInputChanged('');
  }
};

// ── Conectar output del PTY (global, rutea al tab correcto) ──────────────

(async function initPtyListener() {
  await listen('pty-output', (e) => {
    const { shell_id, data } = e.payload;
    const tab = window.TAB_MANAGER ? window.TAB_MANAGER.getTab(shell_id) : null;
    if (tab && tab.term) {
      tab.term.write(data);
    }
  });

  await listen('pty-exit', (e) => {
    const { shell_id } = e.payload;
    const tab = window.TAB_MANAGER ? window.TAB_MANAGER.getTab(shell_id) : null;
    if (tab && tab.term) {
      tab.term.writeln('\r\n[Sesión terminada]');
    }
  });
})();

// ── Resize global (cuando la ventana del OS cambia) ─────────────────────

window.addEventListener('resize', () => {
  // Solo resize el tab activo
  if (window.TAB_MANAGER) {
    const active = window.TAB_MANAGER.getTab(window.ocoteActiveShellId);
    if (active && active.fitAddon) {
      active.fitAddon.fit();
    }
  }
});
