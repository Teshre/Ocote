// onboarding.js — Pantalla de bienvenida de primer uso (Fase 3)
//
// Se muestra UNA SOLA VEZ: la primera vez que el usuario abre Ocote.
// Persiste el estado en localStorage bajo la clave 'ocote_onboarding_done'.
//
// El usuario también puede volver a verlo con Ctrl+Shift+? en cualquier momento,
// por si quiere repasar las features o se le olvidó algo.

const STORAGE_KEY = 'ocote_onboarding_done';

const overlay = document.getElementById('onboarding-overlay');
const btn     = document.getElementById('onboarding-btn');

// ── Mostrar / ocultar ─────────────────────────────────────────────────────

function showOnboarding() {
    // Ajustar el logo a la variante de ícono elegida en Settings (light/dark).
    const logo = document.getElementById('onboarding-logo');
    if (logo) {
        const variant = localStorage.getItem('ocote_app_icon') || 'dark';
        logo.src = variant === 'light' ? 'icons/icon-light.png' : 'icons/icon-dark.png';
    }
    overlay.classList.remove('hidden');
    // Foco en el botón para que sea accesible con teclado
    btn.focus();
}

function hideOnboarding() {
    // Animación de salida: fade out
    overlay.classList.add('closing');
    overlay.addEventListener('animationend', () => {
        overlay.classList.add('hidden');
        overlay.classList.remove('closing');
    }, { once: true });
}

function dismissOnboarding() {
    // Marcar como visto para que no vuelva a aparecer al abrir la app
    localStorage.setItem(STORAGE_KEY, '1');
    hideOnboarding();
}

// ── Eventos ───────────────────────────────────────────────────────────────

// Botón "Comenzar →"
btn.addEventListener('click', dismissOnboarding);

// Clic fuera de la card también cierra el onboarding
overlay.addEventListener('click', (e) => {
    // Solo si el clic fue en el overlay (fondo oscuro), no dentro de la card
    if (e.target === overlay) {
        dismissOnboarding();
    }
});

// Esc cierra el onboarding
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) {
        dismissOnboarding();
    }
    // Ctrl+Shift+? → volver a mostrar el onboarding en cualquier momento
    if (e.ctrlKey && e.shiftKey && e.key === '?') {
        showOnboarding();
    }
});

// ── Inicialización ────────────────────────────────────────────────────────

// Esperamos un pequeño delay antes de mostrar el onboarding.
// Razón: dejamos que la terminal y el explorador carguen primero.
// Ver el fondo con la app funcionando hace que la bienvenida tenga más contexto.
function init() {
    const alreadySeen = localStorage.getItem(STORAGE_KEY);

    if (!alreadySeen) {
        // Primera vez: esperar 600ms a que la UI esté pintada
        setTimeout(showOnboarding, 600);
    }
    // Si ya lo vio, no hacer nada (Ctrl+Shift+? sigue disponible)
}

init();
