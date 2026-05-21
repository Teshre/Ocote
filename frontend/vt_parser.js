// vt_parser.js — Parser ANSI/VT con modelo de líneas DOM
// v4: corrige tres bugs visuales
//
//  Bug 1 — GAP en el output:
//    Cuando \x1b[A movía el cursor arriba y luego llegaba un \n,
//    _newLine() creaba un div al FINAL del DOM en vez de avanzar
//    por las líneas existentes → hueco gigante entre bloques de texto.
//    Fix: _advanceLine() reutiliza la siguiente línea existente;
//    solo crea una nueva si estamos al final.
//
//  Bug 2 — Comandos invisibles:
//    \x1b[0K (erase-to-EOL, el más común) llamaba _clearCurrentLine()
//    DESPUÉS de que ZLE ya había escrito el comando en esa línea,
//    borrándolo. Fix: solo \x1b[2K (erase-entire-line explícito) borra.
//
//  Bug 3 — \x1b[G borraba la línea:
//    CHA (cursor-horizontal-absolute) solo reposiciona el cursor;
//    no borra nada. La limpieza corresponde a \r o a \x1b[2K.

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

    // Avanza a la siguiente línea.
    //
    // Diferencia clave con _newLine():
    //   Si el cursor fue movido hacia arriba (via \x1b[A]) y hay líneas
    //   por debajo, las REUTILIZA en lugar de crear nuevas al final del DOM.
    //   Esto evita el "gap" visual causado por divs vacíos intercalados.
    //
    // Solo crea un div nuevo cuando realmente estamos al final.
    _advanceLine() {
        if (this.lineIdx < this.lines.length - 1) {
            // Hay una línea DOM por debajo — avanzamos a ella
            this.lineIdx++;
            this.currentLine = this.lines[this.lineIdx];
        } else {
            // Estamos en la última línea — creamos una nueva
            this.currentLine = this._newLine();
        }
        return this.currentLine;
    }

    // Borra el contenido de la línea actual (implementa \r y \x1b[2K)
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
                    // Cursor arriba N líneas
                    this._goToLine(this.lineIdx - (p0 || 1));
                    break;

                case 'B':
                    // Cursor abajo N líneas
                    this._goToLine(this.lineIdx + (p0 || 1));
                    break;

                case 'K':
                    // Erase in line:
                    //   0K (o K sin parámetro): erase desde cursor hasta EOL
                    //     → IGNORADO. No rastreamos columna; el texto ya escrito
                    //       es correcto. Si limpiáramos aquí, borraríamos el
                    //       comando que ZLE acaba de dibujar en la línea.
                    //   1K: erase desde inicio hasta cursor → IGNORADO (sin columna)
                    //   2K: erase línea entera → SÍ se ejecuta (semántica clara)
                    if (p0 === 2) this._clearCurrentLine();
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
                    // CHA — Cursor Horizontal Absolute (\x1b[NG)
                    // Solo reposiciona el cursor en la columna N.
                    // NO borra la línea. El borrado corresponde a:
                    //   - \r  (carriage return): sí borra en nuestro modelo
                    //   - \x1b[2K]: erase-entire-line explícito
                    // Ignoramos porque no rastreamos posición de columna.
                    break;

                case 'H':
                case 'f':
                    // Cursor position — solo manejamos home (sin parámetros)
                    if (!p0 && !nums[1]) {
                        this._goToLine(0);
                        this._clearCurrentLine();
                    }
                    break;

                // C (cursor right), D (cursor left), s/u (save/restore), etc.
                // → ignorados, no afectan contenido visible
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
                    // \r\n → avanzar a siguiente línea.
                    // _advanceLine() en vez de _newLine(): reutiliza divs
                    // existentes cuando el cursor fue movido arriba con \x1b[A,
                    // evitando el gap entre bloques de output.
                    this._advanceLine();
                    pos += 2;
                } else if (pos + 1 >= input.length) {
                    // \r al final del chunk — puede ser \r\n partido
                    this.pending = '\r';
                    pos++;
                } else {
                    // \r solo → carriage return: ir al inicio y sobreescribir
                    this._clearCurrentLine();
                    pos++;
                }
                textStart = pos;
                continue;
            }

            if (ch === '\n') {
                flushText(pos);
                // _advanceLine() en vez de _newLine(): reutiliza la siguiente
                // línea DOM si el cursor fue movido arriba con \x1b[A.
                this._advanceLine();
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
        // antes de calcular scrollHeight
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
