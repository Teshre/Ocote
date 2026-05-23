// autocomplete.js — Autocompletado visual con CKB
//
// Cuando el usuario escribe en la terminal (sin espacios), este módulo
// consulta la CKB y muestra un popup con sugerencias de comandos,
// incluyendo su descripción en español.
//
// CAVEAT: El usuario sigue escribiendo normalmente; el popup es informativo.
// Click en una sugerencia inyecta el comando completo en el PTY.

const popup = document.getElementById('autocomplete-popup');

let debounceTimer = null;
let currentSuggestions = [];
let selectedIndex = -1;

/**
 * Callback invocado desde terminal.js cada vez que cambia el input del usuario.
 * Si el input está vacío o contiene espacio, ocultamos el popup.
 * Si no, hacemos debounce y consultamos la CKB.
 */
window.onTerminalInputChanged = function (input) {
  clearTimeout(debounceTimer);

  // Ocultar si no hay input o si ya escribió un espacio (ya no es prefijo de comando)
  if (!input || input.length === 0 || input.includes(' ')) {
    hidePopup();
    return;
  }

  // Debounce: esperar 150 ms para no saturar la CKB con cada tecla
  debounceTimer = setTimeout(async () => {
    try {
      const suggestions = await window.__TAURI__.invoke('get_suggestions', { prefix: input });
      if (suggestions.length > 0) {
        renderPopup(suggestions, input);
      } else {
        hidePopup();
      }
    } catch (err) {
      console.error('[Autocomplete] Error consultando CKB:', err);
      hidePopup();
    }
  }, 150);
};

/**
 * Renderiza el popup con la lista de sugerencias.
 * @param {Array} suggestions — objetos { name, description_es }
 * @param {string} prefix — lo que el usuario ha escrito hasta ahora
 */
function renderPopup(suggestions, prefix) {
  currentSuggestions = suggestions;
  selectedIndex = 0;

  let html = '';
  for (let i = 0; i < suggestions.length; i++) {
    const cmd = suggestions[i];
    const selectedClass = i === 0 ? 'selected' : '';
    html += `
      <div
        class="autocomplete-item ${selectedClass}"
        data-index="${i}"
        data-cmd="${escapeHtml(cmd.name)}"
      >
        <span class="autocomplete-name">${escapeHtml(cmd.name)}</span>
        <span class="autocomplete-desc">${escapeHtml(cmd.description_es)}</span>
      </div>
    `;
  }

  popup.innerHTML = html;
  popup.classList.remove('hidden');
  
  // Posicionar popup arriba del cursor del terminal
  positionPopupAboveCursor();

  // Evento click: inyectar comando completo en el PTY
  popup.querySelectorAll('.autocomplete-item').forEach((item) => {
    item.addEventListener('click', () => {
      const cmdName = item.getAttribute('data-cmd');
      // Inyectar el comando completo
      // Borramos lo que el usuario escribió con backspaces y enviamos el comando
      const backspaces = prefix.length;
      const input = '\x08'.repeat(backspaces) + cmdName;
      window.__TAURI__.invoke('write_to_shell', { input });
      hidePopup();
    });
  });
}

/**
 * Posiciona el popup justo debajo de la línea actual del cursor en xterm.js.
 * El popup aparece abajo del cursor para no tapar lo que el usuario ya escribió.
 */
function positionPopupAboveCursor() {
  const term = window.ocoteTerminal;
  if (!term) return;

  const cursorY = term.buffer.active.cursorY;
  const viewportY = term.buffer.active.viewportY;
  const cursorRow = cursorY - viewportY;

  // Si el cursor no está en el viewport visible, no reposicionar
  if (cursorRow < 0 || cursorRow >= term.rows) {
    return;
  }

  // lineHeight ≈ fontSize * lineHeight (14 * 1.5 = 21px)
  const fontSize = term.options.fontSize || 14;
  const lineHeightMult = term.options.lineHeight || 1.5;
  const lineHeightPx = fontSize * lineHeightMult;

  // Posicionar DEBAJO del cursor con espacio: fila * altura + 2*altura + margen grande
  // 2*lineHeight asegura que el popup quede debajo del prompt + input, sin tapar nada
  const top = (cursorRow * lineHeightPx) + (lineHeightPx * 2) + 20;

  popup.style.top = `${top}px`;
}

/**
 * Oculta el popup y limpia estado.
 */
function hidePopup() {
  popup.classList.add('hidden');
  popup.innerHTML = '';
  currentSuggestions = [];
  selectedIndex = -1;
}

/**
 * Escapa HTML para evitar inyección desde la CKB.
 */
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}
