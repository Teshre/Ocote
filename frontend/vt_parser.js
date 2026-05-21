// vt_parser.js — Parser ANSI/VT con modelo de líneas DOM
//
// Arquitectura: en lugar de devolver HTML, el parser trabaja directamente
// con el DOM. Cada línea de la terminal es un <div class="term-line">.
// Esto nos permite manejar \r (carriage return) borrando el div actual,
// lo que hace que el prompt de p10k, oh-my-zsh y terminales default
// se vean correctamente.

// --- Paletas de color ---

const ANSI_16 = [
    '#1a1a1a', // 0  black
    '#e06c75', // 1  red
    '#98c379', // 2  green
    '#e5c07b', // 3  yellow
    '#61afef', // 4  blue
    '#c678dd', // 5  magenta
    '#56b6c2', // 6  cyan
    '#abb2bf', // 7  white
    '#5c6370', // 8  bright black
    '#e06c75', // 9  bright red
    '#98c379', // 10 bright green
    '#e5c07b', // 11 bright yellow
    '#61afef', // 12 bright blue
    '#c678dd', // 13 bright magenta
    '#56b6c2', // 14 bright cyan
    '#ffffff', // 15 bright white
];

function buildPalette256() {
    const p = [...ANSI_16];
    for (let r = 0; r < 6; r++)
        for (let g = 0; g < 6; g++)
            for (let b = 0; b < 6; b++)
                p.push(`rgb(${r?r*40+55:0},${g?g*40+55:0},${b?b*40+55:0})`);
    for (let i = 0; i < 24; i++) { const v = i*10+8; p.push(`rgb(${v},${v},${v})`); }
    return p;
}

const PALETTE_256 = buildPalette256();

// --- Clase VtParser ---

class VtParser {
    // outputEl: el <div id="terminal-output"> del DOM
    constructor(outputEl) {
        this.outputEl = outputEl;

        // Estado de estilo actual — persiste entre chunks
        this.fg = this.bg = null;
        this.bold = this.italic = this.underline = false;

        // Buffer para secuencias que llegaron incompletas al final de un chunk
        this.pending = '';

        // La línea DOM activa — donde escribimos el siguiente texto
        this.currentLine = this._newLine();
    }

    // --- DOM helpers ---

    // Crea un nuevo <div class="term-line"> y lo agrega al output
    _newLine() {
        const div = document.createElement('div');
        div.className = 'term-line';
        this.outputEl.appendChild(div);
        return div;
    }

    // Borra el contenido de la línea actual sin eliminar el elemento.
    // Esto implementa el comportamiento de \r (carriage return):
    // el cursor vuelve al inicio de la línea y el siguiente texto la sobreescribe.
    _clearCurrentLine() {
        this.currentLine.innerHTML = '';
    }

    // Escribe texto al <div> de la línea actual, con el estilo vigente.
    _writeText(text) {
        if (!text) return;

        // Escapar HTML para prevenir XSS y errores de renderizado
        const safe = text
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');

        const s = [];
        if (this.fg)        s.push(`color:${this.fg}`);
        if (this.bg)        s.push(`background-color:${this.bg}`);
        if (this.bold)      s.push('font-weight:bold');
        if (this.italic)    s.push('font-style:italic');
        if (this.underline) s.push('text-decoration:underline');

        // Sin estilo activo: nodo de texto directo (más eficiente que un span)
        this.currentLine.insertAdjacentHTML(
            'beforeend',
            s.length ? `<span style="${s.join(';')}">${safe}</span>` : safe
        );
    }

    // --- SGR (Select Graphic Rendition) ---

    _resetStyle() {
        this.fg = this.bg = null;
        this.bold = this.italic = this.underline = false;
    }

    _applySgr(params) {
        let i = 0;
        while (i < params.length) {
            const p = params[i];
            if      (p === 0)  { this._resetStyle(); }
            else if (p === 1)  { this.bold      = true; }
            else if (p === 2)  { this.bold      = false; }
            else if (p === 3)  { this.italic    = true; }
            else if (p === 4)  { this.underline = true; }
            else if (p === 22) { this.bold      = false; }
            else if (p === 23) { this.italic    = false; }
            else if (p === 24) { this.underline = false; }
            else if (p >= 30 && p <= 37)   { this.fg = ANSI_16[p-30]; }
            else if (p >= 90 && p <= 97)   { this.fg = ANSI_16[p-90+8]; }
            else if (p === 39)             { this.fg = null; }
            else if (p === 38) {
                if (params[i+1]===5 && params[i+2]!==undefined)
                    { this.fg = PALETTE_256[params[i+2]]; i+=2; }
                else if (params[i+1]===2 && params[i+4]!==undefined)
                    { this.fg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i+=4; }
            }
            else if (p >= 40 && p <= 47)   { this.bg = ANSI_16[p-40]; }
            else if (p >= 100 && p <= 107) { this.bg = ANSI_16[p-100+8]; }
            else if (p === 49)             { this.bg = null; }
            else if (p === 48) {
                if (params[i+1]===5 && params[i+2]!==undefined)
                    { this.bg = PALETTE_256[params[i+2]]; i+=2; }
                else if (params[i+1]===2 && params[i+4]!==undefined)
                    { this.bg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i+=4; }
            }
            i++;
        }
    }

    // --- Procesamiento de secuencias de escape ---

    // Devuelve el número de chars consumidos, o 0 si la secuencia está incompleta.
    _handleEscape(rest) {
        if (rest.length < 2) return 0;

        const kind = rest[1];

        if (kind === '[') {
            // CSI: \x1b[ parámetros letra
            const m = rest.match(/^\x1b\[([0-9;?]*)([A-Za-z])/);
            if (!m) return 0; // incompleto — esperar más datos
            if (m[2] === 'm') {
                const nums = m[1] ? m[1].split(';').map(Number) : [0];
                this._applySgr(nums);
            }
            // Otras secuencias CSI (cursor, clear line…) → ignorar por ahora
            return m[0].length;
        }

        if (kind === ']') {
            // OSC: \x1b] … BEL o ST  (título de ventana, hyperlinks, etc.)
            const iBel = rest.indexOf('\x07', 2);
            const iSt  = rest.indexOf('\x1b\\', 2);
            let end = -1;
            if (iBel !== -1 && (iSt === -1 || iBel < iSt)) end = iBel + 1;
            else if (iSt !== -1) end = iSt + 2;
            if (end === -1) return 0; // incompleto
            return end; // consumir y descartar
        }

        // Otras secuencias de 2 chars (ESC M, ESC =, etc.)
        return 2;
    }

    // --- API pública ---

    // Procesa un chunk raw del PTY y actualiza el DOM.
    // Llámalo una vez por cada evento 'pty-output'.
    write(raw) {
        const input = this.pending + raw;
        this.pending = '';

        let pos = 0;
        let textStart = 0; // inicio del segmento de texto plano actual

        // Vuelca el texto acumulado desde textStart hasta end al DOM
        const flushText = (end) => {
            if (end > textStart) this._writeText(input.slice(textStart, end));
            textStart = end;
        };

        while (pos < input.length) {
            const ch = input[pos];

            // --- Saltos de línea ---
            if (ch === '\r') {
                flushText(pos);

                if (input[pos + 1] === '\n') {
                    // \r\n → salto de línea normal (Windows/zsh style)
                    this.currentLine = this._newLine();
                    pos += 2;
                } else if (pos + 1 >= input.length) {
                    // \r al final del chunk: podría ser \r\n partido entre dos chunks
                    // Lo buffereamos y decidimos en el próximo chunk
                    this.pending = '\r';
                    pos++;
                } else {
                    // \r solo → carriage return puro: volver al inicio y sobreescribir
                    // Aquí es donde p10k sobreescribe el prompt provisional con el final
                    this._clearCurrentLine();
                    pos++;
                }
                textStart = pos;
                continue;
            }

            if (ch === '\n') {
                flushText(pos);
                this.currentLine = this._newLine();
                pos++;
                textStart = pos;
                continue;
            }

            // --- Secuencias de escape ---
            if (ch === '\x1b') {
                flushText(pos);
                const rest = input.slice(pos);
                const consumed = this._handleEscape(rest);
                if (consumed === 0) {
                    // Secuencia incompleta: guardar en buffer y salir
                    this.pending = rest;
                    break;
                }
                pos += consumed;
                textStart = pos;
                continue;
            }

            // --- Caracteres de control no imprimibles (excepto \t) ---
            if (ch < '\x20' && ch !== '\t') {
                flushText(pos);
                pos++;
                textStart = pos;
                continue;
            }

            pos++;
        }

        // Vaciar texto restante si no terminamos en un pending
        if (!this.pending) flushText(pos);

        this.outputEl.scrollTop = this.outputEl.scrollHeight;
    }

    // Borra toda la pantalla (Ctrl+L)
    clear() {
        this.outputEl.innerHTML = '';
        this._resetStyle();
        this.currentLine = this._newLine();
    }
}
