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
let homePath = '';
let syncInterval = null;

// Cache de directorios: path → { entries, timestamp }
// Esto hace que directorios ya visitados se rendericen instantáneamente
const dirCache = new Map();
const CACHE_TTL_MS = 30000; // 30 segundos

// ── Inicialización ────────────────────────────────────────────────────────

async function initExplorer() {
    if (!panel) {
        console.error('[Explorer] No se encontró #explorer-panel');
        return;
    }
    
    panel.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">Cargando...</div>';
    
    try {
        currentPath = await window.__TAURI__.invoke('get_home_directory');
        homePath = currentPath;
        console.log('[Explorer] Home:', currentPath);
        lastSyncedPath = currentPath;
        
        await loadDirectory(currentPath);
        
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
                await loadDirectory(cwd);
            }
        } catch (err) {
            // Silencioso: si no hay shell o lsof falla, no mostrar error
        }
    }, 1000);
}

// ── Fast-path: cd ejecutado desde la terminal ─────────────────────────────
// terminal.js llama a esta función inmediatamente cuando detecta Enter
// después de un comando "cd <target>". Evita esperar al polling de 1s.

window.onTerminalCdExecuted = function (target) {
    const newPath = resolveCdPath(target, currentPath);
    if (newPath && newPath !== currentPath) {
        console.log('[Explorer] Fast sync: cd to', newPath);
        loadDirectory(newPath, { instant: true });
    }
};

// ── Cargar directorio con cache ─────────────────────────────────────────

async function loadDirectory(path, options = {}) {
    const { instant = false } = options;
    
    currentPath = path;
    lastSyncedPath = path;
    // Exponer el CWD globalmente para que autocomplete.js pueda leer el contexto
    window.ocoteCwd = path;
    updateBreadcrumb(path);
    
    // 1. Intentar cache (renderizado instantáneo)
    const cached = dirCache.get(path);
    if (cached && (Date.now() - cached.timestamp) < CACHE_TTL_MS) {
        renderEntries(cached.entries, path);
        // Refrescar en background si no es instant
        if (!instant) {
            refreshDirectory(path);
        }
        return;
    }
    
    // 2. Si no hay cache, mostrar loading y esperar
    if (!instant || !cached) {
        panel.innerHTML = '<div style="padding:12px;color:var(--text-dim);font-size:12px">Cargando...</div>';
    }
    
    try {
        const entries = await window.__TAURI__.invoke('list_directory', { path });
        dirCache.set(path, { entries, timestamp: Date.now() });
        renderEntries(entries, path);
    } catch (err) {
        console.error('[Explorer] Error cargando directorio:', err);
        panel.innerHTML = `<div style="padding:12px;color:#e06c75;font-size:11px">${escapeHtml(String(err))}</div>`;
    }
}

async function refreshDirectory(path) {
    try {
        const entries = await window.__TAURI__.invoke('list_directory', { path });
        dirCache.set(path, { entries, timestamp: Date.now() });
        // Solo re-renderizar si seguimos en este path
        if (currentPath === path) {
            renderEntries(entries, path);
        }
    } catch (err) {
        console.error('[Explorer] Error refrescando directorio:', err);
    }
}

function resolveCdPath(target, basePath) {
    target = target.trim();
    if (!target || target === '~') {
        // cd sin argumentos o cd ~ → home
        return homePath || basePath;
    }
    if (target === '-') {
        // cd - → no podemos rastrear el anterior, dejar que el polling lo maneje
        return null;
    }
    if (target === '..') {
        return getParentPath(basePath);
    }
    if (target.startsWith('/')) {
        return target;
    }
    // Ruta relativa
    const sep = basePath.endsWith('/') ? '' : '/';
    return basePath + sep + target;
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
    
    // Cargar directorio (con cache es instantáneo)
    await loadDirectory(path, { instant: true });
    
    // Sincronizar con PTY:
    // Problema: si el usuario tiene texto a medio escribir en la terminal,
    // ZLE lo tiene en su buffer. Mandar `cd /ruta\r` directamente lo concatena
    // con lo que ya está escrito → el comando falla → el explorador regresa al dir anterior.
    //
    // Solución:
    //   1. \x15 = Ctrl+U → ZLE borra todo el buffer actual (igual que el usuario
    //      presionara Ctrl+U). El texto en pantalla desaparece.
    //   2. `cd "${path}"\r` → ahora el buffer está limpio y el cd se ejecuta solo.
    //   3. Resetear el tracking de input en terminal.js para que el autocompletado
    //      y el tooltip no queden con el estado del texto que se borró.
    try {
        await window.__TAURI__.invoke('write_to_shell', { input: '\x15' });
        await window.__TAURI__.invoke('write_to_shell', { input: `cd "${path}"\r` });
        // Notificar a terminal.js que el input fue reseteado externamente
        if (window.resetTerminalInput) {
            window.resetTerminalInput();
        }
    } catch (err) {
        console.error('[Explorer] Error sincronizando con PTY:', err);
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
