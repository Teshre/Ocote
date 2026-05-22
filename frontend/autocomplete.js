// autocomplete.js — Popup de autocompletado con descripciones
//
// Mientras el usuario escribe, muestra un popup con sugerencias
// de la CKB (nombre del comando + descripción corta).
// Navegable con flechas, Tab/Enter para aceptar, Esc para cerrar.
//
// FASE 2 — Semanas 23-28

const popupEl    = document.getElementById('autocomplete-popup');
const inputEl    = document.getElementById('terminal-input');

let suggestions  = [];
let selectedIndex = -1;

// Escuchar lo que el usuario escribe
inputEl.addEventListener('input', async () => {
  const value = inputEl.value.trim();

  if (!value || value.includes(' ')) {
    // No mostrar si está vacío o si ya escribió argumentos (hay espacio)
    hidePopup();
    return;
  }

  // FASE 2: Consultar la CKB
  // suggestions = await invoke('get_suggestions', { prefix: value, lang: 'es' });
  // if (suggestions.length > 0) renderPopup();
  // else hidePopup();
});

// Navegación con teclado
inputEl.addEventListener('keydown', (e) => {
  if (popupEl.classList.contains('hidden')) return;

  if (e.key === 'ArrowDown') {
    e.preventDefault();
    selectedIndex = Math.min(selectedIndex + 1, suggestions.length - 1);
    updateSelection();
  }
  if (e.key === 'ArrowUp') {
    e.preventDefault();
    selectedIndex = Math.max(selectedIndex - 1, 0);
    updateSelection();
  }
  if (e.key === 'Tab' || e.key === 'Enter') {
    if (selectedIndex >= 0) {
      e.preventDefault();
      acceptSuggestion(suggestions[selectedIndex].name);
    }
  }
  if (e.key === 'Escape') {
    hidePopup();
  }
});

function renderPopup() {
  popupEl.innerHTML = suggestions.map((s, i) => `
    <div class="autocomplete-item ${i === selectedIndex ? 'selected' : ''}"
         data-index="${i}">
      <span class="autocomplete-name">${s.name}</span>
      <span class="autocomplete-desc">${s.description_es}</span>
    </div>
  `).join('');

  popupEl.querySelectorAll('.autocomplete-item').forEach(item => {
    item.addEventListener('mousedown', (e) => {
      e.preventDefault(); // evita que el input pierda foco
      acceptSuggestion(suggestions[parseInt(item.dataset.index)].name);
    });
  });

  popupEl.classList.remove('hidden');
}

function acceptSuggestion(name) {
  inputEl.value = name + ' ';
  inputEl.focus();
  hidePopup();
}

function updateSelection() {
  popupEl.querySelectorAll('.autocomplete-item').forEach((item, i) => {
    item.classList.toggle('selected', i === selectedIndex);
  });
}

function hidePopup() {
  popupEl.classList.add('hidden');
  suggestions = [];
  selectedIndex = -1;
}
