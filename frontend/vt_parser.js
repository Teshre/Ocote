// vt_parser.js — Parser ANSI/VT con modelo de líneas DOM
// v7: CHA ignorado + diagnóstico definitivo del double-char
//
//  Root cause del doble carácter (e.g. "ccd Obsidian" al escribir "cd"):
//    zsh-autosuggestions dibuja la sugerencia en color gris (fg=8 ≈ #5c6370)
//    INMEDIATAMENTE después del texto tipado, en el mismo stream.
//    Nuestro parser renderiza ambos con el mismo peso visual:
//      "c" (bright blanco) + "cd Obsidian" (gris sugerencia) → "ccd Obsidian"
//    Solución: ZSH_AUTOSUGGEST_HIGHLIGHT_STYLE="fg=0" en pty.rs
//    hace que la sugerencia use el color del fondo (#1a1a1a) → invisible.
//
//  Root cause del backspace "hacia adelante":
//    Al borrar un carácter la sugerencia cambia y aparece más larga.
//    Con la sugerencia invisible, este efecto desaparece.
//
//  Root cause del contenido que se borraba (v6):
//    Limpiábamos la línea en CUALQUIER CHA (\x1b[nG]). ZLE manda CHA
//    dos veces por redraw: una ANTES de escribir (correcto borrar) y
//    otra DESPUÉS para posicionar el cursor (INCORRECTO borrar — borraba
//    el contenido que acababa de escribir).
//    Solución: CHA ignorado. Solo \x1b[K] y \r borran la línea.
//    El modelo correcto:  \x1b[K] ← borra  →  <contenido>  →  \x1b[G] ← ignorar

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

        // Registro de TODAS las líneas DOM
        this.lines   = [];
        this.lineIdx = -1;
        this.currentLine = null;

        // Callback opcional para responder al PTY (e.g. CPR).
        // Se puede configurar desde terminal.js si se necesita.
        this.onResponse = null;

        this._newLine();
    }

    // ── DOM helpers ──────────────────────────────────────────────────────────

    _setCurrent(div) {
        if (this.currentLine) this.currentLine.classList.remove('current');
        this.currentLine = div;
        if (div) div.classList.add('current');
    }

    _newLine() {
        const div = document.createElement('div');
        div.className = 'term-line';
        this.outputEl.appendChild(div);
        this.lines.push(div);
        this.lineIdx = this.lines.length - 1;
        this._setCurrent(div);
        return div;
    }

    _goToLine(idx) {
        const i = Math.max(0, Math.min(idx, this.lines.length - 1));
        this.lineIdx = i;
        this._setCurrent(this.lines[i]);
    }

    _advanceLine() {
        if (this.lineIdx < this.lines.length - 1) {
            this.lineIdx++;
            this._setCurrent(this.lines[this.lineIdx]);
        } else {
            this._newLine();
        }
        return this.currentLine;
    }

    _clearCurrentLine() {
        this.currentLine.innerHTML = '';
    }

    // Borra desde la línea actual hasta el final del DOM.
    // Implementa \x1b[0J] — p10k lo usa para limpiar el área del prompt.
    _clearToEnd() {
        this._clearCurrentLine();
        const removed = this.lines.splice(this.lineIdx + 1);
        removed.forEach(d => d.remove());
    }

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
            const m = rest.match(/^\x1b\[([0-9;?]*)([A-Za-z])/);
            if (!m) return 0;

            const action = m[2];
            const nums   = m[1] ? m[1].split(';').map(Number) : [];
            const p0     = nums[0] ?? 0;

            switch (action) {
                case 'm':
                    this._applySgr(nums.length ? nums : [0]);
                    break;

                case 'A':
                    this._goToLine(this.lineIdx - (p0 || 1));
                    break;

                case 'B':
                    this._goToLine(this.lineIdx + (p0 || 1));
                    break;

                case 'K':
                    // EL — Erase in Line.
                    // El redraw de ZLE siempre manda K ANTES de escribir el
                    // nuevo contenido. Sin tracking de columna, borramos toda
                    // la línea para cualquier variante (0K/1K/2K).
                    this._clearCurrentLine();
                    break;

                case 'J':
                    if (p0 === 0) {
                        // Erase from cursor to end of display.
                        // p10k: cursor-up N + 0J para redibujar el prompt
                        // sin borrar el output de comandos anteriores.
                        this._clearToEnd();
                    } else if (p0 === 2 || p0 === 3) {
                        this.outputEl.innerHTML = '';
                        this.lines   = [];
                        this.lineIdx = -1;
                        this._resetStyle();
                        this.currentLine = null;
                        this._newLine();
                    }
                    break;

                case 'G':
                    // CHA — Cursor Horizontal Absolute.
                    // ZLE manda CHA dos veces por redraw:
                    //   1. Antes de K+contenido: solo posiciona cursor
                    //   2. Después de escribir: posiciona cursor final
                    // En ninguno de los dos casos debe borrar contenido.
                    // La limpieza la hace SIEMPRE \x1b[K], no CHA.
                    // → IGNORADO completamente.
                    break;

                case 'H':
                case 'f':
                    // CUP — home sin parámetros
                    if (!p0 && !nums[1]) {
                        this._goToLine(0);
                        this._clearCurrentLine();
                    }
                    break;

                case 'n':
                    // DSR — Device Status Report
                    if (p0 === 6 && this.onResponse) {
                        this.onResponse('\x1b[1;1R');
                    }
                    break;
            }

            return m[0].length;
        }

        if (kind === ']') {
            // OSC
            const iBel = rest.indexOf('\x07', 2);
            const iSt  = rest.indexOf('\x1b\\', 2);
            let end = -1;
            if (iBel !== -1 && (iSt === -1 || iBel < iSt)) end = iBel + 1;
            else if (iSt !== -1) end = iSt + 2;
            if (end === -1) return 0;
            return end;
        }

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
                    this._advanceLine();
                    pos += 2;
                } else if (pos + 1 >= input.length) {
                    this.pending = '\r';
                    pos++;
                } else {
                    this._clearCurrentLine();
                    pos++;
                }
                textStart = pos;
                continue;
            }

            if (ch === '\n') {
                flushText(pos);
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

            if (ch < '\x20' && ch !== '\t') {
                flushText(pos);
                pos++;
                textStart = pos;
                continue;
            }

            pos++;
        }

        if (!this.pending) flushText(pos);

        requestAnimationFrame(() => {
            this.outputEl.scrollTop = this.outputEl.scrollHeight;
        });
    }

    clear() {
        this.outputEl.innerHTML = '';
        this.lines   = [];
        this.lineIdx = -1;
        this._resetStyle();
        this.pending     = '';
        this.currentLine = null;
        this._newLine();
    }
}
