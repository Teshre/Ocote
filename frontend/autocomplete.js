// autocomplete.js — Autocompletado visual con CKB + contexto (Fase 4: multilenguaje)
//
// Cuando el usuario escribe en la terminal (sin espacios), este módulo
// consulta DOS fuentes en paralelo y muestra un popup unificado:
//
//   1. CKB (SQLite) → comandos que coinciden con el prefijo tipado
//      El backend devuelve `description` ya resuelta en el idioma activo.
//
//   2. Contexto del directorio → sugerencias relevantes al proyecto actual
//      Ej: en un repo Rust, "ca" → "cargo build", "cargo run", "cargo test"
//      El contexto se cachea por directorio: no se llama en cada tecla.
//
// Mezcla de resultados:
//   - Las sugerencias de contexto van primero (son más relevantes para lo que
//     el usuario está haciendo ahora mismo)
//   - Luego las de CKB que no repitan lo que ya está arriba
//   - Máximo 8 ítems en total para no saturar visualmente

const popup = document.getElementById('autocomplete-popup');

// ── Idioma activo ────────────────────────────────────────────────────────
// Lee el idioma guardado en localStorage. El selector de idioma (index.html)
// escribe en 'ocote_lang'. Fallback: 'es'.
function getLang() {
  return localStorage.getItem('ocote_lang') || 'es';
}

let debounceTimer = null;
let currentSuggestions = [];
let selectedIndex = -1;

// ── Cache de contexto ────────────────────────────────────────────────────
// No llamamos detect_context en cada tecla — solo cuando cambia el CWD.
// Estructura: { path: string, info: ContextInfo }
let contextCache = null;

// Obtiene el contexto del CWD actual.
// Si el CWD no cambió desde la última vez, devuelve el resultado cacheado.
async function getContext() {
  const cwd = window.ocoteCwd;
  if (!cwd) return null;

  // ¿Tenemos el contexto de este directorio en cache?
  if (contextCache && contextCache.path === cwd) {
    return contextCache.info;
  }

  try {
    const info = await window.__TAURI__.invoke('detect_context', { path: cwd });
    contextCache = { path: cwd, info };
    return info;
  } catch (err) {
    console.warn('[Autocomplete] No se pudo obtener contexto:', err);
    return null;
  }
}

// Filtra las sugerencias de contexto por el prefijo que escribió el usuario.
// Devuelve objetos compatibles con el formato de la CKB { name, description }.
// El campo `isContext: true` le dice a renderPopup que use el badge de contexto.
function filterContextSuggestions(contextInfo, prefix) {
  if (!contextInfo || !prefix) return [];

  const lowerPrefix = prefix.toLowerCase();

  return contextInfo.suggestions
    // Solo las que empiezan con el prefijo (igual que la CKB)
    .filter(s => s.toLowerCase().startsWith(lowerPrefix))
    // Convertir al formato de renderPopup — usamos `description` (no `description_es`)
    // para ser consistentes con los objetos que devuelve la CKB
    .map(s => ({
      name: s,
      description: contextInfo.label,   // "Git · Rust", "Node.js", etc.
      isContext: true,
    }))
    // Máximo 4 sugerencias de contexto para no ahogar las de la CKB
    .slice(0, 4);
}

// ── Callback principal ───────────────────────────────────────────────────

/**
 * Llamado desde terminal.js cada vez que cambia el input del usuario.
 * Si el input está vacío o tiene espacio, oculta el popup.
 * Si no, consulta CKB y contexto en paralelo con debounce.
 */
window.onTerminalInputChanged = function (input) {
  clearTimeout(debounceTimer);

  // Sin input o con espacio → el usuario ya escribió el comando completo
  if (!input || input.length === 0 || input.includes(' ')) {
    hidePopup();
    return;
  }

  // Debounce 150ms para no saturar con cada tecla
  debounceTimer = setTimeout(async () => {
    try {
      // Consultar CKB y contexto en paralelo — ambas son rápidas pero
      // no queremos que una bloquee a la otra
      const [ckbResults, contextInfo] = await Promise.all([
        window.__TAURI__.invoke('get_suggestions', { prefix: input, lang: getLang() }),
        getContext(),
      ]);

      // Sugerencias de contexto que coinciden con el prefijo
      const contextMatches = filterContextSuggestions(contextInfo, input);

      // Nombres de los ítems de contexto (para no duplicar en CKB)
      const contextNames = new Set(contextMatches.map(c => c.name));

      // Sugerencias de CKB que no repiten lo que ya tiene el contexto.
      // Comparamos contra el nombre del comando base:
      // "cargo build" (contexto) vs "cargo" (CKB) → son distintos, ambos aparecen
      const ckbFiltered = ckbResults.filter(cmd => !contextNames.has(cmd.name));

      // Mezcla final: contexto primero, luego CKB, máximo 8
      const merged = [...contextMatches, ...ckbFiltered].slice(0, 8);

      if (merged.length > 0) {
        renderPopup(merged, input);
      } else {
        hidePopup();
      }
    } catch (err) {
      console.error('[Autocomplete] Error:', err);
      hidePopup();
    }
  }, 150);
};

// ── Renderizado ──────────────────────────────────────────────────────────

/**
 * Renderiza el popup con la lista mezclada de sugerencias.
 * Los ítems de contexto llevan un badge con el label del proyecto.
 */
function renderPopup(suggestions, prefix) {
  currentSuggestions = suggestions;
  selectedIndex = 0;

  let html = '';
  for (let i = 0; i < suggestions.length; i++) {
    const cmd = suggestions[i];
    const selectedClass = i === 0 ? 'selected' : '';

    // Badge de contexto: muestra el tipo de proyecto en pequeño a la derecha
    // Solo aparece en ítems que vienen del contexto (isContext: true)
    // cmd.description viene resuelto en el idioma activo (via getLang())
    const badge = cmd.isContext
      ? `<span class="autocomplete-context-badge">${escapeHtml(cmd.description)}</span>`
      : `<span class="autocomplete-desc">${escapeHtml(cmd.description)}</span>`;

    html += `
      <div
        class="autocomplete-item ${selectedClass}"
        data-index="${i}"
        data-cmd="${escapeHtml(cmd.name)}"
      >
        <span class="autocomplete-name">${escapeHtml(cmd.name)}</span>
        ${badge}
      </div>
    `;
  }

  popup.innerHTML = html;
  popup.classList.remove('hidden');

  // Posicionar debajo del cursor del terminal
  positionPopupAboveCursor();

  // Click en ítem → inyectar en el PTY
  popup.querySelectorAll('.autocomplete-item').forEach((item) => {
    item.addEventListener('click', () => {
      const cmdName = item.getAttribute('data-cmd');
      // Borrar lo que el usuario escribió y enviar el comando completo
      const backspaces = prefix.length;
      const input = '\x08'.repeat(backspaces) + cmdName;
      window.__TAURI__.invoke('write_to_shell', { input });
      hidePopup();
    });
  });
}

/**
 * Posiciona el popup justo debajo de la línea del cursor en xterm.js.
 */
function positionPopupAboveCursor() {
  // Con el sistema de tabs, window.ocoteTerminal quedó obsoleto.
  // El terminal activo vive en TAB_MANAGER.getTab(ocoteActiveShellId).
  let term = null;
  if (window.TAB_MANAGER && window.ocoteActiveShellId != null) {
    const tab = window.TAB_MANAGER.getTab(window.ocoteActiveShellId);
    if (tab) term = tab.term;
  }
  if (!term) term = window.ocoteTerminal;  // fallback legacy
  if (!term) return;

  // cursorY en xterm.js (= this._buffer.y) YA es relativo al viewport (0..rows-1).
  // El bug anterior restaba viewportY (offset de scroll absoluto), volviéndolo
  // negativo con scrollback → la función salía temprano y el popup se quedaba
  // arriba. Usamos cursorY directo y lo acotamos.
  let cursorRow = term.buffer.active.cursorY;
  if (cursorRow < 0) cursorRow = 0;
  if (cursorRow >= term.rows) cursorRow = term.rows - 1;

  const fontSize = term.options.fontSize || 14;
  const lineHeightMult = term.options.lineHeight || 1.5;
  const lineHeightPx = fontSize * lineHeightMult;

  // Posición real: usamos el rect de la pantalla del terminal para calcular
  // dónde está la línea del cursor en píxeles, relativo al offsetParent del
  // popup. Así se considera automáticamente la altura de la barra de tabs y
  // cualquier padding — antes se asumía que el terminal empezaba en y=0.
  const screenEl = term.element
    ? (term.element.querySelector('.xterm-screen') || term.element)
    : null;
  const parent = popup.offsetParent || document.getElementById('terminal-panel');

  if (screenEl && parent) {
    const screenRect = screenEl.getBoundingClientRect();
    const parentRect = parent.getBoundingClientRect();
    // Y del fondo de la línea del cursor (una línea por debajo del cursor):
    const lineBottomY = screenRect.top + (cursorRow + 1) * lineHeightPx;
    const top = (lineBottomY - parentRect.top) + 8; // 8px de separación
    popup.style.top = `${top}px`;
  } else {
    // Fallback al cálculo anterior si no hay elemento de pantalla
    popup.style.top = `${(cursorRow * lineHeightPx) + (lineHeightPx * 2) + 20}px`;
  }
}

/**
 * Oculta el popup y limpia el estado.
 */
function hidePopup() {
  popup.classList.add('hidden');
  popup.innerHTML = '';
  currentSuggestions = [];
  selectedIndex = -1;
}

/**
 * Escapa HTML para evitar inyección desde la CKB o el contexto.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
