// tooltip.js — Card educativa con info del comando
//
// Cuando el usuario escribe un comando reconocido (y agrega espacio),
// aparece una card lateral con: qué hace, cuándo usarlo, top 3 flags, ejemplo real.
// Dismissible con Esc o click fuera. No aparece si ya ejecutaste ese comando
// muchas veces (lógica "aprende" en FASE 3).
//
// FASE 3 — Semanas 29-33

const tooltipEl = document.getElementById('tooltip-card');
const inputEl   = document.getElementById('terminal-input');

let lastShownCommand = null;

// Detectar cuando el usuario termina de escribir el nombre del comando (agrega espacio)
inputEl.addEventListener('input', async () => {
  const value = inputEl.value;
  const parts = value.split(' ');
  const cmd   = parts[0];

  // El tooltip aparece cuando hay exactamente un espacio después del comando
  if (parts.length === 2 && parts[1] === '' && cmd !== lastShownCommand) {
    // FASE 3: buscar info del comando en CKB
    // const info = await invoke('get_command_info', { name: cmd });
    // if (info) showTooltip(info);
    // else hideTooltip();
    lastShownCommand = cmd;
  }

  if (!value || !value.includes(' ')) {
    hideTooltip();
  }
});

function showTooltip(info) {
  tooltipEl.innerHTML = `
    <div class="tooltip-command-name">${info.name}</div>
    <div class="tooltip-description">${info.description_es}</div>
    ${info.examples[0] ? `<div class="tooltip-example">$ ${info.examples[0].command}</div>` : ''}
    <div class="tooltip-close-hint">Esc para cerrar</div>
  `;
  tooltipEl.classList.remove('hidden');
}

function hideTooltip() {
  tooltipEl.classList.add('hidden');
  lastShownCommand = null;
}

// Esc cierra el tooltip
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') hideTooltip();
});

// Click fuera del tooltip lo cierra
document.addEventListener('mousedown', (e) => {
  if (!tooltipEl.contains(e.target)) hideTooltip();
});
