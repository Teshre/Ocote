// preview.js — Panel de preview de archivos
// Se abre al hacer doble clic en un archivo del explorador.
// Muestra el contenido con syntax highlighting (highlight.js) para texto,
// o la imagen inline para formatos gráficos.

const IMAGE_EXTS = new Set([
    'png', 'jpg', 'jpeg', 'gif', 'webp', 'ico', 'bmp', 'svg', 'avif',
]);

const LARGE_FILE_WARN = 512 * 1024; // 512KB — mostrar warning

let _currentPreviewPath = null;

function openPreview(filePath, fileName) {
    const panel = document.getElementById('preview-panel');
    const filenameEl = document.getElementById('preview-filename');
    const contentEl = document.getElementById('preview-content');
    if (!panel || !contentEl) return;

    _currentPreviewPath = filePath;
    filenameEl.textContent = fileName;
    panel.classList.remove('hidden');
    contentEl.innerHTML = '<div id="preview-loading">Cargando...</div>';

    const ext = fileName.split('.').pop()?.toLowerCase();

    if (IMAGE_EXTS.has(ext)) {
        loadImagePreview(filePath, contentEl);
    } else {
        loadTextPreview(filePath, contentEl);
    }

    // Refit terminal
    setTimeout(() => {
        const active = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
        if (active?.fitAddon) active.fitAddon.fit();
    }, 250);
}

function closePreview() {
    const panel = document.getElementById('preview-panel');
    const contentEl = document.getElementById('preview-content');
    if (panel) panel.classList.add('hidden');
    if (contentEl) contentEl.innerHTML = '';
    _currentPreviewPath = null;

    // Refit terminal
    setTimeout(() => {
        const active = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
        if (active?.fitAddon) active.fitAddon.fit();
    }, 250);
}

async function loadTextPreview(filePath, contentEl) {
    try {
        const text = await window.__TAURI__.invoke('read_text_file', {
            path: filePath,
            shellId: window.ocoteActiveShellId,
        });

        // Si es muy grande, mostrar advertencia
        if (text.length > LARGE_FILE_WARN) {
            const sizeKb = Math.round(text.length / 1024);
            const warn = document.createElement('div');
            warn.style.cssText = 'padding:8px 16px;font-size:11px;color:var(--text-dim);background:var(--accent-muted);border-bottom:1px solid var(--border)';
            warn.textContent = `Archivo grande (${sizeKb} KB). Mostrando primeras ${Math.round(LARGE_FILE_WARN / 1024)} KB.`;
            contentEl.prepend(warn);
        }

        // Recortar si es enorme
        const displayText = text.length > LARGE_FILE_WARN ? text.slice(0, LARGE_FILE_WARN) : text;

        // highlight.js
        let highlighted;
        if (window.hljs) {
            const result = window.hljs.highlightAuto(displayText);
            highlighted = result.value;
        } else {
            // Fallback: texto escapado
            const div = document.createElement('div');
            div.textContent = displayText;
            highlighted = div.innerHTML;
        }

        contentEl.innerHTML = `<pre><code class="hljs">${highlighted}</code></pre>`;
    } catch (err) {
        // No se pudo leer como texto → mostrar como no soportado
        contentEl.innerHTML = `
            <div class="preview-unsupported">
                <div class="preview-icon">🔍</div>
                <div>No se puede mostrar el contenido de este archivo.</div>
                <div style="margin-top:8px;font-size:10px;opacity:0.5">${escapeHtml(String(err))}</div>
            </div>
        `;
    }
}

async function loadImagePreview(filePath, contentEl) {
    try {
        const base64 = await window.__TAURI__.invoke('read_file_base64', {
            path: filePath,
            shellId: window.ocoteActiveShellId,
        });
        const ext = filePath.split('.').pop()?.toLowerCase();
        const mime = ext === 'svg' ? 'image/svg+xml' : `image/${ext === 'jpg' ? 'jpeg' : ext}`;
        contentEl.innerHTML = `
            <div class="preview-image">
                <img src="data:${mime};base64,${base64}" alt="Preview" />
            </div>
        `;
    } catch (err) {
        contentEl.innerHTML = `
            <div class="preview-unsupported">
                <div class="preview-icon">🖼</div>
                <div>No se pudo cargar la imagen.</div>
                <div style="margin-top:8px;font-size:10px;opacity:0.5">${escapeHtml(String(err))}</div>
            </div>
        `;
    }
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ── Cerrar preview ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('preview-close')?.addEventListener('click', closePreview);
});

// Exponer para que explorer.js lo llame desde el doble click
window.openPreview = openPreview;
window.closePreview = closePreview;
