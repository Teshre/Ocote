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
  const savedThemeId = localStorage.getItem('ocote_theme') || 'ocote';
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

  // SearchAddon — búsqueda de texto dentro del scrollback del terminal (Ctrl+F).
  // findNext/findPrevious resaltan coincidencias directamente en el canvas de xterm.js.
  const searchAddon = new SearchAddon.SearchAddon();
  term.loadAddon(searchAddon);

  term.open(container);
  fitWithRetries(fitAddon);

  // Devolvemos la instancia SIN vincular el shell todavía. El binding se hace
  // con bindTerminalShell() una vez que tab-manager.js creó el PTY al tamaño
  // ya medido — así el PTY nace con el tamaño correcto y zsh/p10k no redibujan
  // (evita el "fantasma" del prompt por el resize inicial).
  return { term, fitAddon, searchAddon };
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
  // Markers del prompt anterior — usados en 133 D para delimitar el body.
  let lastChevronRow = null; // { infoMarker, chevMarker } — markers de xterm

  term.parser.registerOscHandler(6731, (data) => {
    const sep = data.indexOf(';');
    if (sep === -1 || data.slice(0, sep) !== 'prompt') return false;
    try {
      lastPromptMeta = JSON.parse(data.slice(sep + 1));
      // CRÍTICO: actualizar el cwd del backend ANTES de notificar al explorador.
      // Si el explorador llama list_directory antes de que set_shell_cwd
      // termine, el backend valida contra el cwd anterior y rechaza con
      // "Operación fuera del directorio permitido". Ordenar así elimina la
      // race condition en cada `cd`.
      if (lastPromptMeta?.cwd) {
        window.__TAURI__.invoke('set_shell_cwd', {
          shellId,
          cwd: lastPromptMeta.cwd,
        })
        .catch((e) => console.warn('[ocote] no se pudo actualizar shell cwd:', e))
        .finally(() => {
          // Solo sincronizamos el explorador si este shell es el tab activo.
          if (lastPromptMeta?.cwd && shellId === window.ocoteActiveShellId) {
            window.onShellCwdChanged?.(lastPromptMeta.cwd);
          }
        });
      }
    } catch (_) {}
    return true;
  });

  // OSC 133 — shell integration markers.
  //
  // A: al final del PROMPT (después de ❯).
  //    Leemos cursor con rAF para que el write() haya terminado y ❯ esté en pantalla.
  //    Guardamos lastChevronRow para que 133 D lo use más adelante.
  //    También marcamos el inicio del "ciclo de comando" para medir la duración.
  //
  // D;exitcode: precmd ha terminado (justo antes del siguiente prompt).
  //    Leemos endAbsRow SÍNCRONAMENTE aquí — el cursor está al final del output
  //    del comando, antes de que el siguiente prompt se haya pintado.
  //    Si esperásemos al rAF, el write() habría terminado y el cursor estaría
  //    en la fila del nuevo ❯ — demasiado tarde (race condition).

  // Timestamp del último OSC 133 A — para calcular la duración del comando.
  // Incluye el tiempo de tipeo, pero para comandos largos (builds, deploys)
  // es despreciable (ej. 3s de tipeo en un build de 2 minutos → 2m 3s).
  let commandStartTime = null;

  term.parser.registerOscHandler(133, (data) => {
    // Shell integration presente → habilita el gate de "comando en ejecución"
    // del autocompletado (ver updateCurrentInput). En 'A' (prompt listo) y 'D'
    // (comando terminó) NO hay una app de primer plano corriendo.
    term._ocoteHas133 = true;
    if (data === 'A' || data[0] === 'D') term._ocoteCmdRunning = false;

    if (data === 'A' && lastPromptMeta) {
      const meta = lastPromptMeta;
      lastPromptMeta = null;

      // Marcar inicio del ciclo de comando (A = prompt listo, usuario va a escribir)
      commandStartTime = Date.now();

      requestAnimationFrame(() => {
        const buf = term.buffer.active;
        const chevronAbsRow = buf.baseY + buf.cursorY;
        const infoAbsRow = Math.max(0, chevronAbsRow - 1);
        // Anclar con MARKERS de xterm: siguen a su línea ante trim/reflow, en vez
        // de un número fijo que se desincroniza. registerMarker(offset) ancla en
        // baseY+cursorY+offset (cursor en ❯): info = -1, ❯ = 0.
        const infoMarker = _makeMarker(term, -1, infoAbsRow);
        const chevMarker = _makeMarker(term, 0, chevronAbsRow);
        lastChevronRow = { infoMarker, chevMarker };
        window.OCOTE_PROMPT?.showPromptOverlay(term, meta, infoMarker);
      });

    } else if (data[0] === 'D' && lastChevronRow) {
      // Leer cursor síncronamente: en este punto del parse, el output del comando
      // ya está en el buffer pero el siguiente prompt aún NO se ha procesado.
      const buf = term.buffer.active;
      const endAbsRow = buf.baseY + buf.cursorY;
      // Marker del fin del output — SÍNCRONO: el cursor está al final del output;
      // en el rAF ya se habría movido al nuevo ❯. registerMarker(0)=baseY+cursorY.
      const endMarker = _makeMarker(term, 0, endAbsRow);
      const exitCode = data.includes(';') ? (parseInt(data.slice(2)) || 0) : 0;
      const saved = lastChevronRow;

      // Duración del comando en segundos (redondeada)
      const durationSecs = commandStartTime
        ? Math.round((Date.now() - commandStartTime) / 1000)
        : 0;
      commandStartTime = null;

      // ── onCommandFinished: FUERA del rAF ─────────────────────────────────
      // No usar rAF aquí: se pausa cuando la ventana no tiene foco en WKWebView,
      // que es exactamente cuando el usuario está en otra app y queremos notificar.
      window.TAB_MANAGER?.onCommandFinished(shellId, exitCode, durationSecs);

      // ── Log de estadísticas: registrar el comando que acaba de terminar ───
      // pendingCommand guarda el texto tecleado al presionar Enter (ver
      // updateCurrentInput). Lo emparejamos aquí con su exitCode y duración.
      const loggedCmd = pendingCommand.get(shellId);
      pendingCommand.delete(shellId);
      if (loggedCmd) {
        invoke('log_command', {
          command:      loggedCmd,
          exitCode:     exitCode,
          durationSecs: durationSecs,
          cwd:          window.ocoteCwd || null,
        }).catch(() => {}); // silencioso: las stats nunca rompen el terminal
      }

      // ── extendCommandBlock: DENTRO del rAF ───────────────────────────────
      // Necesita rAF para correr fuera del ciclo de parse de xterm.js
      // (modifica overlays HTML sobre el canvas). Para esto el rAF está bien:
      // si la ventana está en fondo, el overlay se pinta cuando vuelva al foco.
      requestAnimationFrame(() => {
        window.OCOTE_PROMPT?.extendCommandBlock(
          term, saved.infoMarker, saved.chevMarker, endMarker, exitCode
        );
      });
    }
    return true;
  });

  // Reposicionar los overlays SINCRONIZADOS con el render de xterm:
  //   - onScroll: inmediato, en el mismo tick del evento de scroll (antes del paint).
  //   - onRender: tras cada repintado (output nuevo, resize) para seguir al contenido.
  // Antes se reposicionaba en un rAF propio tras onScroll, pero eso dejaba los
  // overlays un frame POR DETRÁS del canvas → arrastre visible y "doble prompt"
  // durante el scroll. Este es el mismo enfoque que la DecorationService nativa de
  // xterm. updateOverlayPositions ya calcula h/ydisp una sola vez (rowPx viene de
  // renderService, sin forzar reflow), así que es barato llamarlo por frame.
  const _reposition = () => window.OCOTE_PROMPT?.updateOverlayPositions(term);
  term.onScroll(_reposition);
  term.onRender(_reposition);

  // Apps de pantalla alternativa (vim, htop, less…) usan el buffer "alternate"
  // de xterm. Ahí no hay prompt: ocultamos los overlays y el autocompletado (si
  // no, quedan sobrepuestos a la TUI). Al volver al buffer normal, remostramos y
  // reposicionamos. onBufferChange NO dispara onScroll, por eso hace falta.
  term.buffer?.onBufferChange?.((buf) => {
    const alt = buf?.type === 'alternate';
    window.OCOTE_PROMPT?.setAltScreen?.(term, alt);
    if (alt) window.hideAutocomplete?.();
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

/**
 * Crea un marker de xterm anclado a la línea (cursor + offset). El marker sigue a
 * su línea cuando el buffer recorta (trim) o re-envuelve (reflow), y xterm lo
 * descarta solo si su línea se recorta — así los overlays no se desincronizan.
 * Fallback: pseudo-marker estático (comportamiento anterior, sin tracking) por si
 * registerMarker no estuviera disponible o devolviera null.
 */
function _makeMarker(term, offset, fallbackAbsRow) {
  try {
    const m = term.registerMarker?.(offset);
    if (m) return m;
  } catch (_) {}
  return { line: fallbackAbsRow, isDisposed: false, dispose() {} };
}

// ── Trackear input del usuario (global, aplica al tab activo) ──────────────
let currentInput = '';
let currentCommandLine = '';

// Comando pendiente por shell — se guarda al presionar Enter y se consume en
// el handler OSC 133 D para registrarlo en las estadísticas con su exit code.
const pendingCommand = new Map(); // shellId → texto del comando

function updateCurrentInput(data, shellId) {
  // Solo trackear input si este tab es el activo
  if (window.ocoteActiveShellId && shellId !== window.ocoteActiveShellId) return;

  // En apps de pantalla alternativa (vim/htop/less) las teclas van a la app, no
  // al prompt: no trackear input ni disparar autocomplete/tooltip (aparecerían
  // sobrepuestos a la TUI, que no tiene un prompt donde anclarlos).
  const _t = window.TAB_MANAGER?.getTab?.(shellId)?.term;
  if (_t?.buffer?.active?.type === 'alternate') return;
  // Comando de primer plano en ejecución — incluye TUIs que NO usan el buffer
  // alternativo (dashboards de Node como `cops`, etc.): las teclas van a la app,
  // no al prompt. Solo aplica si el shell emite OSC 133 (si no, no se limpiaría).
  if (_t?._ocoteHas133 && _t?._ocoteCmdRunning) return;

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

      // Guardar el comando para emparejarlo con su exit code en OSC 133 D
      pendingCommand.set(shellId, trimmed);

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

      // Comando enviado → marcar "en ejecución": el autocompletado no debe
      // aparecer mientras corre una app de primer plano (TUI, build, etc.).
      // Se limpia en el OSC 133 A/D del próximo prompt.
      if (_t?._ocoteHas133) _t._ocoteCmdRunning = true;
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

// ── Atajo de teclado: Cmd+Option+I → Web Inspector (solo en dev mode) ───────
// El menú contextual personalizado del explorador reemplazó el "Inspeccionar"
// del navegador. Este atajo lo restaura para debugging durante el desarrollo.
document.addEventListener('keydown', (e) => {
  if (e.metaKey && e.altKey && e.key === 'i') {
    window.__TAURI__?.window?.appWindow?.openDevtools?.();
  }
});

// ── Resize global ───────────────────────────────────────────────────────
// El fit + reposicionamiento de overlays en TODOS los panes al cambiar el tamaño
// de la ventana lo maneja un ÚNICO handler en tab-manager.js (dueño del registro
// de panes). Aquí no duplicamos el listener.
