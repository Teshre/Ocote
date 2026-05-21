// terminal.js — Renderizador del output y manejo del input

const { invoke } = window.__TAURI__;
const { listen }  = window.__TAURI__.event;

const outputEl = document.getElementById('terminal-output');
const inputEl  = document.getElementById('terminal-input');

// El parser maneja todo el renderizado DOM directamente
const vtParser = new VtParser(outputEl);

const history = [];
let historyIndex = -1;

// --- Inicialización ---
async function init() {
    await invoke('spawn_shell');

    await listen('pty-output', (e) => {
        vtParser.write(e.payload);
    });

    await listen('pty-exit', () => {
        vtParser.write('\r\n[Sesión terminada]\r\n');
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

    if (e.ctrlKey && e.key === 'c') {
        await invoke('write_to_shell', { input: '\x03' });
        inputEl.value = '';
        return;
    }

    if (e.ctrlKey && e.key === 'l') {
        e.preventDefault();
        vtParser.clear();
        await invoke('write_to_shell', { input: '\x0c' });
        return;
    }
});

outputEl.addEventListener('click', () => inputEl.focus());

init().catch(console.error);
