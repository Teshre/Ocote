// vt_parser.js — Parser ANSI/VT con modelo de líneas DOM
// v3: agrega tracking de líneas para cursor up/down y erase sequences

// --- Paletas de color ---

const ANSI_16 = [
    '#1a1a1a', '#e06c75', '#98c379', '#e5c07b',
    '#61afef', '#c678dd', '#56b6c2', '#abb2bf',
    '#5c6370', '#e06c75', '#98c379', '#e5c07b',
    '#61afef', '#c678dd', '#56b6c2', '#ffffff',
];

function buildPalette256() {
    const p = [...ANSI_16];
    for (let r = 0; r < 6; r++)
        for (let g = 0; g < 6; g++)
            for (let b = 0; b < 6; b++)
                p.push(`rgb(${r?r*40+55:0},${g?g*40+55:0},${b?b*40+55:0})`);
    for (let i = 0; i < 24; i++) { const v=i*10+8; p.push(`rgb(${v},${v},${v})`); }
    return p;
}
const PALETTE_256 = buildPalette256();

// --- Clase VtParser ---

class VtParser {
    constructor(outputEl) {
        this.outputEl = outputEl;

        // Estilo actual
        this.fg = this.bg = null;
        this.bold = this.italic = this.underline = false;

        // Buffer para secuencias incompletas entre chunks
        this.pending = '';

        // Registro de TODAS las líneas DOM.
        // Necesario para que \x1b[A (cursor arriba) pueda volver a editar
        // una línea anterior — p10k lo usa para redibujar el prompt.
        this.lines   = [];
        this.lineIdx = -1;
        this.currentLine = this._newLine();
    }

    // ── DOM helpers ──────────────────────────────────────────────────────────

    _newLine() {
        const div = document.createElement('div');
        div.className = 'term-line';
        this.outputEl.appendChild(div);
        this.lines.push(div);
        this.lineIdx = this.lines.length - 1;
        return div;
    }

    // Mueve el "cursor" a una línea existente por índice
    _goToLine(idx) {
        const i = Math.max(0, Math.min(idx, this.lines.length - 1));
        this.lineIdx    = i;
        this.currentLine = this.lines[i];
    }

    // Borra el contenido de la línea actual (implementa \r, \x1b[2K, \x1b[1G)
    _clearCurrentLine() {
        this.currentLine.innerHTML = '';
    }

    // Escribe texto con el estilo actual a la línea activa
    _writeText(text) {
        if (!text) return;
        const safe = text.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
        const s = [];
        if (this.fg)        s.push(`color:${this.fg}`);
        if (this.bg)        s.push(`background-color:${this.bg}`);
        if (this.bold)      s.push('font-weight:bold');
        if (this.italic)    s.push('font-style:italic');
        if (this.underline) s.push('text-decoration:underline');
        this.currentLine.insertAdjacentHTML(
            'beforeend',
            s.length ? `<span style="${s.join(';')}">${safe}</span>` : safe
        );
    }

    // ── Estilos SGR ──────────────────────────────────────────────────────────

    _resetStyle() { this.fg = this.bg = null; this.bold = this.italic = this.underline = false; }

    _applySgr(params) {
        let i = 0;
        while (i < params.length) {
            const p = params[i];
            if      (p===0)  { this._resetStyle(); }
            else if (p===1)  { this.bold=true; }
            else if (p===2)  { this.bold=false; }
            else if (p===3)  { this.italic=true; }
            else if (p===4)  { this.underline=true; }
            else if (p===22) { this.bold=false; }
            else if (p===23) { this.italic=false; }
            else if (p===24) { this.underline=false; }
            else if (p>=30&&p<=37)   { this.fg=ANSI_16[p-30]; }
            else if (p>=90&&p<=97)   { this.fg=ANSI_16[p-90+8]; }
            else if (p===39)         { this.fg=null; }
            else if (p===38) {
                if (params[i+1]===5&&params[i+2]!==undefined) { this.fg=PALETTE_256[params[i+2]]; i+=2; }
                else if (params[i+1]===2&&params[i+4]!==undefined) { this.fg=`rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i+=4; }
            }
            else if (p>=40&&p<=47)   { this.bg=ANSI_16[p-40]; }
            else if (p>=100&&p<=107) { this.bg=ANSI_16[p-100+8]; }
            else if (p===49)         { this.bg=null; }
            else if (p===48) {
                if (params[i+1]===5&&params[i+2]!==undefined) { this.bg=PALETTE_256[params[i+2]]; i+=2; }
                else if (params[i+1]===2&&params[i+4]!==undefined) { this.bg=`rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i+=4; }
            }
            i++;
        }
    }

    // ── Secuencias de escape ─────────────────────────────────────────────────

    // Devuelve chars consumidos, 0 si la secuencia está incompleta.
    _handleEscape(rest) {
        if (rest.length < 2) return 0;
        const kind = rest[1];

        if (kind === '[') {
            // CSI: \x1b[ parámetros acción
            const m = rest.match(/^\x1b\[([0-9;?]*)([A-Za-z])/);
            if (!m) return 0;

            const action = m[2];
            const nums   = m[1] ? m[1].split(';').map(Number) : [];
            const p0     = nums[0] ?? 0;

            switch (action) {
                case 'm':
                    // SGR — colores y estilos
                    this._applySgr(nums.length ? nums : [0]);
                    break;

                case 'A':
                    // Cursor arriba N líneas — p10k lo usa para redibujar el prompt
                    this._goToLine(this.lineIdx - (p0 || 1));
                    break;

                case 'B':
                    // Cursor abajo N líneas
                    this._goToLine(this.lineIdx + (p0 || 1));
                    break;

                case 'K':
                    // Erase in line:
                    //   0K (o K solo): borrar desde cursor hasta fin de línea
                    //   1K: borrar desde inicio hasta cursor
                    //   2K: borrar línea entera
                    // Como no rastreamos columna, aproximamos los 3 como "borrar línea"
                    this._clearCurrentLine();
                    break;

                case 'J':
                    // Erase in display — 2J/3J: borrar pantalla completa
                    if (p0 === 2 || p0 === 3) {
                        this.outputEl.innerHTML = '';
                        this.lines   = [];
                        this.lineIdx = -1;
                        this._resetStyle();
                        this.currentLine = this._newLine();
                    }
                    break;

                case 'G':
                    // Cursor a columna N.
                    // Columna 1 (o 0) = inicio de línea, equivale a \r
                    // Para columnas > 1 ignoramos porque no rastreamos posición X.
                    if (!p0 || p0 === 1) this._clearCurrentLine();
                    break;

                case 'H':
                case 'f':
                    // Cursor position \x1b[row;colH — ir a fila, columna
                    // Solo manejamos el caso de "ir a home" (sin parámetros)
                    if (!p0 && !nums[1]) {
                        this._goToLine(0);
                        this._clearCurrentLine();
                    }
                    break;

                // El resto (C cursor right, D cursor left, s/u save/restore, etc.)
                // los ignoramos por ahora — no afectan el contenido visible
            }

            return m[0].length;
        }

        if (kind === ']') {
            // OSC: título de ventana, hyperlinks, colores del tema, etc.
            const iBel = rest.indexOf('\x07', 2);
            const iSt  = rest.indexOf('\x1b\\', 2);
            let end = -1;
            if (iBel !== -1 && (iSt === -1 || iBel < iSt)) end = iBel + 1;
            else if (iSt !== -1) end = iSt + 2;
            if (end === -1) return 0;
            return end;
        }

        // Otras secuencias de 2 chars
        return 2;
    }

    // ── API pública ──────────────────────────────────────────────────────────

    write(raw) {
        const input = this.pending + raw;
        this.pending = '';

        let pos = 0;
        let textStart = 0;

        const flushText = (end) => {
            if (end > textStart) this._writeText(input.slice(textStart, end));
            textStart = end;
        };

        while (pos < input.length) {
            const ch = input[pos];

            if (ch === '\r') {
                flushText(pos);
                if (input[pos + 1] === '\n') {
                    // \r\n → nuevo línea
                    this.currentLine = this._newLine();
                    pos += 2;
                } else if (pos + 1 >= input.length) {
                    // \r al final del chunk — puede ser \r\n partido
                    this.pending = '\r';
                    pos++;
                } else {
                    // \r solo → carriage return: volver al inicio y sobreescribir
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

            if (ch === '\x1b') {
                flushText(pos);
                const rest = input.slice(pos);
                const consumed = this._handleEscape(rest);
                if (consumed === 0) { this.pending = rest; break; }
                pos += consumed;
                textStart = pos;
                continue;
            }

            // Caracteres de control no imprimibles (excepto \t)
            if (ch < '\x20' && ch !== '\t') {
                flushText(pos);
                pos++;
                textStart = pos;
                continue;
            }

            pos++;
        }

        if (!this.pending) flushText(pos);

        // requestAnimationFrame garantiza que el DOM ya fue pintado
        // antes de calcular scrollHeight, evitando el bug de scroll al tope
        requestAnimationFrame(() => {
            this.outputEl.scrollTop = this.outputEl.scrollHeight;
        });
    }

    // Borra toda la pantalla (Ctrl+L)
    clear() {
        this.outputEl.innerHTML = '';
        this.lines   = [];
        this.lineIdx = -1;
        this._resetStyle();
        this.pending     = '';
        this.currentLine = this._newLine();
    }
}
