// terminal.js — Renderizador del output y manejo del input

// Con withGlobalTauri:true en tauri.conf.json, Tauri inyecta la API completa.
// invoke está en el nivel raíz; listen está bajo .event
const { invoke } = window.__TAURI__;
const { listen } = window.__TAURI__.event;

const outputEl = document.getElementById('terminal-output');
const inputEl  = document.getElementById('terminal-input');

const history = [];
let historyIndex = -1;

// --- Limpieza de secuencias ANSI (placeholder Fase 1) ---
// zsh y bash producen secuencias de escape complejas para colores y cursor.
// Por ahora las eliminamos para mostrar texto plano legible.
// En Fase 1 Semanas 5-7 esto se reemplaza por conversión ANSI → <span> con color real.
function stripAnsi(str) {
    return str
        // OSC: título de ventana, colores de terminal (\x1b]...BEL o \x1b]...ST)
        .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, '')
        // DCS: secuencias de control de dispositivo
        .replace(/\x1bP[^\x1b]*\x1b\\/g, '')
        // CSI: colores, movimiento de cursor, borrado (\x1b[...letra)
        .replace(/\x1b\[[\d;?]*[a-zA-Z]/g, '')
        // Secuencias de charset y modos simples
        .replace(/\x1b[()][AB012B]/g, '')
        .replace(/\x1b[=>< M78]/g, '')
        // Cualquier ESC restante seguido de un carácter
        .replace(/\x1b./g, '')
        // Caracteres de control no imprimibles (excepto \n, \r, \t)
        .replace(/[\x00-\x08\x0b\x0c\x0e-\x1f\x7f]/g, '');
}

// Agrega texto al área de output y hace scroll al final
function appendOutput(text) {
    const clean = stripAnsi(text);
    if (!clean) return;

    const span = document.createElement('span');
    span.textContent = clean;
    outputEl.appendChild(span);
    outputEl.scrollTop = outputEl.scrollHeight;
}

// --- Inicialización ---
async function init() {
    // Arrancar la shell (bash, zsh, o lo que tenga el usuario en $SHELL)
    await invoke('spawn_shell');

    // Escuchar el output que la shell produce
    await listen('pty-output', (e) => {
        appendOutput(e.payload);
    });

    // Cuando la shell termina (el usuario escribió 'exit')
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
        if (cmd.trim()) {
            history.unshift(cmd);
            historyIndex = -1;
        }
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
        if (historyIndex > 0) {
            historyIndex--;
            inputEl.value = history[historyIndex];
        } else {
            historyIndex = -1;
            inputEl.value = '';
        }
        return;
    }

    // Ctrl+C — señal de interrupción al proceso en ejecución
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
