// autocomplete.js — Autocompletado visual con CKB + contexto (Fase 3)
//
// Cuando el usuario escribe en la terminal (sin espacios), este módulo
// consulta DOS fuentes en paralelo y muestra un popup unificado:
//
//   1. CKB (SQLite) → comandos que coinciden con el prefijo tipado
//      Ej: "ca" → { name: "cat", description_es: "..." }
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
// Devuelve objetos compatibles con el formato de la CKB { name, description_es }.
// El campo `isContext: true` le dice a renderPopup que use el badge de contexto.
function filterContextSuggestions(contextInfo, prefix) {
  if (!contextInfo || !prefix) return [];

  const lowerPrefix = prefix.toLowerCase();

  return contextInfo.suggestions
    // Solo las que empiezan con el prefijo (igual que la CKB)
    .filter(s => s.toLowerCase().startsWith(lowerPrefix))
    // Convertir al formato de renderPopup
    .map(s => ({
      name: s,
      description_es: contextInfo.label,   // "Git · Rust", "Node.js", etc.
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
        window.__TAURI__.invoke('get_suggestions', { prefix: input }),
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
    const badge = cmd.isContext
      ? `<span class="autocomplete-context-badge">${escapeHtml(cmd.description_es)}</span>`
      : `<span class="autocomplete-desc">${escapeHtml(cmd.description_es)}</span>`;

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
  const term = window.ocoteTerminal;
  if (!term) return;

  const cursorY = term.buffer.active.cursorY;
  const viewportY = term.buffer.active.viewportY;
  const cursorRow = cursorY - viewportY;

  if (cursorRow < 0 || cursorRow >= term.rows) return;

  const fontSize = term.options.fontSize || 14;
  const lineHeightMult = term.options.lineHeight || 1.5;
  const lineHeightPx = fontSize * lineHeightMult;

  // Debajo del cursor con margen para no tapar la línea de input
  const top = (cursorRow * lineHeightPx) + (lineHeightPx * 2) + 20;
  popup.style.top = `${top}px`;
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
