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

  // ─── Render de presets (chrome geométrico) ──────────────────────────────
  // Cada función recibe (tokens, meta) y devuelve {height, css} o null.
  // meta = { cwd, branch, dirty, time, exit }
  //
  // MODELO ANSI-PS1-PRIMERO (ver "Ocote Fix Prompt No Renderiza.md"):
  //   El shell SIEMPRE pinta el texto del prompt con ANSI (path, git, hora, ❯).
  //   Estas decoraciones son una capa ADITIVA de SOLO chrome geométrico
  //   (stripe, subrayado, borde). NUNCA repintan el texto — eso lo hace el PS1,
  //   y duplicarlo causaría doble-dibujo y peleas con el cursor.
  //
  //   pill / minimal / passthrough → null (se dibujan 100% en ANSI)
  //   ribbon → subrayado con gradiente bajo la línea de info
  //   rail   → stripe vertical de 3px a la izquierda
  //   block  → borde de tarjeta alrededor del output (se maneja en onCommandEnd)
  const renders = {

    pill()        { return null; },  // cápsulas powerline 100% en ANSI
    minimal()     { return null; },  // ruta + chevron en ANSI
    passthrough() { return null; },  // prompt del usuario, no tocamos nada

    // RIBBON — subrayado con gradiente (alto 2px) que recorre la línea de info.
    // height:1 = solo la primera línea del prompt (la de info, no la del ❯).
    ribbon(t) {
      return {
        height: 1,
        css:
          `pointer-events:none;align-self:flex-end;` +
          `height:2px;width:100%;margin-top:auto;` +
          `background:linear-gradient(90deg,${t.accent} 0%,${a(t.accent, 0.15)} 60%,transparent 100%)`,
      };
    },

    // RAIL — stripe vertical de 3px a la izquierda, cubre las 2 líneas del prompt.
    rail(t) {
      return {
        height: 2,
        css:
          `pointer-events:none;width:3px;height:100%;border-radius:2px;` +
          `background:linear-gradient(180deg,${t.accent} 0%,${a(t.accent, 0.4)} 100%)`,
      };
    },

    // BLOCK — el header NO lleva chrome de prompt; el frame del output se pinta
    // en onCommandEnd(). Aquí no decoramos la línea del prompt.
    block() { return null; },
  };

  // ─── Estado interno ───────────────────────────────────────────────────────
  // Para el preset Block: seguimiento de inicio de cada comando
  const blockState = new WeakMap(); // term → { startAbsLine }

  // ─── API pública ──────────────────────────────────────────────────────────
  return {

    /**
     * Pinta el chrome geométrico del prompt (OSC 133 A = inicio de zona prompt).
     * Llamado desde terminal.js al recibir OSC 6731 + OSC 133 A.
     * El TEXTO del prompt ya lo pintó el shell con ANSI — aquí solo añadimos
     * stripe (rail) o subrayado (ribbon). Para pill/minimal/block no hacemos nada.
     *
     * @param {Terminal} term  — instancia xterm.js del tab
     * @param {object}   meta  — {cwd, branch, dirty, time, exit}  (no usado en chrome)
     */
    renderPrompt(term, meta) {
      const p = preset();
      const fn = renders[p];
      if (!fn) return;

      const spec = fn(theme(), meta);
      if (!spec) return; // pill/minimal/passthrough/block → sin chrome aquí

      // Marker en la línea actual del cursor: al emitirse OSC 133 A en precmd,
      // el cursor está justo donde el shell va a dibujar la 1ª línea del prompt.
      const marker = term.registerMarker(0);
      if (!marker) return;

      const dec = term.registerDecoration?.({
        marker,
        width: spec.height === 2 ? 1 : term.cols, // stripe: 1 celda de ancho
        height: spec.height,
        layer: 'top',
      });
      if (!dec) return; // xterm.js sin Decoration API — degradación silenciosa

      dec.onRender((el) => {
        // El contenedor de la decoración es flex para poder alinear el chrome.
        el.style.cssText = 'pointer-events:none;display:flex;align-items:stretch;height:100%';
        const bar = document.createElement('div');
        bar.style.cssText = spec.css;
        el.replaceChildren(bar);
      });
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
