// terminal.js — Input/output de la terminal
// v2: input directo al PTY, carácter por carácter
//
// Arquitectura anterior: HTML <input> que acumulaba texto y mandaba
// el comando completo al presionar Enter. Problema: ZLE recibía todos
// los caracteres de golpe, aceptaba el comando sin hacer echo individual
// de cada letra, y los comandos nunca aparecían junto al prompt ❯.
//
// Arquitectura nueva: el área de output captura el teclado directamente.
// Cada tecla se envía al PTY de inmediato. ZLE las recibe una a una,
// las echa de vuelta al stream de output, y las muestra junto al ❯
// exactamente como en una terminal real.
//
// Beneficios:
//   - Los comandos aparecen mientras se escriben ✓
//   - Tab-completion funciona nativamente ✓
//   - Inline editing con ← → funciona ✓
//   - Historial con ↑ ↓ lo maneja ZLE directamente ✓
//   - Ctrl+R (búsqueda reversa) funciona ✓

const { invoke } = window.__TAURI__;
const { listen }  = window.__TAURI__.event;

const outputEl = document.getElementById('terminal-output');

// El parser maneja todo el renderizado DOM directamente
const vtParser = new VtParser(outputEl);

// --- Inicialización ---
async function init() {
    await invoke('spawn_shell');

    await listen('pty-output', (e) => {
        vtParser.write(e.payload);
    });

    await listen('pty-exit', () => {
        vtParser.write('\r\n[Sesión terminada]\r\n');
    });

    outputEl.focus();
}

// --- Envío al PTY ---
async function sendToPty(str) {
    try {
        await invoke('write_to_shell', { input: str });
    } catch (err) {
        console.error('write_to_shell:', err);
    }
}

// --- Manejo del teclado ---
// El área de output tiene tabindex="0" (ver index.html), así que puede
// recibir foco y capturar keydown. Cada tecla se traduce a la secuencia
// de escape correcta y se envía al PTY inmediatamente.
outputEl.addEventListener('keydown', async (e) => {
    // Dejar pasar atajos del sistema (Cmd+C copiar, Cmd+V pegar, etc.)
    if (e.metaKey) return;

    // ── Ctrl + letra ─────────────────────────────────────────────────
    // Ctrl+A–Z = bytes \x01–\x1A (control characters estándar de Unix)
    if (e.ctrlKey && e.key.length === 1) {
        e.preventDefault();
        const code = e.key.toUpperCase().charCodeAt(0) - 64; // A=1, B=2 ...
        if (code >= 1 && code <= 26) {
            if (code === 12) vtParser.clear(); // Ctrl+L: también limpiar el DOM
            await sendToPty(String.fromCharCode(code));
        }
        return;
    }

    // ── Teclas especiales ─────────────────────────────────────────────
    switch (e.key) {
        case 'Enter':
            e.preventDefault();
            // '\r' (CR) es lo correcto para terminales — ZLE lo espera en raw mode
            await sendToPty('\r');
            return;

        case 'Backspace':
            e.preventDefault();
            await sendToPty('\x7f'); // DEL — borra carácter a la izquierda
            return;

        case 'Delete':
            e.preventDefault();
            await sendToPty('\x1b[3~'); // borra carácter a la derecha
            return;

        case 'Tab':
            e.preventDefault();
            await sendToPty('\t'); // tab-completion en ZLE
            return;

        case 'Escape':
            e.preventDefault();
            await sendToPty('\x1b');
            return;

        case 'ArrowUp':
            e.preventDefault();
            await sendToPty('\x1b[A'); // historial anterior (ZLE lo maneja)
            return;

        case 'ArrowDown':
            e.preventDefault();
            await sendToPty('\x1b[B'); // historial siguiente
            return;

        case 'ArrowRight':
            e.preventDefault();
            await sendToPty('\x1b[C'); // mover cursor derecha en la línea
            return;

        case 'ArrowLeft':
            e.preventDefault();
            await sendToPty('\x1b[D'); // mover cursor izquierda en la línea
            return;

        case 'Home':
            e.preventDefault();
            await sendToPty('\x1b[H'); // inicio de línea (equivale a Ctrl+A en zsh)
            return;

        case 'End':
            e.preventDefault();
            await sendToPty('\x1b[F'); // fin de línea (equivale a Ctrl+E)
            return;

        case 'PageUp':
            e.preventDefault();
            await sendToPty('\x1b[5~');
            return;

        case 'PageDown':
            e.preventDefault();
            await sendToPty('\x1b[6~');
            return;

        case 'Insert':
            e.preventDefault();
            await sendToPty('\x1b[2~');
            return;
    }

    // ── Caracteres imprimibles ────────────────────────────────────────
    // e.key.length === 1 filtra F1-F12, Shift, etc.
    // !e.altKey excluye AltGr combos (aunque en macOS Alt genera caracteres)
    if (e.key.length === 1 && !e.ctrlKey) {
        e.preventDefault();
        await sendToPty(e.key);
        return;
    }
});

// Clic en el output → dar foco para capturar el teclado
outputEl.addEventListener('click', () => outputEl.focus());

init().catch(console.error);
