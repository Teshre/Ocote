// terminal.js — Terminal con xterm.js
// Reemplaza el parser VT custom por xterm.js, que maneja correctamente
// zsh-autosuggestions, p10k, bash readline, y apps TUI (vim, htop, fzf).

const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

const container = document.getElementById('terminal-container');

// ── Tema Ocote ────────────────────────────────────────────────────────────
const OCOTE_THEME = {
  background: '#1a1a1a',
  foreground: '#e8e6df',
  cursor: '#f5a623',
  selectionBackground: 'rgba(245, 166, 35, 0.3)',
  black: '#1a1a1a',
  red: '#e06c75',
  green: '#98c379',
  yellow: '#e5c07b',
  blue: '#61afef',
  magenta: '#c678dd',
  cyan: '#56b6c2',
  white: '#abb2bf',
  brightBlack: '#5c6370',
  brightRed: '#e06c75',
  brightGreen: '#98c379',
  brightYellow: '#e5c07b',
  brightBlue: '#61afef',
  brightMagenta: '#c678dd',
  brightCyan: '#56b6c2',
  brightWhite: '#ffffff',
};

// ── Inicializar xterm.js ─────────────────────────────────────────────────
const term = new Terminal({
  theme: OCOTE_THEME,
  fontFamily: "'SF Mono', 'Fira Code', 'Cascadia Code', 'Menlo', monospace",
  fontSize: 14,
  lineHeight: 1.5,
  cursorBlink: true,
  cursorStyle: 'block',
  scrollback: 10000,
  convertEol: true,
  rightClickSelectsWord: false,
});

const fitAddon = new FitAddon.FitAddon();
term.loadAddon(fitAddon);

term.open(container);
fitAddon.fit();

// Redimensionar cuando la ventana cambie de tamaño
window.addEventListener('resize', () => {
  fitAddon.fit();
});

// ── Conectar input al PTY ────────────────────────────────────────────────
term.onData((data) => {
  // data contiene la secuencia correcta para cada tecla
  // (xterm.js maneja Ctrl, flechas, etc. internamente)
  invoke('write_to_shell', { input: data }).catch(console.error);
});

// ── Conectar output del PTY ──────────────────────────────────────────────
async function init() {
  await invoke('spawn_shell');

  await listen('pty-output', (e) => {
    term.write(e.payload);
  });

  await listen('pty-exit', () => {
    term.writeln('\r\n[Sesión terminada]');
  });
}

init().catch(console.error);
