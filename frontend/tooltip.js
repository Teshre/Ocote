// tooltip.js — Card educativa de comandos
//
// Cuando el usuario ejecuta un comando reconocido (presiona Enter),
// aparece una card lateral con información educativa:
// qué hace, categoría, flags más comunes, y un ejemplo.
//
// Se cierra con Esc o click fuera. No invasivo.

const tooltipEl = document.getElementById('tooltip-card');

// Lee el idioma activo del localStorage (escrito por el selector de idioma).
// Fallback: 'es'.
function getLang() {
  return localStorage.getItem('ocote_lang') || 'es';
}

let currentTooltipCommand = null;
let tooltipTimeout = null;

// ── Strings de UI traducidos ──────────────────────────────────────────────
// Todas las etiquetas visibles del tooltip en los 5 idiomas.
// Las descripciones de ejemplos y flags se mantienen en su idioma original
// (son texto técnico breve y autoexplicativo junto al código).
const UI_STRINGS = {
  es: {
    commonFlags:  'Flags comunes',
    example:      'Ejemplo',
    closeHint:    'Esc o clic fuera para cerrar',
  },
  en: {
    commonFlags:  'Common flags',
    example:      'Example',
    closeHint:    'Esc or click outside to close',
  },
  pt: {
    commonFlags:  'Flags comuns',
    example:      'Exemplo',
    closeHint:    'Esc ou clique fora para fechar',
  },
  fr: {
    commonFlags:  'Options courantes',
    example:      'Exemple',
    closeHint:    'Échap ou clic en dehors pour fermer',
  },
  de: {
    commonFlags:  'Häufige Flags',
    example:      'Beispiel',
    closeHint:    'Esc oder außerhalb klicken zum Schließen',
  },
};

// Devuelve las strings de UI para el idioma activo.
// Si el idioma no existe en el mapa, cae a español.
function getUI() {
  return UI_STRINGS[getLang()] || UI_STRINGS['es'];
}

/**
 * Callback invocado desde terminal.js cuando el usuario ejecuta un comando.
 * Consulta la CKB y muestra el tooltip si el comando existe.
 */
window.onTerminalCommandExecuted = async function (cmdName) {
  // No mostrar tooltip vacío o comandos muy cortos
  if (!cmdName || cmdName.length < 2) {
    hideTooltip();
    return;
  }
  
  // Evitar mostrar el mismo comando repetidamente si ya está visible
  if (cmdName === currentTooltipCommand) {
    return;
  }
  
  try {
    const info = await window.__TAURI__.invoke('get_command_info', { name: cmdName, lang: getLang() });
    if (info) {
      showTooltip(info);
    } else {
      hideTooltip();
    }
  } catch (err) {
    // Comando no encontrado en CKB — no mostrar nada
    hideTooltip();
  }
};

/**
 * Muestra el tooltip con la información del comando.
 * @param {Object} info — objeto Command desde la CKB
 */
function showTooltip(info) {
  currentTooltipCommand = info.name;
  
  // Construir HTML del tooltip
  let html = '';
  
  // Header: nombre + categoría
  html += `<div class="tooltip-header">`;
  html += `<div class="tooltip-command-name">${escapeHtml(info.name)}</div>`;
  if (info.category) {
    html += `<div class="tooltip-category">${escapeHtml(info.category)}</div>`;
  }
  html += `</div>`;
  
  // Descripción (ya resuelta en el idioma activo por el backend)
  if (info.description) {
    html += `<div class="tooltip-description">${escapeHtml(info.description)}</div>`;
  }
  
  // Etiquetas de UI en el idioma activo
  const ui = getUI();

  // Flags (top 3)
  if (info.flags && info.flags.length > 0) {
    html += `<div class="tooltip-section-title">${ui.commonFlags}</div>`;
    html += `<div class="tooltip-flags">`;
    const topFlags = info.flags.slice(0, 3);
    for (const flag of topFlags) {
      html += `
        <div class="tooltip-flag">
          <code>${escapeHtml(flag.flag)}</code>
          <span>${escapeHtml(flag.description)}</span>
        </div>
      `;
    }
    html += `</div>`;
  }

  // Ejemplo
  if (info.examples && info.examples.length > 0) {
    const example = info.examples[0];
    html += `<div class="tooltip-section-title">${ui.example}</div>`;
    html += `<div class="tooltip-example">$ ${escapeHtml(example.command)}</div>`;
    if (example.description) {
      html += `<div class="tooltip-example-desc">${escapeHtml(example.description)}</div>`;
    }
  }

  // Hint de cierre
  html += `<div class="tooltip-close-hint">${ui.closeHint}</div>`;
  
  tooltipEl.innerHTML = html;
  tooltipEl.classList.remove('hidden');
  
  // Auto-cerrar después de 8 segundos si el usuario no interactúa
  clearTimeout(tooltipTimeout);
  tooltipTimeout = setTimeout(() => {
    hideTooltip();
  }, 8000);
}

/**
 * Oculta el tooltip y limpia estado.
 */
function hideTooltip() {
  tooltipEl.classList.add('hidden');
  currentTooltipCommand = null;
  clearTimeout(tooltipTimeout);
}

/**
 * Escapa HTML para evitar inyección.
 */
function escapeHtml(text) {
  if (!text) return '';
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// ── Event listeners globales ──────────────────────────────────────────────

// Esc cierra el tooltip
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltip();
});

// Click fuera del tooltip lo cierra
document.addEventListener('mousedown', (e) => {
  if (!tooltipEl.contains(e.target)) hideTooltip();
});
