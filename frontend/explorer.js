// explorer.js — Panel lateral de explorador de archivos
// FASE 2

// NOTA: Usamos window.__TAURI__.invoke directamente porque terminal.js ya declaró `const { invoke }`
// y los scripts en el scope global no permiten redeclarar `const`.

// ── Referencias DOM ───────────────────────────────────────────────────────
const panel = document.getElementById('explorer-panel');
const breadcrumb = document.getElementById('breadcrumb');

// ── Estado ────────────────────────────────────────────────────────────────
let currentPath = '';
let lastSyncedPath = '';
let syncInterval = null;

// ── Inicialización ────────────────────────────────────────────────────────

async function initExplorer() {
    if (!panel) {
        console.error('[Explorer] No se encontró #explorer-panel');
        return;
    }
    
    panel.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">Cargando...</div>';
    
    try {
        currentPath = await window.__TAURI__.invoke('get_home_directory');
        console.log('[Explorer] Home:', currentPath);
        lastSyncedPath = currentPath;
        
        const entries = await window.__TAURI__.invoke('list_directory', { path: currentPath });
        console.log('[Explorer] Entries:', entries.length);
        
        renderEntries(entries, currentPath);
        updateBreadcrumb(currentPath);
        
        // Iniciar polling para sincronizar terminal → explorador
        startSyncPolling();
    } catch (err) {
        console.error('[Explorer] Error:', err);
        panel.innerHTML = `<div style="padding:12px;color:#e06c75;font-size:11px">${escapeHtml(String(err))}</div>`;
    }
}

// ── Sincronización terminal → explorador ────────────────────────────────
// Cada 2 segundos lee el CWD real del proceso shell y actualiza el explorador
// si el usuario hizo cd manualmente en la terminal.

function startSyncPolling() {
    if (syncInterval) clearInterval(syncInterval);
    
    syncInterval = setInterval(async () => {
        try {
            const cwd = await window.__TAURI__.invoke('get_shell_cwd');
            if (cwd && cwd !== lastSyncedPath) {
                console.log('[Explorer] Sync: terminal CWD changed to', cwd);
                lastSyncedPath = cwd;
                currentPath = cwd;
                
                const entries = await window.__TAURI__.invoke('list_directory', { path: currentPath });
                renderEntries(entries, currentPath);
                updateBreadcrumb(currentPath);
            }
        } catch (err) {
            // Silencioso: si no hay shell o lsof falla, no mostrar error
            // console.log('[Explorer] Sync check failed:', err);
        }
    }, 2000);
}

// ── Renderizar entradas ────────────────────────────────────────────────

function renderEntries(entries, path) {
    if (!panel) return;
    
    let html = '';
    
    // Botón subir ("..")
    if (path !== '/') {
        const parent = getParentPath(path);
        html += `
            <div class="explorer-item explorer-up" 
                 data-path="${escapeHtml(parent)}"
                 data-name=".."
                 data-is-dir="true">
                <span class="explorer-icon">↩</span>
                <span class="explorer-name">..</span>
            </div>
        `;
    }
    
    // Entradas del directorio
    for (const entry of entries) {
        const icon = entry.is_dir ? '📁' : getFileIcon(entry.name);
        const cls = entry.is_dir ? 'explorer-folder' : 'explorer-file';
        html += `
            <div class="explorer-item ${cls}" 
                 data-path="${escapeHtml(entry.path)}" 
                 data-name="${escapeHtml(entry.name)}" 
                 data-is-dir="${entry.is_dir}">
                <span class="explorer-icon">${icon}</span>
                <span class="explorer-name" title="${escapeHtml(entry.name)}">${escapeHtml(truncateName(entry.name, 20))}</span>
            </div>
        `;
    }
    
    if (entries.length === 0) {
        html += '<div style="padding:12px;color:var(--text-dim);font-size:12px">Vacío</div>';
    }
    
    panel.innerHTML = html;
    
    // Event listeners
    panel.querySelectorAll('.explorer-item').forEach(item => {
        item.addEventListener('click', handleClick);
    });
}

// ── Click handler ────────────────────────────────────────────────────────

async function handleClick(e) {
    const item = e.currentTarget;
    const path = item.getAttribute('data-path');
    const isDir = item.getAttribute('data-is-dir') === 'true';
    
    if (!isDir) return;
    
    currentPath = path;
    lastSyncedPath = path;
    panel.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">Cargando...</div>';
    
    try {
        const entries = await window.__TAURI__.invoke('list_directory', { path: currentPath });
        renderEntries(entries, currentPath);
        updateBreadcrumb(currentPath);
        
        // Sincronizar con PTY: usar el path absoluto para cd
        await window.__TAURI__.invoke('write_to_shell', { input: `cd "${path}"\n` });
    } catch (err) {
        console.error('[Explorer] Error navegando:', err);
        panel.innerHTML = `<div style="padding:12px;color:#e06c75;font-size:11px">${escapeHtml(String(err))}</div>`;
    }
}

// ── Breadcrumb ────────────────────────────────────────────────────────────

function updateBreadcrumb(path) {
    if (breadcrumb) {
        breadcrumb.textContent = path.replace(/^\/Users\/[^\/]+/, '~') || '~';
    }
}

// ── Helpers ───────────────────────────────────────────────────────────────

function getParentPath(path) {
    const parts = path.split('/').filter(Boolean);
    parts.pop();
    return parts.length === 0 ? '/' : '/' + parts.join('/');
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function truncateName(name, maxLen) {
    return name.length <= maxLen ? name : name.substring(0, maxLen - 3) + '...';
}

function getFileIcon(filename) {
    const ext = filename.split('.').pop().toLowerCase();
    const icons = { js:'📜', ts:'📜', rs:'🦀', py:'🐍', html:'🌐', css:'🎨', json:'📋', md:'📝', txt:'📄', pdf:'📕', jpg:'🖼', png:'🖼', mp3:'🎵', mp4:'🎬', zip:'📦' };
    return icons[ext] || '📄';
}

// ── Iniciar ───────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExplorer);
} else {
    initExplorer();
}
