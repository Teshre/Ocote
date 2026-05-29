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

function createTerminalInstance(container) {
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

  // Devolvemos la instancia SIN vincular el shell todavía. El binding se hace
  // con bindTerminalShell() una vez que tab-manager.js creó el PTY al tamaño
  // ya medido — así el PTY nace con el tamaño correcto y zsh/p10k no redibujan
  // (evita el "fantasma" del prompt por el resize inicial).
  return { term, fitAddon };
}

/**
 * Vincula una instancia xterm.js con su shell (PTY) ya creado.
 * Conecta el input (onData), el redimensionado (onResize) y los handlers
 * de OSC para el sistema de prompt de Ocote.
 */
function bindTerminalShell(term, shellId) {
  // Sincronizar tamaño PTY ↔ xterm.js (resizes posteriores: ventana, etc.)
  term.onResize(({ rows, cols }) => {
    invoke('resize_pty', { shellId, rows, cols }).catch(console.error);
  });

  // Enviar input al PTY correcto
  term.onData((data) => {
    updateCurrentInput(data, shellId);
    invoke('write_to_shell', { shellId, input: data }).catch(console.error);
  });

  // ── Handlers de OSC para el sistema de prompt ────────────────────────────
  // Solo registrar si xterm.js expone el parser (v4+).
  if (!term.parser) return;

  // Estado de prompt para este tab (pendingMeta se llena con OSC 6731 y se
  // consume con OSC 133 A para sincronizar el marker con la línea correcta).
  const promptState = { pendingMeta: null };

  // OSC 6731 — datos estructurados del prompt
  // Formato: "prompt;{...json...}"
  // El shell los emite justo antes de OSC 133 A (inicio de zona prompt).
  term.parser.registerOscHandler(6731, (data) => {
    const sep = data.indexOf(';');
    if (sep === -1 || data.slice(0, sep) !== 'prompt') return false;
    try {
      promptState.pendingMeta = JSON.parse(data.slice(sep + 1));
    } catch (_) {
      // JSON malformado — no romper el render del terminal, ignorar silenciosamente
    }
    return true; // consumir el OSC para que no aparezca como texto
  });

  // OSC 133 — marcadores de semántica de shell (Shell Integration)
  // 133;A = inicio de zona prompt  (justo antes de que zsh dibuje el prompt)
  // 133;B = fin de zona prompt     (usuario presionó Enter)
  // 133;D;exitcode = fin del comando anterior
  term.parser.registerOscHandler(133, (data) => {
    if (data === 'A' && promptState.pendingMeta) {
      // La línea actual es donde está el prompt (el \n antes de ❯ en nuestro PS1).
      // renderPrompt() usa registerMarker(0) para decorar esta línea exacta.
      window.OCOTE_PROMPT?.renderPrompt(term, promptState.pendingMeta);
      promptState.pendingMeta = null;

    } else if (data === 'B') {
      // El usuario envió un comando
      window.OCOTE_PROMPT?.onCommandStart(term);

    } else if (data.startsWith('D')) {
      // Comando terminó — extraer exit code
      const parts = data.split(';');
      const exitCode = parts.length > 1 ? parseInt(parts[1], 10) : 0;
      window.OCOTE_PROMPT?.onCommandEnd(term, exitCode);
    }
    return true;
  });
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
window.bindTerminalShell = bindTerminalShell;

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
