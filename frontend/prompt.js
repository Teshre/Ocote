// prompt.js — Sistema de presets de prompt de Ocote
// ---------------------------------------------------------------------------
// Arquitectura (diseño aprobado en Claude Design):
//
//   1. Shell emite OSC 6731 con JSON {cwd, branch, dirty, time, exit}
//      + OSC 133 A (inicio de zona prompt)
//   2. terminal.js captura ambos y llama renderPrompt(term, meta)
//   3. prompt.js usa term.registerDecoration() para pintar HTML sobre
//      la línea vacía que precede al ❯ del PS1
//
// PS1 de zsh:
//   - minimal     → PS1 completo en ANSI (path + git + chevron). Sin decoration.
//   - pill/ribbon/rail/block → PS1 = "\n❯" solo. La decoration pinta la info.
//   - passthrough → sin hook de Ocote. Prompt nativo del usuario.
//
// Regla de color: NINGÚN valor hardcodeado. Todo via getCurrentTokens().
// La FORMA identifica a Ocote; el COLOR hereda del tema activo.

window.OCOTE_PROMPT = (() => {
  'use strict';

  // ── Acceso al tema activo ──────────────────────────────────────────────────
  function theme() {
    return window.OCOTE_THEMES?.getCurrentTokens?.() ?? {
      accent: '#E8843A', green: '#7DC97A', blue: '#82A6E0',
      comment: '#6F6552', warning: '#E8C03A', fg: '#E2D6BD', bg: '#14100C',
    };
  }

  // hex (#RRGGBB) + alpha → "rgba(r,g,b,a)"
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

  // ── Renderers de presets: devuelven HTML string ────────────────────────────
  // meta = { cwd, branch, dirty, time, exit }
  const renders = {

    // PILL — Cápsulas con glassmorphism. La firma de Ocote.
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

    // BLOCK — Header de contexto. El frame del output lo pinta onCommandEnd().
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

    // MINIMAL — Solo PS1 ANSI, sin decoration.
    minimal() { return null; },

    // RIBBON — Subrayado con gradiente tipo tab-indicator.
    ribbon(m, t) {
      const info = [m.cwd, m.branch, m.time]
        .filter(Boolean)
        .join(` <span style="color:${a(t.comment, .5)}">·</span> `);

      return (
        `<div style="display:inline-flex;align-items:flex-end;height:100%">` +
        `<span style="padding-bottom:4px;border-bottom:1.5px solid ${t.accent};` +
        `color:${t.fg};font-weight:500;position:relative">` +
        info +
        `<span style="position:absolute;left:0;right:0;bottom:-1.5px;height:1.5px;` +
        `background:linear-gradient(90deg,${t.accent} 0%,transparent 100%)">` +
        `</span></span></div>`
      );
    },

    // RAIL — Riel vertical de 3px + info en línea.
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

    // PASSTHROUGH — Prompt nativo del usuario, no tocamos nada.
    passthrough() { return null; },
  };

  // ── Estado interno ─────────────────────────────────────────────────────────
  // Para Block: seguimiento del inicio de output de cada comando
  const blockState = new WeakMap(); // term → { startAbsLine, meta }

  // ── Helpers ────────────────────────────────────────────────────────────────
  function getPreset() {
    return localStorage.getItem('ocote_prompt') || 'pill';
  }

  function makeDecoration(term, marker, height, layer, onRenderFn) {
    const dec = term.registerDecoration?.({ marker, width: term.cols, height, layer });
    if (!dec) return null; // degradación silenciosa si Decoration API no disponible
    dec.onRender(onRenderFn);
    return dec;
  }

  // ── API pública ────────────────────────────────────────────────────────────
  return {

    /**
     * Pinta la decoración del prompt (info: path, git, hora).
     * Llamado por terminal.js cuando el shell emite OSC 133 A (inicio de prompt).
     *
     * El cursor en ese momento está en la línea info (la que precede al ❯).
     * El PS1 es "\n❯ " — la `\n` crea la línea del ❯ DEBAJO de la info.
     * La decoration se pinta EN la línea info, que queda visualmente vacía.
     *
     * @param {Terminal} term — instancia xterm.js del tab
     * @param {object}   meta — { cwd, branch, dirty, time, exit }
     */
    renderPrompt(term, meta) {
      const p = getPreset();
      const fn = renders[p];
      if (!fn) return;

      const html = fn(meta, theme());
      if (!html) return; // minimal / passthrough — no hay decoration

      const marker = term.registerMarker(0);
      if (!marker) return;

      makeDecoration(term, marker, 1, 'top', (el) => {
        el.style.cssText =
          'pointer-events:none;font-family:inherit;font-size:inherit;' +
          'display:flex;align-items:center;height:100%;overflow:hidden';
        el.innerHTML = html;
      });
    },

    /**
     * El usuario presionó Enter — el comando va a correr.
     * Para Block: guardamos la posición inicial del output.
     */
    onCommandStart(term) {
      if (getPreset() !== 'block') return;
      const abs = term.buffer.active.baseY + term.buffer.active.cursorY;
      blockState.set(term, { startAbsLine: abs });
    },

    /**
     * El comando terminó (OSC 133 D;exitcode).
     * Para Block: envuelve el output en una tarjeta con borde accent/rojo.
     */
    onCommandEnd(term, exitCode) {
      if (getPreset() !== 'block') return;
      const bs = blockState.get(term);
      if (!bs) return;
      blockState.delete(term);

      const t = theme();
      const endAbs = term.buffer.active.baseY + term.buffer.active.cursorY;
      const height = Math.max(1, endAbs - bs.startAbsLine);
      const edge = exitCode === 0 ? t.accent : '#E8635A';
      const offset = bs.startAbsLine - endAbs; // negativo = líneas hacia atrás

      const marker = term.registerMarker(offset);
      if (!marker) return;

      makeDecoration(term, marker, height, 'bottom', (el) => {
        el.style.cssText =
          `pointer-events:none;box-sizing:border-box;` +
          `border:1px solid ${a(t.accent, .22)};` +
          `border-left:2px solid ${edge};` +
          `border-radius:6px;` +
          `background:${a(t.accent, .03)}`;
      });
    },

    /**
     * Al cambiar tema o preset: limpiar el texture atlas de xterm.js para
     * que las decoraciones existentes se re-rendericen con los nuevos colores.
     */
    refresh() {
      window.TAB_MANAGER?.getAllTabs?.().forEach(([, tab]) => {
        tab?.term?.clearTextureAtlas?.();
      });
    },

    // ── API de preview (para el picker en Settings) ────────────────────────
    // Devuelve HTML que representa visualmente el preset.
    // Para minimal (ANSI puro) generamos una aproximación en HTML.
    // Para passthrough devolvemos null; settings.js lo maneja con su propio HTML.
    previewHtml(presetId, meta, tokens) {
      if (!meta) meta = { cwd: '~/proyecto/src', branch: 'main', dirty: 2, time: '14:32', exit: 0 };
      if (!tokens) tokens = theme();
      if (presetId === 'passthrough') return null;

      // Minimal usa ANSI en el terminal; en settings mostramos una aproximación HTML
      // de cómo se verá: ruta + rama + hora en línea 1, ❯ en línea 2.
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

    // Exponer helpers para que settings.js pueda reusar estilos
    svg: SVG,
    alpha: a,
  };
})();
