// prompt.js — Sistema de presets de prompt de Ocote
// ---------------------------------------------------------------------------
// Arquitectura:
//   1. Shell emite OSC 6731 con JSON {cwd, branch, dirty, time, exit}
//   2. Shell emite OSC 133 A al FINAL del PROMPT (después de ❯ en pantalla)
//   3. terminal.js: OSC 6731 → guarda meta; OSC 133 A → llama showPromptOverlay()
//   4. prompt.js crea un <div> posicionado sobre la fila info (la línea encima de ❯)
//
// Por qué NO usamos la Decoration API de xterm.js:
//   registerDecoration() interfiere con el canvas renderer y hace que todo el
//   texto del terminal sea invisible. El overlay system propio no toca el canvas.
//
// El PS1 en zsh sigue teniendo ANSI como fallback (si JS falla, se ve texto).

window.OCOTE_PROMPT = (() => {
  'use strict';

  // ── Acceso al tema ─────────────────────────────────────────────────────────
  function theme() {
    return window.OCOTE_THEMES?.getCurrentTokens?.() ?? {
      accent: '#E8843A', green: '#7DC97A', blue: '#82A6E0',
      comment: '#6F6552', warning: '#E8C03A', fg: '#E2D6BD', bg: '#14100C',
    };
  }

  function termBg() {
    // Leer el background del tema activo — el mismo color que xterm.js usa para el canvas.
    const id = localStorage.getItem('ocote_theme') || 'ocote';
    return window.OCOTE_THEMES?.THEMES?.[id]?.xterm?.background
      || window.OCOTE_THEMES?.THEMES?.['ocote']?.xterm?.background
      || '#14100C';
  }

  function a(hex, alpha) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  // ── SVGs inline (Tabler Icons MIT) ────────────────────────────────────────
  const SVG = {
    folder: (c, s = 11) =>
      `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
      `<path d="M1.5 4.2C1.5 3.5 2 3 2.7 3H6L7.2 4.2H13.3C14 4.2 14.5 4.7 14.5 5.4V11.6` +
      `C14.5 12.3 14 12.8 13.3 12.8H2.7C2 12.8 1.5 12.3 1.5 11.6Z" ` +
      `fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/></svg>`,
    branch: (c, s = 11) =>
      `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
      `<circle cx="4" cy="3.5" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<circle cx="4" cy="12.5" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<circle cx="12" cy="8" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<path d="M4 5.1V10.9M5.6 3.5H10C11.1 3.5 12 4.4 12 5.5V6.4" ` +
      `fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    clock: (c, s = 11) =>
      `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
      `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<path d="M8 4.6V8L10.4 9.4" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`,
    check: (c, s = 11) =>
      `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
      `<path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="${c}" ` +
      `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,
    flame: (c, s = 13) =>
      `<svg viewBox="0 0 16 16" width="${s}" height="${s}" style="vertical-align:-2px;flex-shrink:0">` +
      `<path d="M8 1.5C9.6 4 11.2 4.6 11.2 7.5C11.2 9.4 10.2 10.6 8.8 11.1C9.6 10.4 9.8 9 9 7.8` +
      `C8.4 8.8 7.6 9 7.2 8.4C7 7.6 7.6 6.8 7 5.8C6 7 4.8 8.4 4.8 10.4C4.8 12.6 6.4 14 8 14` +
      `C9.8 14 11.6 12.4 11.6 10C11.6 6 9 5.2 8 1.5Z" fill="${c}"/></svg>`,
  };

  // ── Renderers — para Settings picker (tamaño normal) ──────────────────────
  // meta = { cwd, branch, dirty, time, exit }
  const renders = {

    pill(m, t) {
      const path =
        `<span style="display:inline-flex;align-items:center;gap:5px;` +
        `background:${a(t.accent, .18)};color:${t.accent};` +
        `padding:2px 10px;border-radius:999px;border:1px solid ${a(t.accent, .32)};` +
        `font-weight:600">` +
        `${SVG.folder(t.accent)}${m.cwd}</span>`;

      const git = m.branch
        ? `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.green};` +
          `padding:2px 10px;border-radius:999px;border:1px solid ${a(t.green, .32)}">` +
          `${SVG.branch(t.green)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};font-weight:600">+${m.dirty}</span>` : '') +
          `</span>`
        : '';

      const time =
        `<span style="display:inline-flex;align-items:center;gap:4px;` +
        `color:${t.comment};font-size:.92em">` +
        `${SVG.clock(t.comment)}${m.time}</span>`;

      return `<div style="display:flex;align-items:center;gap:6px">${path}${git}${time}</div>`;
    },

    block(m, t) {
      const git = m.branch
        ? `<span style="color:${a(t.comment, .6)}">·</span>` +
          `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green}">` +
          `${SVG.branch(t.green, 10)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};font-weight:600">+${m.dirty}</span>` : '') +
          `</span>`
        : '';

      return (
        `<div style="display:flex;align-items:center;gap:9px;` +
        `color:${t.comment};font-size:.86em">` +
        `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.accent};font-weight:600">` +
        `${SVG.folder(t.accent, 10)}${m.cwd}</span>` +
        git +
        `<span style="flex:1"></span>` +
        `<span style="display:inline-flex;align-items:center;gap:4px">` +
        `${SVG.clock(t.comment, 10)}${m.time}</span>` +
        `</div>`
      );
    },

    minimal() { return null; },

    ribbon(m, t) {
      const git = m.branch
        ? `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green}">` +
          `${SVG.branch(t.green, 10)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};font-weight:600;margin-left:1px">+${m.dirty}</span>` : '') +
          `</span>`
        : '';

      return (
        `<div style="display:inline-flex;align-items:center;gap:11px;` +
        `padding:2px 0 6px;border-bottom:1.5px solid ${t.accent};` +
        `position:relative;max-width:100%">` +
        `<span style="position:absolute;left:0;right:0;bottom:-1.5px;height:1.5px;` +
        `background:linear-gradient(90deg,${t.accent} 0%,transparent 100%)"></span>` +
        `<span style="display:inline-flex;align-items:center;gap:5px;` +
        `color:${t.accent};font-weight:600">` +
        `${SVG.folder(t.accent)}${m.cwd}</span>` +
        git +
        `<span style="display:inline-flex;align-items:center;gap:4px;` +
        `color:${t.comment};font-size:.9em">` +
        `${SVG.clock(t.comment, 10)}${m.time}</span>` +
        `</div>`
      );
    },

    rail(m, t) {
      const git = m.branch
        ? `<span style="color:${a(t.comment, .6)}">·</span>` +
          `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green}">` +
          `${SVG.branch(t.green, 10)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};margin-left:2px">+${m.dirty}</span>` : '') +
          `</span>`
        : '';

      return (
        `<div style="display:flex;gap:12px;height:100%">` +
        `<div style="width:3px;align-self:stretch;flex-shrink:0;border-radius:2px;` +
        `background:linear-gradient(180deg,${t.accent} 0%,${a(t.accent, .4)} 100%)">` +
        `</div>` +
        `<div style="display:inline-flex;align-items:center;gap:8px;color:${t.fg}">` +
        `<span style="color:${t.accent};font-weight:600;display:inline-flex;align-items:center;gap:5px">` +
        `${SVG.folder(t.accent)}${m.cwd}</span>` +
        git +
        `<span style="color:${a(t.comment, .6)}">·</span>` +
        `<span style="color:${t.comment};font-size:.9em">${m.time}</span>` +
        `</div></div>`
      );
    },

    passthrough() { return null; },
  };

  // ── Terminal renders — overlay compacto, ajustado a la fila del terminal ──
  // xterm.js con fontSize:14, lineHeight:1.2 → rowHeight ≈ 17px.
  // Usamos font-size:13px con padding mínimo para que el contenido quepa.
  // El overlay container SIEMPRE tiene el tamaño exacto de una fila (set en showPromptOverlay).
  const _termRenders = {

    pill(m, t) {
      const path =
        `<span style="display:inline-flex;align-items:center;gap:5px;` +
        `background:${a(t.accent, .20)};color:${t.accent};` +
        `height:17px;padding:0 10px;border-radius:999px;border:1px solid ${a(t.accent, .40)};` +
        `font-size:13px;font-weight:600;box-sizing:border-box">` +
        `${SVG.folder(t.accent, 11)}${m.cwd}</span>`;

      const git = m.branch
        ? `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.green};` +
          `height:17px;padding:0 10px;border-radius:999px;border:1px solid ${a(t.green, .35)};` +
          `font-size:13px;box-sizing:border-box">` +
          `${SVG.branch(t.green, 11)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};font-weight:600;margin-left:2px">+${m.dirty}</span>` : '') +
          `</span>`
        : '';

      const time =
        `<span style="display:inline-flex;align-items:center;gap:4px;` +
        `color:${t.comment};font-size:12px">` +
        `${SVG.clock(t.comment, 11)}${m.time}</span>`;

      return `<div style="display:flex;align-items:center;gap:6px;padding:0 8px">${path}${git}${time}</div>`;
    },

    block(m, t) {
      const git = m.branch
        ? `<span style="color:${a(t.comment, .4)}">·</span>` +
          `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green};font-size:12px">` +
          `${SVG.branch(t.green, 11)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};font-weight:600;margin-left:1px">+${m.dirty}</span>` : '') +
          `</span>`
        : '';
      return (
        `<div style="display:flex;align-items:center;gap:8px;font-size:13px;` +
        `padding:0 10px;height:100%;width:100%;box-sizing:border-box;` +
        `border-left:2px solid ${t.accent};` +
        `border-bottom:1px solid ${a(t.accent, .20)};` +
        `background:${a(t.accent, .06)}">` +
        `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.accent};font-weight:600">` +
        `${SVG.folder(t.accent, 11)}${m.cwd}</span>` +
        git +
        `<span style="flex:1"></span>` +
        `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.comment};font-size:12px">` +
        `${SVG.clock(t.comment, 11)}${m.time}</span>` +
        `</div>`
      );
    },

    ribbon(m, t) {
      const git = m.branch
        ? `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green};font-size:13px">` +
          `${SVG.branch(t.green, 11)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};font-weight:600;margin-left:1px">+${m.dirty}</span>` : '') +
          `</span>`
        : '';
      return (
        `<div style="display:flex;align-items:flex-end;gap:10px;padding:0 8px;` +
        `width:fit-content;height:calc(100% - 1px);border-bottom:1.5px solid ${t.accent};` +
        `position:relative;box-sizing:border-box">` +
        `<span style="position:absolute;left:0;right:0;bottom:-1.5px;height:1.5px;` +
        `background:linear-gradient(90deg,${t.accent},transparent)"></span>` +
        `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.accent};font-weight:600;font-size:13px">` +
        `${SVG.folder(t.accent, 11)}${m.cwd}</span>` +
        git +
        `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.comment};font-size:12px">` +
        `${SVG.clock(t.comment, 11)}${m.time}</span>` +
        `</div>`
      );
    },

    rail(m, t) {
      const git = m.branch
        ? `<span style="color:${a(t.comment, .5)}">·</span>` +
          `<span style="display:inline-flex;align-items:center;gap:4px;color:${t.green};font-size:13px">` +
          `${SVG.branch(t.green, 11)}${m.branch}` +
          (m.dirty > 0 ? `<span style="color:${t.warning};margin-left:1px">+${m.dirty}</span>` : '') +
          `</span>`
        : '';
      return (
        `<div style="display:flex;align-items:center;height:100%;gap:0">` +
        `<div style="width:3px;align-self:stretch;flex-shrink:0;margin-right:10px;` +
        `background:linear-gradient(180deg,${t.accent} 0%,${a(t.accent, .30)} 100%)"></div>` +
        `<div style="display:inline-flex;align-items:center;gap:8px;font-size:13px">` +
        `<span style="color:${t.accent};font-weight:600;display:inline-flex;align-items:center;gap:5px">` +
        `${SVG.folder(t.accent, 11)}${m.cwd}</span>` +
        git +
        `<span style="color:${a(t.comment, .6)}">·</span>` +
        `<span style="color:${t.comment};font-size:12px;display:inline-flex;align-items:center;gap:3px">` +
        `${SVG.clock(t.comment, 11)}${m.time}</span>` +
        `</div></div>`
      );
    },
  };

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getPreset() {
    return localStorage.getItem('ocote_prompt') || 'pill';
  }

  // ── Overlay system — DOM propio, sin Decoration API ────────────────────────
  //
  // Estructura en el DOM de xterm.js:
  //   .xterm-screen (position:relative)
  //     canvas (position:absolute, z-index:auto)
  //     .ocote-overlay-container (position:absolute, inset:0, z-index:8, pointer-events:none)
  //       div.ocote-ol[data-row="N"] (position:absolute, top:Npx, height:rowHpx)
  //
  // Los divs se reposicionan en cada scroll/resize. El background cubre el
  // texto ANSI que sirve como fallback (si JS falla, el ANSI sigue visible).

  const _containers = new WeakMap();   // term → overlay container div
  const _overlayMaps = new WeakMap();  // term → Map<absRow, div>  (headers)
  const _bodyMaps   = new WeakMap();   // term → Map<infoAbsRow, {el, startAbsRow, endAbsRow}>
  const MAX_OVERLAYS = 60;

  function _ensureContainer(term) {
    if (_containers.has(term)) return _containers.get(term);
    const screen = term.element?.querySelector?.('.xterm-screen');
    if (!screen) return null;
    const c = document.createElement('div');
    c.className = 'ocote-overlay-container';
    c.style.cssText = 'position:absolute;inset:0;pointer-events:none;overflow:hidden;z-index:8;';
    screen.appendChild(c);
    _containers.set(term, c);
    return c;
  }

  function _rowPx(term) {
    // Estrategia 1 (más exacta): API privada de xterm.js — dimensión real medida
    // con el font actual. Envuelto en try/catch por si cambia entre versiones.
    try {
      const h = term._core?._renderService?.dimensions?.css?.cell?.height;
      if (h && h > 0) return h;
    } catch (_) {}

    // Estrategia 2: dividir altura real del .xterm-screen entre número de filas
    const screen = term.element?.querySelector?.('.xterm-screen');
    if (screen?.offsetHeight > 0 && term.rows > 0) {
      return screen.offsetHeight / term.rows;
    }

    // Estrategia 3: viewport (tiene el mismo alto que el screen)
    const viewport = term.element?.querySelector?.('.xterm-viewport');
    if (viewport?.clientHeight > 0 && term.rows > 0) {
      return viewport.clientHeight / term.rows;
    }

    // Estrategia 4: cualquier canvas dentro del elemento terminal
    const canvas = term.element?.querySelector?.('canvas');
    if (canvas?.offsetHeight > 0 && term.rows > 0) {
      return canvas.offsetHeight / term.rows;
    }

    // Estrategia 5 (fallback): calcular desde las opciones del terminal
    const fontSize = term.options?.fontSize || 14;
    const lineHeight = term.options?.lineHeight || 1.2;
    return Math.ceil(fontSize * lineHeight);
  }

  function _placeOverlay(term, el, absRow) {
    const h = _rowPx(term);
    const ydisp = term.buffer?.active?.baseY ?? 0;
    const vRow = absRow - ydisp;
    el.style.height = h + 'px';
    if (vRow >= 0 && vRow < term.rows) {
      el.style.top = (vRow * h) + 'px';
      el.style.display = 'flex';
    } else {
      el.style.display = 'none';
    }
  }

  // Posiciona el body overlay (multi-fila) para block/rail.
  // El body abarca desde startAbsRow (fila ❯) hasta endAbsRow (última línea del output).
  // Al hacer scroll se recorta al viewport visible con clamping.
  function _placeBody(term, entry) {
    const { el, startAbsRow, endAbsRow } = entry;
    const h = _rowPx(term);
    const ydisp = term.buffer?.active?.baseY ?? 0;
    const startVRow = startAbsRow - ydisp;
    const endVRow   = endAbsRow   - ydisp;

    if (endVRow < 0 || startVRow >= term.rows) {
      el.style.display = 'none';
      return;
    }

    const clampedStart = Math.max(0, startVRow);
    const clampedEnd   = Math.min(term.rows - 1, endVRow);
    el.style.top    = (clampedStart * h) + 'px';
    el.style.height = ((clampedEnd - clampedStart + 1) * h) + 'px';
    el.style.display = 'block';
  }

  // ── API pública ────────────────────────────────────────────────────────────
  return {

    /**
     * Muestra la overlay HTML en la fila info (la línea encima de ❯).
     * Llamado por terminal.js cuando el shell emite OSC 133 A (al final del PROMPT,
     * después de que ❯ ya está en pantalla). En ese momento cursor está en la fila
     * del ❯; la fila info = cursor - 1.
     *
     * @param {Terminal} term          — instancia xterm.js
     * @param {object|null} meta       — {cwd, branch, dirty, time, exit}
     * @param {number} infoAbsRow      — fila absoluta (buffer) donde va el overlay
     */
    showPromptOverlay(term, meta, infoAbsRow) {
      const p = getPreset();
      if (p === 'minimal' || p === 'passthrough') return; // ANSI puro, sin overlay
      if (!meta) return;

      const fn = _termRenders[p];
      if (!fn) return;

      const t = theme();
      const html = fn(meta, t);
      if (!html) return;

      const container = _ensureContainer(term);
      if (!container) return;

      let map = _overlayMaps.get(term);
      if (!map) { map = new Map(); _overlayMaps.set(term, map); }

      // Reusar o crear el elemento para esta fila
      const bg = termBg();
      let el = map.get(infoAbsRow);
      if (!el) {
        el = document.createElement('div');
        el.className = 'ocote-ol';
        el.dataset.row = infoAbsRow;
        el.style.cssText = [
          'position:absolute',
          'left:0',
          'width:100%',
          'pointer-events:none',
          'display:flex',
          'align-items:center',
          'overflow:hidden',
          `background:${bg}`,       // cubre completamente el ANSI fallback
          'font-family:var(--font-mono,monospace)',
          'z-index:8',
        ].join(';') + ';';
        container.appendChild(el);
        map.set(infoAbsRow, el);

        // Límite de overlays: eliminar el más antiguo si hay demasiados
        if (map.size > MAX_OVERLAYS) {
          const oldest = map.keys().next().value;
          map.get(oldest)?.remove();
          map.delete(oldest);
        }
      }

      // Guardar meta en dataset para poder re-renderizar al cambiar tema
      el.dataset.meta = JSON.stringify(meta);
      el.dataset.preset = p;
      el.innerHTML = html;
      _placeOverlay(term, el, infoAbsRow);
    },

    /**
     * Crea/actualiza el body overlay para block y rail.
     * Llamado desde terminal.js cuando OSC 133 D (fin de comando) llega.
     *
     * @param {Terminal} term
     * @param {number} infoAbsRow    — fila del header (key para el header map)
     * @param {number} chevronAbsRow — fila ❯ donde el usuario escribió el comando
     * @param {number} endAbsRow     — última fila del output (leída síncronamente en 133 D)
     * @param {number} exitCode      — código de salida del comando
     */
    extendCommandBlock(term, infoAbsRow, chevronAbsRow, endAbsRow, exitCode) {
      const p = getPreset();
      if (p !== 'block' && p !== 'rail') return;
      if (endAbsRow < chevronAbsRow) return; // no hay output

      const container = _ensureContainer(term);
      if (!container) return;

      let bodyMap = _bodyMaps.get(term);
      if (!bodyMap) { bodyMap = new Map(); _bodyMaps.set(term, bodyMap); }

      const t = theme();
      let entry = bodyMap.get(infoAbsRow);

      if (!entry) {
        const el = document.createElement('div');
        el.className = 'ocote-ol-body';
        el.style.cssText = 'position:absolute;left:0;width:100%;pointer-events:none;z-index:7;box-sizing:border-box;';
        container.appendChild(el);
        entry = { el, startAbsRow: chevronAbsRow, endAbsRow };
        bodyMap.set(infoAbsRow, entry);

        if (bodyMap.size > MAX_OVERLAYS) {
          const oldest = bodyMap.keys().next().value;
          bodyMap.get(oldest)?.el?.remove();
          bodyMap.delete(oldest);
        }
      } else {
        entry.startAbsRow = chevronAbsRow;
        entry.endAbsRow   = endAbsRow;
      }

      if (p === 'block') {
        // Continuación visual del header: borde izquierdo + fondo muy tenue
        const borderColor = exitCode === 0 ? a(t.accent, 0.30) : a('#E8635A', 0.40);
        entry.el.style.borderLeft  = `2px solid ${borderColor}`;
        entry.el.style.background  = exitCode === 0 ? a(t.accent, 0.04) : a('#E8635A', 0.03);
        entry.el.style.borderRight = '';
        entry.el.innerHTML = '';
      } else if (p === 'rail') {
        // Solo el stripe vertical — sin fondo, sin texto
        entry.el.style.borderLeft = '';
        entry.el.style.background = '';
        entry.el.innerHTML =
          `<div style="position:absolute;top:0;left:0;width:3px;height:100%;` +
          `background:linear-gradient(180deg,${a(t.accent, 0.40)} 0%,${a(t.accent, 0.12)} 100%)"></div>`;
      }

      _placeBody(term, entry);
    },

    /** Reposiciona todos los overlays al hacer scroll o resize */
    updateOverlayPositions(term) {
      const map = _overlayMaps.get(term);
      if (map) {
        for (const [absRow, el] of map) _placeOverlay(term, el, absRow);
      }
      const bodyMap = _bodyMaps.get(term);
      if (bodyMap) {
        for (const entry of bodyMap.values()) _placeBody(term, entry);
      }
    },

    /** Elimina todos los overlays de un terminal (para respawn / clear terminal) */
    clearOverlays(term) {
      const map = _overlayMaps.get(term);
      if (map) { map.forEach(el => el.remove()); map.clear(); }
      const bodyMap = _bodyMaps.get(term);
      if (bodyMap) { bodyMap.forEach(entry => entry.el?.remove()); bodyMap.clear(); }
    },

    /** Actualiza overlays al cambiar tema: re-renderiza HTML con nuevos colores */
    refresh() {
      const bg = termBg();
      const t = theme();
      const p = getPreset();
      const fn = _termRenders[p];

      document.querySelectorAll('.ocote-ol').forEach(el => {
        // Actualizar background para que cubra el ANSI con el color del nuevo tema
        el.style.background = bg;

        // Re-renderizar el HTML con los colores del nuevo tema.
        // Usar el preset guardado en el overlay (no el preset actual del localStorage).
        if (el.dataset.meta) {
          try {
            const meta = JSON.parse(el.dataset.meta);
            const presetId = el.dataset.preset || p;
            const renderer = _termRenders[presetId];
            if (renderer) {
              const html = renderer(meta, t);
              if (html) el.innerHTML = html;
            }
          } catch (_) {}
        }
      });

      // Limpiar texture atlas + reposicionar headers. Body overlays se descartan
      // porque su color/estilo depende del preset/tema anterior — se recrearán
      // en los siguientes comandos con los colores correctos.
      window.TAB_MANAGER?.getAllTabs?.().forEach(([, tab]) => {
        if (!tab?.term) return;
        tab.term.clearTextureAtlas?.();
        const bodyMap = _bodyMaps.get(tab.term);
        if (bodyMap) { bodyMap.forEach(entry => entry.el?.remove()); bodyMap.clear(); }
        this.updateOverlayPositions(tab.term);
      });
    },

    // ── API de preview para Settings picker ────────────────────────────────
    // Usa los renders de tamaño normal (no compactos) — para las cards del picker.
    previewHtml(presetId, meta, tokens) {
      if (!meta) meta = { cwd: '~/proyecto/src', branch: 'main', dirty: 2, time: '14:32', exit: 0 };
      if (!tokens) tokens = theme();
      if (presetId === 'passthrough') return null;

      // Minimal: aproximación HTML para el picker (el terminal usa ANSI puro)
      if (presetId === 'minimal') {
        const t = tokens;
        const git = meta.branch
          ? ` <span style="color:${t.green}"> ${meta.branch}` +
            (meta.dirty > 0 ? ` <span style="color:${t.warning}">+${meta.dirty}</span>` : '') +
            `</span>`
          : '';
        return (
          `<div style="line-height:1.75;font-size:inherit">` +
          `<div><span style="color:${t.comment}">${meta.cwd}</span>` +
          `${git} <span style="color:${t.comment}">· ${meta.time}</span></div>` +
          `<div><span style="color:${t.accent};font-weight:600">❯</span>` +
          ` <span style="opacity:0.3">_</span></div>` +
          `</div>`
        );
      }

      return renders[presetId]?.(meta, tokens) ?? null;
    },

    // Helpers expuestos para settings.js
    svg: SVG,
    alpha: a,
  };
})();
