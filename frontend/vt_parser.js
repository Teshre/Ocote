// vt_parser.js — Convierte secuencias ANSI/VT a HTML con colores
//
// Diseño: clase con estado que vive durante toda la sesión.
// El estado persiste entre chunks porque una secuencia de escape puede
// llegar partida en dos eventos 'pty-output' diferentes.
//
// Fase 1 — implementa: colores SGR, bold, italic, underline.
// Fase 2 — agregará: screen buffer, cursor positioning, scroll.

// --- Paletas de color ---

// 16 colores estándar ANSI (coinciden con las variables de theme.css)
const ANSI_16 = [
    '#1a1a1a', // 0  black
    '#e06c75', // 1  red
    '#98c379', // 2  green
    '#e5c07b', // 3  yellow
    '#61afef', // 4  blue
    '#c678dd', // 5  magenta
    '#56b6c2', // 6  cyan
    '#abb2bf', // 7  white
    '#5c6370', // 8  bright black (gris)
    '#e06c75', // 9  bright red
    '#98c379', // 10 bright green
    '#e5c07b', // 11 bright yellow
    '#61afef', // 12 bright blue
    '#c678dd', // 13 bright magenta
    '#56b6c2', // 14 bright cyan
    '#ffffff', // 15 bright white
];

// Paleta de 256 colores completa (usada por 38;5;n y 48;5;n)
// Índices 0-15:   los 16 estándar de arriba
// Índices 16-231: cubo de color 6×6×6
// Índices 232-255: escala de grises de 24 pasos
function buildPalette256() {
    const p = [...ANSI_16];
    for (let r = 0; r < 6; r++) {
        for (let g = 0; g < 6; g++) {
            for (let b = 0; b < 6; b++) {
                p.push(`rgb(${r ? r*40+55 : 0},${g ? g*40+55 : 0},${b ? b*40+55 : 0})`);
            }
        }
    }
    for (let i = 0; i < 24; i++) {
        const v = i * 10 + 8;
        p.push(`rgb(${v},${v},${v})`);
    }
    return p;
}

const PALETTE_256 = buildPalette256();

// --- Clase VtParser ---

class VtParser {
    constructor() {
        // Estado de color y estilo actual — persiste entre chunks
        this._resetStyle();
        // Buffer para secuencias de escape que llegaron incompletas
        this.pending = '';
    }

    _resetStyle() {
        this.fg        = null;   // color de texto (null = default del tema)
        this.bg        = null;   // color de fondo
        this.bold      = false;
        this.italic    = false;
        this.underline = false;
    }

    // Aplica los parámetros de una secuencia SGR (Select Graphic Rendition)
    // Ejemplos: \x1b[32m → verde, \x1b[1;33m → bold amarillo, \x1b[0m → reset
    _applySgr(params) {
        let i = 0;
        while (i < params.length) {
            const p = params[i];
            if      (p === 0)  { this._resetStyle(); }
            else if (p === 1)  { this.bold      = true; }
            else if (p === 2)  { this.bold      = false; }  // dim → quitar bold
            else if (p === 3)  { this.italic    = true; }
            else if (p === 4)  { this.underline = true; }
            else if (p === 22) { this.bold      = false; }
            else if (p === 23) { this.italic    = false; }
            else if (p === 24) { this.underline = false; }
            // Colores de texto estándar (30-37) y brillantes (90-97)
            else if (p >= 30 && p <= 37) { this.fg = ANSI_16[p - 30]; }
            else if (p >= 90 && p <= 97) { this.fg = ANSI_16[p - 90 + 8]; }
            else if (p === 39)           { this.fg = null; }   // default fg
            // Color de texto extendido: 256-color (38;5;n) o true color (38;2;r;g;b)
            else if (p === 38) {
                if (params[i+1] === 5 && params[i+2] !== undefined) {
                    this.fg = PALETTE_256[params[i+2]]; i += 2;
                } else if (params[i+1] === 2 && params[i+4] !== undefined) {
                    this.fg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i += 4;
                }
            }
            // Colores de fondo estándar (40-47) y brillantes (100-107)
            else if (p >= 40 && p <= 47)   { this.bg = ANSI_16[p - 40]; }
            else if (p >= 100 && p <= 107) { this.bg = ANSI_16[p - 100 + 8]; }
            else if (p === 49)             { this.bg = null; }  // default bg
            // Color de fondo extendido: 256-color (48;5;n) o true color (48;2;r;g;b)
            else if (p === 48) {
                if (params[i+1] === 5 && params[i+2] !== undefined) {
                    this.bg = PALETTE_256[params[i+2]]; i += 2;
                } else if (params[i+1] === 2 && params[i+4] !== undefined) {
                    this.bg = `rgb(${params[i+2]},${params[i+3]},${params[i+4]})`; i += 4;
                }
            }
            i++;
        }
    }

    // Envuelve texto con el estilo actual en un <span>
    // Si no hay estilo activo, devuelve el texto plano (más eficiente)
    _makeSpan(text) {
        if (!text) return '';

        // Escapar caracteres HTML para evitar XSS y errores de renderizado
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

        if (s.length === 0) return safe;
        return `<span style="${s.join(';')}">${safe}</span>`;
    }

    // Convierte un chunk raw del PTY a HTML.
    // Llámalo una vez por cada evento 'pty-output'.
    // Devuelve un string HTML listo para asignar a innerHTML.
    render(raw) {
        // Prepender cualquier secuencia incompleta del chunk anterior
        const input = this.pending + raw;
        this.pending = '';

        let html = '';
        let pos  = 0;

        while (pos < input.length) {
            const esc = input.indexOf('\x1b', pos);

            if (esc === -1) {
                // Sin más escapes: el resto es texto plano
                html += this._makeSpan(input.slice(pos));
                break;
            }

            // Texto plano antes del escape
            if (esc > pos) html += this._makeSpan(input.slice(pos, esc));

            const rest = input.slice(esc);

            // Necesitamos al menos \x1b + 1 char para saber el tipo
            if (rest.length < 2) { this.pending = rest; break; }

            const kind = rest[1];

            if (kind === '[') {
                // CSI: \x1b[ ... letra_final
                const m = rest.match(/^\x1b\[([0-9;?]*)([A-Za-z])/);
                if (!m) { this.pending = rest; break; }   // incompleto

                if (m[2] === 'm') {
                    // SGR — la única secuencia que nos importa ahora
                    const nums = m[1] ? m[1].split(';').map(Number) : [0];
                    this._applySgr(nums);
                }
                // Movimiento de cursor, clear line, etc. → ignorar (Fase 2)
                pos = esc + m[0].length;

            } else if (kind === ']') {
                // OSC: \x1b] ... BEL(\x07) o ST(\x1b\\)
                // Usada para título de ventana, colores de terminal, etc.
                const iBel = rest.indexOf('\x07', 2);
                const iSt  = rest.indexOf('\x1b\\', 2);
                let end = -1;
                if (iBel !== -1 && (iSt === -1 || iBel < iSt)) end = iBel + 1;
                else if (iSt !== -1) end = iSt + 2;

                if (end === -1) { this.pending = rest; break; } // incompleto
                // Ignoramos el contenido OSC — solo lo consumimos
                pos = esc + end;

            } else {
                // Otras secuencias de 2 chars (ESC M, ESC =, etc.) → ignorar
                pos = esc + 2;
            }
        }

        return html;
    }
}

// Instancia global — compartida por terminal.js
window.vtParser = new VtParser();
