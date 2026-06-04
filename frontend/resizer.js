// resizer.js — Redimensionamiento de paneles arrastrable
//
// Controla el ancho del explorador (izquierda) y del preview (derecha).
// El panel de terminal (centro) toma el espacio restante automáticamente
// gracias a flex: 1 en su CSS.
//
// Layout:
//   [#explorer-panel] [#resizer-explorer] [#terminal-panel] [#resizer-preview] [#preview-panel]
//
// Notas importantes:
//   - Cuando el explorador está colapsado (.collapsed → width:0 !important),
//     el resizer se oculta y el !important bloquea cualquier width inline.
//     Al expandir, recupera la última anchura guardada.
//   - Se llama fitAddon.fit() después de cada redimensionamiento para que
//     xterm.js recalcule las filas/columnas del PTY.

(function initResizers() {

    // ── Constantes ─────────────────────────────────────────────────────────
    const MIN_EXPLORER = 120;   // px mínimo del explorador
    const MAX_EXPLORER = 520;   // px máximo del explorador
    const MIN_PREVIEW  = 180;   // px mínimo del preview
    // Máximo del preview: 65% del viewport (calculado en runtime)

    const LS_EXPLORER = 'ocote_panel_explorer_w';
    const LS_PREVIEW  = 'ocote_panel_preview_w';

    // ── Helpers ────────────────────────────────────────────────────────────

    // Recalcula filas/columnas del terminal activo después de un resize.
    // Usa requestAnimationFrame para que el DOM se haya pintado ya.
    function fitActiveTerminal() {
        requestAnimationFrame(() => {
            const tab = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
            if (tab?.fitAddon) tab.fitAddon.fit();
        });
    }

    // Restaura los tamaños guardados en localStorage.
    // Se llama en DOMContentLoaded antes del primer paint relevante.
    function applySavedSizes() {
        const explorerPanel = document.getElementById('explorer-panel');
        const previewPanel  = document.getElementById('preview-panel');

        const savedExplorer = parseInt(localStorage.getItem(LS_EXPLORER), 10);
        const savedPreview  = parseInt(localStorage.getItem(LS_PREVIEW),  10);

        // Solo aplicar si el valor es un número válido dentro de los límites
        if (savedExplorer && savedExplorer >= MIN_EXPLORER && savedExplorer <= MAX_EXPLORER) {
            explorerPanel.style.width = savedExplorer + 'px';
        }
        if (savedPreview && savedPreview >= MIN_PREVIEW) {
            previewPanel.style.width = savedPreview + 'px';
        }
    }

    // ── setupResizer ───────────────────────────────────────────────────────
    //
    // Conecta un elemento resizer con el panel que controla.
    //
    // Parámetros:
    //   resizerEl  — el div.panel-resizer
    //   panelEl    — el panel cuya anchura controlamos
    //   minW       — anchura mínima en px
    //   maxWFn     — función () → número, devuelve la anchura máxima
    //   direction  — 'right': arrastrar → derecha → panel más ancho (explorador)
    //                'left' : arrastrar → derecha → panel más estrecho (preview)
    //   lsKey      — clave localStorage para persistir el tamaño

    function setupResizer(resizerEl, panelEl, minW, maxWFn, direction, lsKey) {
        if (!resizerEl || !panelEl) return;

        let dragging = false;
        let startX   = 0;
        let startW   = 0;

        // ── Visibilidad reactiva ───────────────────────────────────────────
        // Ocultar el resizer cuando el panel está oculto o colapsado.
        // Usamos MutationObserver para reaccionar a cambios de clase en runtime.
        function syncVisibility() {
            const hidden = panelEl.classList.contains('hidden') ||
                           panelEl.classList.contains('collapsed');
            resizerEl.style.display = hidden ? 'none' : '';
        }

        const observer = new MutationObserver(syncVisibility);
        observer.observe(panelEl, { attributes: true, attributeFilter: ['class'] });
        syncVisibility(); // estado inicial

        // ── Inicio del arrastre ────────────────────────────────────────────
        resizerEl.addEventListener('mousedown', (e) => {
            if (e.button !== 0) return; // solo botón izquierdo del ratón
            e.preventDefault();

            dragging = true;
            startX   = e.clientX;
            startW   = panelEl.getBoundingClientRect().width;

            // Desactivar transiciones del panel durante el arrastre para
            // evitar el lag visual que produce transition: width.
            panelEl.style.transition = 'none';

            document.body.style.cursor     = 'col-resize';
            document.body.style.userSelect = 'none';
            resizerEl.classList.add('dragging');
        });

        // ── Movimiento ────────────────────────────────────────────────────
        document.addEventListener('mousemove', (e) => {
            if (!dragging) return;

            const delta = e.clientX - startX;

            // 'right': explorador crece al arrastrar a la derecha (+delta)
            // 'left' : preview crece al arrastrar a la izquierda (-delta)
            const rawW    = direction === 'right'
                ? startW + delta
                : startW - delta;

            const clamped = Math.max(minW, Math.min(maxWFn(), rawW));
            panelEl.style.width = clamped + 'px';

            // Fit continuo mientras se arrastra
            fitActiveTerminal();
        });

        // ── Fin del arrastre ──────────────────────────────────────────────
        document.addEventListener('mouseup', () => {
            if (!dragging) return;
            dragging = false;

            // Restaurar transiciones del panel
            panelEl.style.transition = '';

            document.body.style.cursor     = '';
            document.body.style.userSelect = '';
            resizerEl.classList.remove('dragging');

            // Guardar anchura final (redondeada) en localStorage
            const finalW = Math.round(panelEl.getBoundingClientRect().width);
            localStorage.setItem(lsKey, finalW);

            fitActiveTerminal();
        });
    }

    // ── Inicialización ─────────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        applySavedSizes();

        // Resizer izquierdo: explorador ↔ terminal
        setupResizer(
            document.getElementById('resizer-explorer'),
            document.getElementById('explorer-panel'),
            MIN_EXPLORER,
            () => MAX_EXPLORER,
            'right',         // arrastrar → derecha → explorador más ancho
            LS_EXPLORER
        );

        // Resizer derecho: terminal ↔ preview
        setupResizer(
            document.getElementById('resizer-preview'),
            document.getElementById('preview-panel'),
            MIN_PREVIEW,
            () => Math.round(window.innerWidth * 0.65),  // máx 65% del viewport
            'left',          // arrastrar → izquierda → preview más ancho
            LS_PREVIEW
        );
    });

})();
