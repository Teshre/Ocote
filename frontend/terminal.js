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

  // Leer preferencias guardadas — font, fontSize, cursorStyle, scrollback
  const savedFont     = localStorage.getItem('ocote_font') || null;
  const savedFontSize = parseInt(localStorage.getItem('ocote_font_size') || '14');
  const savedCursor   = localStorage.getItem('ocote_cursor_style') || 'block';
  const savedScrollback = parseInt(localStorage.getItem('ocote_scrollback') || '10000');

  const term = new Terminal({
    theme: activeXtermTheme,
    fontFamily: savedFont || "'JetBrainsMono Nerd Font Mono', 'JetBrainsMonoNL Nerd Font Mono', 'MesloLGS NF', 'FiraCode Nerd Font Propo', 'Hack Nerd Font', 'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
    fontSize: savedFontSize,
    lineHeight: 1.2,
    cursorBlink: true,
    cursorStyle: savedCursor,
    scrollback: savedScrollback,
    // macOptionIsMeta: true → en macOS la tecla Option/Alt envía secuencias ESC
    // en vez de caracteres especiales (©, ∆, etc.). Necesario para que
    // fzf Alt+C funcione y para atajos Alt en vim, emacs, etc.
    macOptionIsMeta: true,
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

  // ── Handlers de OSC para integración de shell y overlay system ──────────
  if (!term.parser) return;

  // OSC 6731 — metadata del prompt: {cwd, branch, dirty, time, exit}.
  // Se guarda aquí y se consume en OSC 133 A para generar el overlay.
  let lastPromptMeta = null;
  // Coordenadas del prompt anterior — usadas en 133 D para saber dónde empieza el body.
  let lastChevronRow = null; // { infoAbsRow, chevronAbsRow }

  term.parser.registerOscHandler(6731, (data) => {
    const sep = data.indexOf(';');
    if (sep === -1 || data.slice(0, sep) !== 'prompt') return false;
    try {
      lastPromptMeta = JSON.parse(data.slice(sep + 1));
      // Sync autoritativo del explorador: el shell reporta su PWD REAL aquí
      // (con ~ abreviado). Reemplaza al fast-path que adivinaba la ruta del
      // `cd` tecleado — ese fallaba con tab-completion e historial porque solo
      // veía las teclas crudas, no el texto que el shell completaba.
      // Solo sincronizamos si este shell es el tab activo.
      if (lastPromptMeta?.cwd && shellId === window.ocoteActiveShellId) {
        window.onShellCwdChanged?.(lastPromptMeta.cwd);
      }
    } catch (_) {}
    return true;
  });

  // OSC 133 — shell integration markers.
  //
  // A: al final del PROMPT (después de ❯).
  //    Leemos cursor con rAF para que el write() haya terminado y ❯ esté en pantalla.
  //    Guardamos lastChevronRow para que 133 D lo use más adelante.
  //
  // D;exitcode: precmd ha terminado (justo antes del siguiente prompt).
  //    Leemos endAbsRow SÍNCRONAMENTE aquí — el cursor está al final del output
  //    del comando, antes de que el siguiente prompt se haya pintado.
  //    Si esperásemos al rAF, el write() habría terminado y el cursor estaría
  //    en la fila del nuevo ❯ — demasiado tarde (race condition).
  term.parser.registerOscHandler(133, (data) => {
    if (data === 'A' && lastPromptMeta) {
      const meta = lastPromptMeta;
      lastPromptMeta = null;

      requestAnimationFrame(() => {
        const buf = term.buffer.active;
        const chevronAbsRow = buf.baseY + buf.cursorY;
        const infoAbsRow = Math.max(0, chevronAbsRow - 1);
        lastChevronRow = { infoAbsRow, chevronAbsRow };
        window.OCOTE_PROMPT?.showPromptOverlay(term, meta, infoAbsRow);
      });

    } else if (data[0] === 'D' && lastChevronRow) {
      // Leer cursor síncronamente: en este punto del parse, el output del comando
      // ya está en el buffer pero el siguiente prompt aún NO se ha procesado.
      const buf = term.buffer.active;
      const endAbsRow = buf.baseY + buf.cursorY;
      const exitCode = data.includes(';') ? (parseInt(data.slice(2)) || 0) : 0;
      const saved = lastChevronRow;

      // DOM update diferido al siguiente frame (fuera del ciclo parse de xterm.js)
      requestAnimationFrame(() => {
        window.OCOTE_PROMPT?.extendCommandBlock(
          term, saved.infoAbsRow, saved.chevronAbsRow, endAbsRow, exitCode
        );
      });
    }
    return true;
  });

  // Reposicionar overlays cuando el usuario hace scroll o la terminal hace resize.
  term.onScroll(() => {
    window.OCOTE_PROMPT?.updateOverlayPositions(term);
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

      // NOTA: el sync del explorador en `cd` ya NO se hace aquí. Antes había un
      // "fast-path" que adivinaba la ruta del `cd <target>` tecleado, pero
      // currentCommandLine solo captura teclas crudas — con tab-completion o
      // historial el texto real difería del tecleado → cargaba rutas parciales
      // inexistentes (error "ruta no existe"). Ahora el explorador sincroniza
      // desde el cwd REAL que el shell emite vía OSC 6731 (ver handler arriba).

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
      // Detectar secuencias de limpieza de pantalla (clear, Ctrl+L).
      // ESC[2J = borrar display; ESC[3J = borrar scrollback.
      // En estos casos los overlays quedan "flotando" en filas que ya no
      // corresponden a ningún prompt visible — hay que descartarlos.
      if (data.includes('\x1b[2J') || data.includes('\x1b[3J')) {
        window.OCOTE_PROMPT?.clearOverlays(tab.term);
      }
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
