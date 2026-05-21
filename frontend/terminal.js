// terminal.js — Renderizador del output y manejo del input

const { invoke } = window.__TAURI__;
const { listen }  = window.__TAURI__.event;

const outputEl = document.getElementById('terminal-output');
const inputEl  = document.getElementById('terminal-input');

const history = [];
let historyIndex = -1;

// Agrega un chunk de output al área de la terminal.
// vtParser (definido en vt_parser.js) convierte ANSI → HTML con colores.
function appendOutput(raw) {
    const html = window.vtParser.render(raw);
    if (!html) return;

    // insertAdjacentHTML es más eficiente que innerHTML += para acumular contenido
    outputEl.insertAdjacentHTML('beforeend', html);
    outputEl.scrollTop = outputEl.scrollHeight;
}

// --- Inicialización ---
async function init() {
    await invoke('spawn_shell');

    await listen('pty-output', (e) => {
        appendOutput(e.payload);
    });

    await listen('pty-exit', () => {
        appendOutput('\r\n[Sesión terminada]\r\n');
        inputEl.disabled = true;
    });

    inputEl.focus();
}

// --- Manejo del teclado ---
inputEl.addEventListener('keydown', async (e) => {

    if (e.key === 'Enter') {
        const cmd = inputEl.value;
        if (cmd.trim()) { history.unshift(cmd); historyIndex = -1; }
        await invoke('write_to_shell', { input: cmd + '\n' });
        inputEl.value = '';
        return;
    }

    if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (historyIndex < history.length - 1) {
            historyIndex++;
            inputEl.value = history[historyIndex];
        }
        return;
    }

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (historyIndex > 0) { historyIndex--; inputEl.value = history[historyIndex]; }
        else { historyIndex = -1; inputEl.value = ''; }
        return;
    }

    // Ctrl+C — señal de interrupción
    if (e.ctrlKey && e.key === 'c') {
        await invoke('write_to_shell', { input: '\x03' });
        inputEl.value = '';
        return;
    }

    // Ctrl+L — limpiar pantalla
    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        outputEl.innerHTML = '';
        await invoke('write_to_shell', { input: '\x0c' });
        return;
    }
});

outputEl.addEventListener('click', () => inputEl.focus());

init().catch(console.error);
