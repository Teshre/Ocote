// prompt.js — Sistema de presets de prompt de Ocote
// ---------------------------------------------------------------------------
// Captura datos estructurados emitidos por el shell (OSC 6731) y pinta
// decoraciones HTML sobre xterm.js usando la Decoration API.
//
// Arquitectura:
//   zsh precmd → OSC 6731 {"cwd","branch","dirty","time","exit"}
//              → terminal.js lo captura y llama renderPrompt()
//              → registerDecoration() inyecta un <div> sobre la línea vacía
//              → el div tiene el HTML del preset (Pill, Block, Ribbon, Rail)
//
// Regla de oro: NINGÚN color hardcodeado fuera de TOKENS en themes.js.
// La FORMA identifica a Ocote; el COLOR hereda del tema activo.
//
// Presets:
//   pill       — cápsulas redondeadas, firma de Ocote (default)
//   block      — modo Pro: contexto envolvente del output del comando
//   minimal    — solo PS1 con ANSI (sin decoration del renderer)
//   ribbon     — subrayado tipo tab-indicator con gradiente
//   rail       — riel vertical de 3px en el margen izquierdo
//   passthrough — respeta el PS1 del usuario (sin nada de Ocote)

window.OCOTE_PROMPT = (() => {
  'use strict';

  // ─── Acceso al tema activo ───────────────────────────────────────────────
  // Devuelve {accent, green, blue, comment, warning, fg} del tema guardado.
  function theme() {
    return window.OCOTE_THEMES?.getCurrentTokens?.() ?? {
      accent: '#E8843A', green: '#7DC97A', blue: '#82A6E0',
      comment: '#6F6552', warning: '#E8C03A', fg: '#E2D6BD',
    };
  }

  // Preset activo (pill por defecto, la firma de Ocote).
  function preset() {
    return localStorage.getItem('ocote_prompt') || 'pill';
  }

  // hex (#RRGGBB) + alpha → "rgba(r,g,b,a)"
  function a(hex, alpha) {
    const n = parseInt(hex.replace('#', ''), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${alpha})`;
  }

  // ─── SVGs inline (Tabler Icons MIT) ─────────────────────────────────────
  // Se renderizan a 11px, stroke = color que se pasa. Sin fonts externos.
  const svg = {
    folder: (c) =>
      `<svg viewBox="0 0 16 16" width="11" height="11" style="flex-shrink:0;vertical-align:middle">` +
      `<path d="M1.5 4.2C1.5 3.5 2 3 2.7 3H6L7.2 4.2H13.3C14 4.2 14.5 4.7 14.5 5.4V11.6` +
      `C14.5 12.3 14 12.8 13.3 12.8H2.7C2 12.8 1.5 12.3 1.5 11.6Z" ` +
      `fill="none" stroke="${c}" stroke-width="1.3" stroke-linejoin="round"/></svg>`,

    branch: (c) =>
      `<svg viewBox="0 0 16 16" width="11" height="11" style="flex-shrink:0;vertical-align:middle">` +
      `<circle cx="4" cy="3.5" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<circle cx="4" cy="12.5" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<circle cx="12" cy="8" r="1.6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<path d="M4 5.1V10.9M5.6 3.5H10C11.1 3.5 12 4.4 12 5.5V6.4" ` +
      `fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`,

    clock: (c) =>
      `<svg viewBox="0 0 16 16" width="11" height="11" style="flex-shrink:0;vertical-align:middle">` +
      `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<path d="M8 4.6V8L10.4 9.4" fill="none" stroke="${c}" stroke-width="1.3" stroke-linecap="round"/></svg>`,

    check: (c) =>
      `<svg viewBox="0 0 16 16" width="11" height="11" style="flex-shrink:0;vertical-align:middle">` +
      `<path d="M3 8.5L6.5 12L13 4.5" fill="none" stroke="${c}" ` +
      `stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`,

    error: (c) =>
      `<svg viewBox="0 0 16 16" width="11" height="11" style="flex-shrink:0;vertical-align:middle">` +
      `<circle cx="8" cy="8" r="6" fill="none" stroke="${c}" stroke-width="1.3"/>` +
      `<path d="M8 5.2V8.8M8 10.2V10.8" stroke="${c}" stroke-width="1.4" stroke-linecap="round"/></svg>`,
  };

  // ─── Render de presets ───────────────────────────────────────────────────
  // Cada función recibe (meta, tokens) y devuelve HTML string.
  // meta = { cwd, branch, dirty, time, exit }
  // null = no pintar nada (minimal/passthrough)
  const renders = {

    // ── 01 · PILL — Firma de Ocote. Cápsulas redondeadas con glassmorphism sutil.
    pill(m, t) {
      const path =
        `<span style="display:inline-flex;align-items:center;gap:6px;` +
        `background:${a(t.accent, 0.18)};color:${t.accent};` +
        `padding:2px 11px;border-radius:999px;border:1px solid ${a(t.accent, 0.32)};` +
        `font-weight:600">` +
        `${svg.folder(t.accent)}&nbsp;${escHtml(m.cwd)}</span>`;

      const git = m.branch
        ? `<span style="display:inline-flex;align-items:center;gap:5px;` +
          `color:${t.green};padding:2px 11px;border-radius:999px;` +
          `border:1px solid ${a(t.green, 0.32)}">` +
          `${svg.branch(t.green)}&nbsp;${escHtml(m.branch)}` +
          (m.dirty > 0
            ? `<span style="color:${t.warning};font-weight:600;margin-left:1px">+${m.dirty}</span>`
            : '') +
          `</span>`
        : '';

      const time =
        `<span style="display:inline-flex;align-items:center;gap:5px;` +
        `color:${t.comment};font-size:.92em;margin-left:2px">` +
        `${svg.clock(t.comment)}&nbsp;${escHtml(m.time)}</span>`;

      return `<div style="display:flex;align-items:center;gap:7px">${path}${git}${time}</div>`;
    },

    // ── 02 · BLOCK — Modo Pro. La decoración se aplica al output completo del comando.
    //    El header se pinta antes del comando; el frame después (onCommandEnd).
    //    Aquí renderizamos el header de contexto.
    block(m, t) {
      const gitChip = m.branch
        ? `<span style="color:${a(t.comment, 0.6)}">·</span>` +
          `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.green}">` +
          `${svg.branch(t.green)}&nbsp;${escHtml(m.branch)}` +
          (m.dirty > 0
            ? `<span style="color:${t.warning};font-weight:600;margin-left:2px">+${m.dirty}</span>`
            : '') +
          `</span>`
        : '';

      return (
        `<div style="display:flex;align-items:center;gap:10px;` +
        `color:${t.comment};font-size:.92em">` +
        `<span style="display:inline-flex;align-items:center;gap:6px;color:${t.accent};font-weight:600">` +
        `${svg.folder(t.accent)}&nbsp;${escHtml(m.cwd)}</span>` +
        gitChip +
        `<span style="flex:1"></span>` +
        `<span style="display:inline-flex;align-items:center;gap:5px">` +
        `${svg.clock(t.comment)}&nbsp;${escHtml(m.time)}</span>` +
        `</div>`
      );
    },

    // ── 03 · MINIMAL — Solo PS1 con ANSI. El renderer no pinta nada.
    minimal() { return null; },

    // ── 04 · RIBBON — Subrayado tipo tab-indicator con gradiente de color.
    ribbon(m, t) {
      const parts = [escHtml(m.cwd)];
      if (m.branch) {
        parts.push(m.dirty > 0
          ? `${escHtml(m.branch)} <span style="color:${t.warning}">+${m.dirty}</span>`
          : escHtml(m.branch));
      }
      parts.push(escHtml(m.time));
      const info = parts.join(` <span style="color:${a(t.comment, 0.5)}">·</span> `);

      return (
        `<div style="display:inline-flex;align-items:flex-end;height:100%">` +
        `<span style="padding-bottom:4px;border-bottom:1.5px solid ${t.accent};` +
        `color:${t.fg};font-weight:500;position:relative">` +
        info +
        `<span style="position:absolute;left:0;right:0;bottom:-1.5px;height:1.5px;` +
        `background:linear-gradient(90deg,${t.accent} 0%,transparent 100%)"></span>` +
        `</span></div>`
      );
    },

    // ── 05 · RAIL — Riel vertical de 3px en el margen izquierdo.
    rail(m, t) {
      const gitPart = m.branch
        ? `<span style="color:${a(t.comment, 0.6)}">·</span>` +
          `<span style="display:inline-flex;align-items:center;gap:5px;color:${t.green}">` +
          `${svg.branch(t.green)}&nbsp;${escHtml(m.branch)}` +
          (m.dirty > 0
            ? `<span style="color:${t.warning};margin-left:2px">+${m.dirty}</span>`
            : '') +
          `</span>`
        : '';

      return (
        `<div style="display:flex;gap:14px;height:100%">` +
        `<div style="width:3px;align-self:stretch;` +
        `background:linear-gradient(180deg,${t.accent} 0%,${a(t.accent, 0.4)} 100%);` +
        `border-radius:2px"></div>` +
        `<div style="display:inline-flex;align-items:center;gap:10px;color:${t.fg}">` +
        `<span style="color:${t.accent};font-weight:600;display:inline-flex;align-items:center;gap:6px">` +
        `${svg.folder(t.accent)}&nbsp;${escHtml(m.cwd)}</span>` +
        gitPart +
        `<span style="color:${a(t.comment, 0.6)}">·</span>` +
        `<span style="color:${t.comment};font-size:.9em">${escHtml(m.time)}</span>` +
        `</div></div>`
      );
    },

    // Passthrough — el usuario usa su propio prompt; no pintamos nada.
    passthrough() { return null; },
  };

  // ─── Helpers ─────────────────────────────────────────────────────────────
  function escHtml(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  // ─── Estado interno ───────────────────────────────────────────────────────
  // Para el preset Block: seguimiento de inicio de cada comando
  const blockState = new WeakMap(); // term → { startAbsLine }

  // Lista de decoraciones activas (para refresh al cambiar tema)
  const activeDecorations = [];
  const MAX_DECORATIONS = 200; // límite para no acumular indefinidamente

  // ─── API pública ──────────────────────────────────────────────────────────
  return {

    /**
     * Pinta el header de prompt (OSC 133 A = inicio de zona prompt).
     * Llamado desde terminal.js al recibir OSC 6731 + OSC 133 A.
     *
     * @param {Terminal} term    — instancia xterm.js del tab
     * @param {object}   meta    — {cwd, branch, dirty, time, exit}
     */
    renderPrompt(term, meta) {
      const p = preset();
      if (p === 'minimal' || p === 'passthrough') return;

      const t = theme();
      const html = (renders[p] ?? renders.pill)(meta, t);
      if (!html) return;

      // Marcador en la línea ACTUAL del cursor (offset 0 = línea del prompt).
      // Para presets de 2 líneas (nuestro PS1 emite \n antes de ❯), el cursor
      // está en la línea del ❯; el marcador +offset=-1 apunta a la línea vacía.
      // Con offset=0, la decoration se pinta sobre la misma línea del cursor
      // (que en nuestro PS1 = la línea vacía antes del ❯).
      const marker = term.registerMarker(0);
      if (!marker) return;

      const dec = term.registerDecoration?.({
        marker,
        width: term.cols,
        height: 1,
        layer: 'top',
      });

      if (!dec) return; // xterm.js demasiado viejo — degradación silenciosa

      dec.onRender((el) => {
        el.style.cssText =
          'pointer-events:none;font-family:inherit;font-size:inherit;' +
          'display:flex;align-items:center;height:100%';
        el.innerHTML = html;
      });

      // Guardar para refresh
      activeDecorations.push({ dec, meta, preset: p });
      if (activeDecorations.length > MAX_DECORATIONS) {
        activeDecorations.shift();
      }
    },

    /**
     * Marca el inicio de un comando (OSC 133 B — usuario presionó Enter).
     * Necesario para calcular el rango de output del preset Block.
     */
    onCommandStart(term) {
      if (preset() !== 'block') return;
      const abs = term.buffer.active.baseY + term.buffer.active.cursorY;
      blockState.set(term, { startAbsLine: abs });
    },

    /**
     * Fin de un comando (OSC 133 D;exitcode).
     * Para Block: envuelve el output entre inicio y fin en una tarjeta con borde.
     */
    onCommandEnd(term, exitCode) {
      if (preset() !== 'block') return;
      const bs = blockState.get(term);
      if (!bs) return;
      blockState.delete(term);

      const t = theme();
      const endAbs = term.buffer.active.baseY + term.buffer.active.cursorY;
      const height = Math.max(1, endAbs - bs.startAbsLine);

      // El marcador se crea con offset negativo: endAbs - startAbsLine líneas antes
      const marker = term.registerMarker(bs.startAbsLine - endAbs);
      if (!marker) return;

      const dec = term.registerDecoration?.({
        marker,
        width: term.cols,
        height,
        layer: 'bottom',
      });

      if (!dec) return;

      const edge = exitCode === 0 ? t.accent : '#E8635A';
      dec.onRender((el) => {
        el.style.cssText =
          `pointer-events:none;box-sizing:border-box;` +
          `border:1px solid ${a(t.accent, 0.22)};` +
          `border-left:2px solid ${edge};` +
          `border-radius:6px;` +
          `background:${a(t.accent, 0.03)}`;
      });
    },

    /**
     * Repintar todos los prompts visibles (llamado al cambiar tema).
     * La forma más simple: limpiar el texture atlas de xterm.js para forzar
     * el re-render de las decoraciones existentes con los nuevos colores.
     */
    refresh() {
      window.TAB_MANAGER?.getAllTabs?.().forEach(([, tab]) => {
        tab?.term?.clearTextureAtlas?.();
      });
    },
  };
})();
