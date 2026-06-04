// explorer.js — Panel lateral de explorador de archivos
// FASE 2

// NOTA: Usamos window.__TAURI__.invoke directamente porque terminal.js ya declaró `const { invoke }`
// y los scripts en el scope global no permiten redeclarar `const`.

// ── Referencias DOM ───────────────────────────────────────────────────────
const panel = document.getElementById('explorer-content');
const explorerBreadcrumb = document.getElementById('explorer-breadcrumb');

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

    // Context menu en espacio vacío del panel — registrado UNA sola vez aquí
    // (no en renderEntries, que se llama en cada navegación). Solo dispara si
    // el click fue directo en el panel, no en un item (que tiene su propio handler).
    panel.addEventListener('contextmenu', (e) => {
        if (e.target.closest('.explorer-item')) return; // item ya lo maneja
        handlePanelContextMenu(e);
    });

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

// Shells que ya emitieron OSC 6731 (cwd autoritativo). Para ellos NO usamos el
// polling de get_shell_cwd, porque ese lee el cwd del PROCESO a nivel OS — que
// en PowerShell NO cambia con Set-Location (PS mantiene su ubicación interna).
// El polling revertiría el sync correcto del OSC. Queda solo como fallback para
// passthrough (shells sin integración OSC).
const _oscManagedShells = new Set();

function startSyncPolling() {
    if (syncInterval) clearInterval(syncInterval);

    syncInterval = setInterval(async () => {
        try {
            const activeShell = window.ocoteActiveShellId;
            if (!activeShell) return;
            // Si este shell emite OSC 6731, el OSC es la fuente de verdad — no pollear.
            if (_oscManagedShells.has(activeShell)) return;
            const cwd = await window.__TAURI__.invoke('get_shell_cwd', { shellId: activeShell });
            if (cwd && cwd !== lastSyncedPath) {
                console.log('[Explorer] Sync: terminal CWD changed to', cwd);
                await loadDirectory(cwd);
                // Actualizar nombre del tab con la carpeta actual
                if (window.TAB_MANAGER) {
                    window.TAB_MANAGER.updateTabName(activeShell, cwd);
                }
            }
        } catch (err) {
            // Silencioso: si no hay shell o lsof falla, no mostrar error
        }
    }, 1000);
}

// ── Sync autoritativo desde OSC 6731 ──────────────────────────────────────
// terminal.js llama a esta función con el cwd REAL que el shell reporta tras
// cada comando (con ~ abreviado). Es la fuente de verdad: funciona con cd
// directo, tab-completion, historial, pushd/popd, symlinks — lo que sea, porque
// es el PWD efectivo del proceso, no una adivinanza del texto tecleado.

window.onShellCwdChanged = function (cwdRaw) {
    if (!cwdRaw) return;
    // Este shell tiene integración OSC → marcarlo para que el polling no lo toque.
    if (window.ocoteActiveShellId) _oscManagedShells.add(window.ocoteActiveShellId);
    // Expandir ~ → home (el shell envía la ruta abreviada)
    let path = cwdRaw;
    if (path === '~') {
        path = homePath || path;
    } else if (path.startsWith('~/')) {
        path = (homePath || '') + path.slice(1);
    }
    if (path && path !== currentPath) {
        loadDirectory(path, { instant: true });
        if (window.TAB_MANAGER && window.ocoteActiveShellId) {
            window.TAB_MANAGER.updateTabName(window.ocoteActiveShellId, path);
        }
    } else if (path && path === currentPath) {
        // Mismo directorio pero el shell terminó un comando (OSC 6731 se emite
        // tras cada prompt). Refrescar git status por si fue git add/commit/etc.
        loadGitStatus(path);
    }
};

// ── Cargar directorio con cache ─────────────────────────────────────────

async function loadDirectory(path, options = {}) {
    const { instant = false } = options;

    // Si cambiamos de directorio, descartar los badges del anterior hasta que
    // llegue el git status del nuevo (evita mostrar estados de otro directorio).
    if (path !== currentPath) currentGitStatus = {};

    currentPath = path;
    lastSyncedPath = path;
    // Exponer el CWD globalmente para que autocomplete.js pueda leer el contexto
    window.ocoteCwd = path;
    
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
        // Git status en paralelo (no bloquea el render de archivos).
        loadGitStatus(path);
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
            loadGitStatus(path);
        }
    } catch (err) {
        console.error('[Explorer] Error refrescando directorio:', err);
    }
}

// ── Git status ─────────────────────────────────────────────────────────────
// Mapa { nombre_entrada → estado } del directorio actual. Lo consulta
// renderEntries para pintar los badges. Se actualiza async tras cada load.
let currentGitStatus = {};

async function loadGitStatus(path) {
    try {
        const status = await window.__TAURI__.invoke('git_status', { path });
        // Solo aplicar si seguimos en el mismo directorio (evita race entre cd rápidos).
        if (currentPath !== path) return;
        currentGitStatus = status || {};
        // Si hay cambios, re-pintar los badges sobre las entradas ya renderizadas.
        applyGitBadges();
    } catch (err) {
        // git no instalado / no es repo → sin badges, silencioso.
        currentGitStatus = {};
    }
}

// Aplica los badges de git a los items ya renderizados (sin re-render completo).
function applyGitBadges() {
    if (!panel) return;
    panel.querySelectorAll('.explorer-item[data-name]').forEach(item => {
        const name = item.dataset.name;
        const state = currentGitStatus[name];
        // Limpiar estado previo
        item.classList.remove('git-modified', 'git-added', 'git-untracked', 'git-deleted', 'git-renamed');
        const existing = item.querySelector('.git-badge');
        if (existing) existing.remove();
        if (!state) return;
        // Clase para colorear el nombre + badge con la letra
        item.classList.add('git-' + state);
        const letter = GIT_BADGE_LETTER[state] || '•';
        const badge = document.createElement('span');
        badge.className = 'git-badge git-badge-' + state;
        badge.textContent = letter;
        badge.title = GIT_BADGE_TITLE[state] || state;
        item.appendChild(badge);
    });
}

const GIT_BADGE_LETTER = {
    modified: 'M', added: 'A', untracked: 'U', deleted: 'D', renamed: 'R',
};
const GIT_BADGE_TITLE = {
    modified: 'Modificado', added: 'Agregado (staged)', untracked: 'Nuevo (sin trackear)',
    deleted: 'Eliminado', renamed: 'Renombrado',
};

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
                <span class="explorer-icon up-icon">↩</span>
                <span class="explorer-name">..</span>
            </div>
        `;
    }

    // Entradas del directorio
    for (const entry of entries) {
        // Los íconos ya devuelven HTML (span con color inline), no texto plano
        const iconHtml = entry.is_dir
            ? getFolderIconHtml(entry.name)
            : getFileIconHtml(entry.name);
        const cls = entry.is_dir ? 'explorer-folder' : 'explorer-file';
        html += `
            <div class="explorer-item ${cls}"
                 data-path="${escapeHtml(entry.path)}"
                 data-name="${escapeHtml(entry.name)}"
                 data-is-dir="${entry.is_dir}">
                <span class="explorer-icon">${iconHtml}</span>
                <span class="explorer-name" title="${escapeHtml(entry.name)}">${escapeHtml(truncateName(entry.name, 22))}</span>
            </div>
        `;
    }
    
    if (entries.length === 0) {
        html += '<div style="padding:12px;color:var(--text-dim);font-size:12px">Vacío</div>';
    }
    
    panel.innerHTML = html;

    // Event listeners por item. (El contextmenu del panel vacío se registra
    // UNA sola vez en initExplorer, no aquí — si no, se acumularían listeners
    // duplicados en cada navegación de directorio.)
    panel.querySelectorAll('.explorer-item').forEach(item => {
        item.addEventListener('click', handleClick);
        item.addEventListener('dblclick', handleDoubleClick);
        item.addEventListener('contextmenu', handleContextMenu);
    });

    // Aplicar badges de git status (si ya tenemos datos para este dir).
    applyGitBadges();

    // Actualizar breadcrumb inferior
    renderBreadcrumb(path);
}

// ── Breadcrumb inferior ─────────────────────────────────────────────────

function renderBreadcrumb(path) {
    if (!explorerBreadcrumb) return;
    
    const parts = path.split('/').filter(Boolean);
    const total = parts.length;
    
    let html = '';
    let accumulated = '/';
    
    // Home icon SVG (Tabler Icons)
    const homeSvg = `<svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" stroke-width="2.5" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M5 12l-2 0l9 -9l9 9l-2 0"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2 -2v-7"/><path d="M9 21v-6a2 2 0 0 1 2 -2h2a2 2 0 0 1 2 2v6"/></svg>`;
    html += `<button class="explorer-bc-segment explorer-bc-home" data-path="/" title="Home">${homeSvg}</button>`;
    
    for (let i = 0; i < total; i++) {
        accumulated = accumulated === '/' ? '/' + parts[i] : accumulated + '/' + parts[i];
        const isLast = i === total - 1;
        const label = parts[i];
        
        if (isLast) {
            // Último segmento: siempre completo, con flecha dropdown
            html += `<button class="explorer-bc-segment active" data-path="${escapeHtml(accumulated)}" data-dropdown="true" title="${escapeHtml(label)}">${escapeHtml(label)}<span class="bc-arrow">▾</span></button>`;
        } else {
            // Mostrar siempre el nombre completo para navegación horizontal en la barra superior
            html += `<button class="explorer-bc-segment" data-path="${escapeHtml(accumulated)}" title="${escapeHtml(label)}">${escapeHtml(label)}</button>`;
        }
    }
    
    explorerBreadcrumb.innerHTML = html;
    
    explorerBreadcrumb.querySelectorAll('.explorer-bc-segment').forEach(btn => {
        btn.addEventListener('click', handleBreadcrumbClick);
    });
}

async function handleBreadcrumbClick(e) {
    const btn = e.currentTarget;
    const path = btn.getAttribute('data-path');
    const hasDropdown = btn.getAttribute('data-dropdown') === 'true';
    
    // Cerrar dropdown existente
    closeBreadcrumbDropdown();
    
    if (hasDropdown) {
        // Mostrar dropdown con subcarpetas del directorio actual
        await showBreadcrumbDropdown(btn, path);
    } else {
        const shellId = window.ocoteActiveShellId;
        if (!shellId) return;
        await loadDirectory(path, { instant: true });
        try {
            await window.__TAURI__.invoke('write_to_shell', { shellId, input: '\x15' });
            await window.__TAURI__.invoke('write_to_shell', { shellId, input: `cd "${path}"\r` });
            if (window.resetTerminalInput) window.resetTerminalInput();
        } catch (err) {
            console.error('[Explorer] Error al sincronizar breadcrumb:', err);
        }
    }
}

let bcDropdownEl = null;

async function showBreadcrumbDropdown(btn, path) {
    const rect = btn.getBoundingClientRect();
    
    try {
        const entries = await window.__TAURI__.invoke('list_directory', { path });
        const dirs = entries.filter(e => e.is_dir).sort((a, b) => a.name.localeCompare(b.name));
        
        if (dirs.length === 0) return;
        
        bcDropdownEl = document.createElement('div');
        bcDropdownEl.id = 'explorer-bc-dropdown';
        
        let html = '';
        for (const dir of dirs) {
            const icon = getFolderIconHtml(dir.name);
            html += `
                <div class="explorer-bc-dropdown-item" data-path="${escapeHtml(dir.path)}">
                    <span class="bc-icon">${icon}</span>
                    <span>${escapeHtml(dir.name)}</span>
                </div>
            `;
        }
        bcDropdownEl.innerHTML = html;
        
        // Posicionar debajo del botón (barra superior)
        bcDropdownEl.style.left = rect.left + 'px';
        bcDropdownEl.style.top = (rect.bottom + 4) + 'px';
        
        document.body.appendChild(bcDropdownEl);
        
        bcDropdownEl.querySelectorAll('.explorer-bc-dropdown-item').forEach(item => {
            item.addEventListener('click', async (e) => {
                const dirPath = e.currentTarget.getAttribute('data-path');
                const shellId = window.ocoteActiveShellId;
                if (!shellId) return;
                closeBreadcrumbDropdown();
                await loadDirectory(dirPath, { instant: true });
                try {
                    await window.__TAURI__.invoke('write_to_shell', { shellId, input: '\x15' });
                    await window.__TAURI__.invoke('write_to_shell', { shellId, input: `cd "${dirPath}"\r` });
                    if (window.resetTerminalInput) window.resetTerminalInput();
                } catch (err) {
                    console.error('[Explorer] Error al navegar desde dropdown:', err);
                }
            });
        });
    } catch (err) {
        console.error('[Explorer] Error al listar subcarpetas:', err);
    }
}

function closeBreadcrumbDropdown() {
    if (bcDropdownEl) {
        bcDropdownEl.remove();
        bcDropdownEl = null;
    }
}

// Cerrar dropdown al hacer click fuera
document.addEventListener('click', (e) => {
    if (bcDropdownEl && !bcDropdownEl.contains(e.target) && !e.target.closest('.explorer-bc-segment[data-dropdown="true"]')) {
        closeBreadcrumbDropdown();
    }
});

// ── Click handler ────────────────────────────────────────────────────────

async function handleClick(e) {
    const item = e.currentTarget;
    const path = item.getAttribute('data-path');
    const isDir = item.getAttribute('data-is-dir') === 'true';
    
    if (!isDir) return;
    
    // Cargar directorio (con cache es instantáneo)
    await loadDirectory(path, { instant: true });
    
    const shellId = window.ocoteActiveShellId;
    if (!shellId) return;
    try {
        await window.__TAURI__.invoke('write_to_shell', { shellId, input: '\x15' });
        await window.__TAURI__.invoke('write_to_shell', { shellId, input: `cd "${path}"\r` });
        if (window.resetTerminalInput) {
            window.resetTerminalInput();
        }
    } catch (err) {
        console.error('[Explorer] Error sincronizando con PTY:', err);
    }
}

// ── Doble click handler (preview de archivos) ─────────────────────────────

function handleDoubleClick(e) {
    const item = e.currentTarget;
    const path = item.getAttribute('data-path');
    const name = item.getAttribute('data-name');
    const isDir = item.getAttribute('data-is-dir') === 'true';
    if (isDir) return;
    if (window.openPreview) {
        window.openPreview(path, name);
    }
}

// ── Diálogo de confirmación propio ────────────────────────────────────────
//
// window.confirm() NO funciona en WKWebView (Tauri/macOS): devuelve `true`
// inmediatamente sin mostrar ningún diálogo nativo. Usamos un modal HTML
// que devuelve una Promise<boolean> — compatible con async/await.
//
// Uso:  if (await ocoteConfirm('¿Eliminar "foo"?')) { ... }

function ocoteConfirm(message, { confirmLabel = 'Eliminar', danger = true } = {}) {
    return new Promise((resolve) => {
        // ── Backdrop — igual que settings overlay ──────────────────────────
        const overlay = document.createElement('div');
        overlay.style.cssText = `
            position: fixed; inset: 0; z-index: 9999;
            background: var(--bg-overlay);
            backdrop-filter: blur(6px);
            -webkit-backdrop-filter: blur(6px);
            display: flex; align-items: center; justify-content: center;
        `;

        // ── Caja del diálogo — misma paleta que settings-card ─────────────
        const box = document.createElement('div');
        box.style.cssText = `
            background: var(--bg-sidebar);
            border: 1px solid var(--border-strong);
            border-radius: 12px;
            padding: 24px 26px 20px;
            max-width: 360px; width: 90%;
            box-shadow: var(--shadow-lg);
            font-family: var(--font-mono);
            color: var(--text-primary);
            animation: confirm-pop-in 0.18s ease;
        `;

        // ── Animación (igual que settings-pop-in) ─────────────────────────
        if (!document.getElementById('ocote-confirm-style')) {
            const style = document.createElement('style');
            style.id = 'ocote-confirm-style';
            style.textContent = `
                @keyframes confirm-pop-in {
                    from { opacity: 0; transform: scale(0.95) translateY(6px); }
                    to   { opacity: 1; transform: scale(1)    translateY(0);   }
                }
                .ocote-confirm-cancel {
                    padding: 6px 16px;
                    border-radius: var(--radius-sm);
                    border: 1px solid var(--border-strong);
                    background: var(--bg-input);
                    color: var(--text-secondary);
                    font-family: var(--font-mono);
                    font-size: 12px;
                    cursor: pointer;
                    transition: background 100ms ease, color 100ms ease;
                }
                .ocote-confirm-cancel:hover {
                    background: var(--hover-bg);
                    color: var(--text-primary);
                }
                .ocote-confirm-ok {
                    padding: 6px 16px;
                    border-radius: var(--radius-sm);
                    border: none;
                    font-family: var(--font-mono);
                    font-size: 12px;
                    font-weight: 600;
                    cursor: pointer;
                    transition: opacity 100ms ease;
                }
                .ocote-confirm-ok:hover { opacity: 0.85; }
                .ocote-confirm-ok.danger  { background: var(--syntax-red, #E8635A); color: #fff; }
                .ocote-confirm-ok.primary { background: var(--accent); color: #1a1816; }
            `;
            document.head.appendChild(style);
        }

        // ── Mensaje ────────────────────────────────────────────────────────
        const msg = document.createElement('p');
        msg.style.cssText = `
            margin: 0 0 20px;
            font-size: 13px;
            line-height: 1.65;
            color: var(--text-secondary);
            white-space: pre-wrap;
        `;
        msg.textContent = message;

        // ── Fila de botones ────────────────────────────────────────────────
        const btnRow = document.createElement('div');
        btnRow.style.cssText = `
            display: flex;
            justify-content: flex-end;
            gap: 8px;
            padding-top: 4px;
            border-top: 1px solid var(--border);
            margin-top: 4px;
        `;

        const btnCancel = document.createElement('button');
        btnCancel.textContent = 'Cancelar';
        btnCancel.className = 'ocote-confirm-cancel';

        const btnOk = document.createElement('button');
        btnOk.textContent = confirmLabel;
        btnOk.className = `ocote-confirm-ok ${danger ? 'danger' : 'primary'}`;

        const finish = (result) => {
            document.removeEventListener('keydown', onKey);
            overlay.remove();
            resolve(result);
        };

        const onKey = (e) => {
            if (e.key === 'Escape') { e.stopPropagation(); finish(false); }
            if (e.key === 'Enter')  { e.stopPropagation(); finish(true);  }
        };

        btnCancel.addEventListener('click', () => finish(false));
        btnOk.addEventListener('click',     () => finish(true));
        document.addEventListener('keydown', onKey);

        btnRow.appendChild(btnCancel);
        btnRow.appendChild(btnOk);
        box.appendChild(msg);
        box.appendChild(btnRow);
        overlay.appendChild(box);
        document.body.appendChild(overlay);

        // Foco en Cancelar — más seguro para operaciones destructivas
        btnCancel.focus();
    });
}

// ── Menú contextual ───────────────────────────────────────────────────────

// Iconos SVG Tabler (outline, stroke-width 1.5) — consistentes con el resto de la UI
const CTX_ICONS = {
    preview:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M10 12a2 2 0 1 0 4 0a2 2 0 0 0-4 0"/><path d="M21 12c-2.4 4-5.4 6-9 6c-3.6 0-6.6-2-9-6c2.4-4 5.4-6 9-6c3.6 0 6.6 2 9 6"/></svg>`,
    copyPath:  `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></svg>`,
    rename:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10.5-10.5a2.828 2.828 0 1 0-4-4L4 16v4"/><path d="M13.5 6.5l4 4"/></svg>`,
    delete:    `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16"/><path d="M10 11v6"/><path d="M14 11v6"/><path d="M5 7l1 12a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2l1-12"/><path d="M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3"/></svg>`,
    newFile:   `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M12 11v6"/><path d="M9 14h6"/></svg>`,
    newFolder: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19H5a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v3"/><path d="M16 19h6"/><path d="M19 16v6"/></svg>`,
};

// Helpers para construir los items del menú
function ctxItem(action, icon, label, extraClass = '') {
    return `<button class="ctx-item ${extraClass}" data-action="${action}">
                <span class="ctx-icon">${icon}</span>
                <span>${label}</span>
            </button>`;
}
function ctxLabel(text) {
    return `<div class="ctx-group-label">${text}</div>`;
}

function handleContextMenu(e) {
    e.preventDefault();
    e.stopPropagation();   // no burbujear al contextmenu del panel vacío
    const item = e.currentTarget;
    const path = item.getAttribute('data-path');
    const name = item.getAttribute('data-name');
    const isDir = item.getAttribute('data-is-dir') === 'true';
    showContextMenu(e.clientX, e.clientY, { path, name, isDir, target: item });
}

function handlePanelContextMenu(e) {
    e.preventDefault();
    showContextMenu(e.clientX, e.clientY, { path: null, name: null, isDir: false, target: null });
}

let _contextMenuEl = null;
let _contextTarget = null;

function showContextMenu(x, y, target) {
    closeContextMenu();
    _contextTarget = target;

    const menu = document.createElement('div');
    menu.id = 'explorer-context-menu';
    menu.style.left = x + 'px';
    menu.style.top = y + 'px';

    // Ajustar si se sale de la ventana
    requestAnimationFrame(() => {
        const rect = menu.getBoundingClientRect();
        if (rect.right > window.innerWidth) {
            menu.style.left = (window.innerWidth - rect.width - 8) + 'px';
        }
        if (rect.bottom > window.innerHeight) {
            menu.style.top = (window.innerHeight - rect.height - 8) + 'px';
        }
    });

    let html = '';

    if (target.path && !target.isDir) {
        // Archivo: Vista previa + Copiar ruta
        html += ctxItem('preview',   CTX_ICONS.preview,   'Vista previa');
        html += ctxItem('copy-path', CTX_ICONS.copyPath,  'Copiar ruta');
        html += '<div class="ctx-separator"></div>';
    } else if (target.path && target.isDir) {
        // Carpeta: solo Copiar ruta
        html += ctxItem('copy-path', CTX_ICONS.copyPath, 'Copiar ruta');
        html += '<div class="ctx-separator"></div>';
    }

    if (target.path) {
        // Acciones de item: Renombrar + Eliminar
        html += ctxItem('rename', CTX_ICONS.rename, 'Renombrar');
        html += ctxItem('delete', CTX_ICONS.delete, 'Eliminar', 'ctx-danger');
        html += '<div class="ctx-separator"></div>';
        html += ctxLabel('Crear');
    }

    // Crear siempre disponible (con o sin item seleccionado)
    html += ctxItem('new-file',   CTX_ICONS.newFile,   'Nuevo archivo');
    html += ctxItem('new-folder', CTX_ICONS.newFolder, 'Nueva carpeta');

    menu.innerHTML = html;
    document.body.appendChild(menu);
    _contextMenuEl = menu;

    // Click en items
    menu.querySelectorAll('.ctx-item').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const action = btn.dataset.action;
            closeContextMenu();
            handleContextAction(action);
        });
    });
}

function closeContextMenu() {
    if (_contextMenuEl) {
        _contextMenuEl.remove();
        _contextMenuEl = null;
    }
}

async function handleContextAction(action) {
    const target = _contextTarget;
    _contextTarget = null;

    switch (action) {
        case 'preview':
            if (target.path && window.openPreview) {
                window.openPreview(target.path, target.name);
            }
            break;

        case 'copy-path':
            try {
                await navigator.clipboard.writeText(target.path);
            } catch {
                // Fallback: seleccionar texto temporal
                const ta = document.createElement('textarea');
                ta.value = target.path;
                document.body.appendChild(ta);
                ta.select();
                document.execCommand('copy');
                ta.remove();
            }
            break;

        case 'rename':
            if (target.target) {
                inlineRename(target.target, target.path, target.name);
            }
            break;

        case 'delete':
            if (target.isDir) {
                // Contar hijos para mostrar una confirmación informativa.
                // Si el conteo falla (permisos, etc.) seguimos con 0.
                let count = 0;
                try {
                    count = await window.__TAURI__.invoke('count_dir_entries', { path: target.path });
                } catch (_) { /* silencioso */ }

                // Mensaje diferente según si la carpeta tiene contenido o no
                const dirMsg = count === 0
                    ? `¿Eliminar la carpeta "${target.name}"?`
                    : `La carpeta "${target.name}" contiene ${count} elemento${count !== 1 ? 's' : ''}.\n\n⚠️ Todo se eliminará permanentemente. ¿Continuar?`;

                if (await ocoteConfirm(dirMsg)) {
                    try {
                        await window.__TAURI__.invoke('delete_item_recursive', { path: target.path });
                        refreshDirectory(currentPath);
                    } catch (err) {
                        console.error('[Explorer] Error al eliminar carpeta:', err);
                        alert('Error al eliminar: ' + err);
                    }
                }
            } else {
                // Archivo: confirmación simple
                if (await ocoteConfirm(`¿Eliminar "${target.name}"?`)) {
                    try {
                        await window.__TAURI__.invoke('delete_item', { path: target.path });
                        refreshDirectory(currentPath);
                    } catch (err) {
                        console.error('[Explorer] Error al eliminar archivo:', err);
                        alert('Error al eliminar: ' + err);
                    }
                }
            }
            break;

        case 'new-file':
            inlineCreate('file', currentPath);
            break;

        case 'new-folder':
            inlineCreate('directory', currentPath);
            break;
    }
}

// ── Renombrar inline ─────────────────────────────────────────────────────

function inlineRename(item, oldPath, oldName) {
    const nameSpan = item.querySelector('.explorer-name');
    if (!nameSpan) return;

    const origText = nameSpan.textContent;
    const input = document.createElement('input');
    input.type = 'text';
    input.value = oldName;
    input.className = 'explorer-rename-input';
    input.style.cssText = `
        background: var(--bg-input); border: 1px solid var(--accent);
        color: var(--text-primary); font-family: var(--font-mono);
        font-size: 13px; padding: 1px 4px; border-radius: 4px;
        width: 100%; outline: none;
    `;

    nameSpan.textContent = '';
    nameSpan.appendChild(input);
    input.focus();
    input.select();

    const finish = async (save) => {
        const newName = input.value.trim();
        if (save && newName && newName !== oldName) {
            const parent = oldPath.substring(0, oldPath.lastIndexOf('/'));
            const newPath = parent + '/' + newName;
            try {
                await window.__TAURI__.invoke('rename_item', { oldPath, newPath });
                await refreshDirectory(currentPath);
            } catch (err) {
                console.error('[Explorer] Error al renombrar:', err);
                nameSpan.textContent = origText;
                return;
            }
        } else {
            nameSpan.textContent = origText;
        }
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
}

// ── Crear archivo/carpeta inline ──────────────────────────────────────────

let _createInput = null;

function inlineCreate(type, basePath) {
    // Quitar input existente si lo hay
    if (_createInput) { _createInput.remove(); _createInput = null; }

    const wrapper = document.createElement('div');
    wrapper.className = 'explorer-item explorer-create-item';
    wrapper.style.cssText = 'padding:4px 12px 4px 8px; display:flex; align-items:center; gap:8px;';

    const icon = document.createElement('span');
    icon.className = 'explorer-icon';
    icon.textContent = type === 'file' ? '📄' : '📁';
    wrapper.appendChild(icon);

    const input = document.createElement('input');
    input.type = 'text';
    input.placeholder = type === 'file' ? 'nombre.ext' : 'nombre-carpeta';
    input.style.cssText = `
        background: var(--bg-input); border: 1px solid var(--accent);
        color: var(--text-primary); font-family: var(--font-mono);
        font-size: 13px; padding: 1px 4px; border-radius: 4px;
        flex: 1; outline: none;
    `;

    wrapper.appendChild(input);
    panel.appendChild(wrapper);
    _createInput = wrapper;
    input.focus();

    const finish = async (save) => {
        _createInput = null;
        const name = input.value.trim();
        wrapper.remove();
        if (save && name) {
            const newPath = basePath + (basePath.endsWith('/') ? '' : '/') + name;
            try {
                if (type === 'file') {
                    await window.__TAURI__.invoke('create_file', { path: newPath });
                } else {
                    await window.__TAURI__.invoke('create_directory', { path: newPath });
                }
                await refreshDirectory(currentPath);
            } catch (err) {
                console.error('[Explorer] Error al crear:', err);
                alert('Error: ' + err);
            }
        }
    };

    input.addEventListener('blur', () => finish(true));
    input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); input.blur(); }
        if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    });
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

// ── Sistema de íconos dinámicos v2 ──────────────────────────────────────
//
// Dos temas seleccionables (guardado en localStorage('ocote_icon_theme')):
//
//   "seti"  — íconos SVG con forma de documento, coloreados por tipo (default)
//   "badge" — badges de texto compactos con color de fondo
//
// Jerarquía de resolución (igual para ambos temas):
//   1. Nombre completo especial  (package.json, Cargo.toml, .env…)
//   2. Doble extensión           (.d.ts, .tar.gz…)
//   3. Extensión simple          (.js, .rs, .py…)
//   4. Dotfiles sin extensión    (.gitconfig → config genérico)
//   5. Fallback genérico

function getIconTheme() {
    return localStorage.getItem('ocote_icon_theme') || 'seti';
}

// ── Tema "seti": SVG document icons ────────────────────────────────────
//
// Cada ícono es un SVG 16×16 con forma de documento (rectángulo + esquina
// doblada). El color de relleno identifica la tecnología.
// fold = color más oscuro para la esquina doblada (da profundidad).

// ── SVGs legacy (fallback si icons.js no cargó) ────────────────────────

function svgFileLegacy(fill, fold) {
    return `<svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M2.5 1H9.5L13.5 5V15H2.5V1Z" fill="${fill}"/>
        <path d="M9.5 1V5H13.5" fill="${fold}" opacity="0.7"/>
    </svg>`;
}

function svgFolderLegacy(color) {
    const tab  = shiftColor(color, 15);
    const body = shiftColor(color, -10);
    return `<svg class="icon-svg" viewBox="0 0 16 16" xmlns="http://www.w3.org/2000/svg">
        <path d="M1 5H6.5L8 3H15V5Z" fill="${tab}"/>
        <path d="M1 5H15V14H1Z" fill="${body}"/>
    </svg>`;
}

// Ajusta el brillo de un color hex (delta positivo = más claro, negativo = más oscuro)
function shiftColor(hex, delta) {
    hex = hex.replace('#', '');
    if (hex.length === 3) hex = hex.split('').map(c => c+c).join('');
    const r = Math.min(255, Math.max(0, parseInt(hex.slice(0,2),16) + delta));
    const g = Math.min(255, Math.max(0, parseInt(hex.slice(2,4),16) + delta));
    const b = Math.min(255, Math.max(0, parseInt(hex.slice(4,6),16) + delta));
    return '#' + [r,g,b].map(v => v.toString(16).padStart(2,'0')).join('');
}

// ── Mapa de colores: extensión → [fill, fold] ───────────────────────────
// Mismo color que usábamos en badges, ahora aplicado a la forma SVG.
const FILE_COLORS = {
    // JavaScript
    js:       ['#f1e05a','#c5b400'], mjs: ['#f1e05a','#c5b400'], cjs: ['#f1e05a','#c5b400'],
    jsx:      ['#61dafb','#2ab5d9'],
    // TypeScript
    ts:       ['#3178c6','#1855a0'], tsx: ['#3178c6','#1855a0'],
    // Rust
    rs:       ['#ce412b','#a82a18'],
    // Python
    py:       ['#4584b6','#2d6898'], pyw: ['#4584b6','#2d6898'], ipynb: ['#4584b6','#2d6898'],
    // Go
    go:       ['#00add8','#0087aa'],
    // Web
    html:     ['#e34c26','#c03d1c'], htm: ['#e34c26','#c03d1c'],
    css:      ['#563d7c','#3d285c'], scss: ['#bf4080','#9a2f66'], sass: ['#bf4080','#9a2f66'],
    less:     ['#2a4f85','#1a3866'], styl: ['#ff6347','#d84422'],
    // UI frameworks
    vue:      ['#41b883','#2d9467'], svelte: ['#ff3e00','#cc3200'],
    // Data / config
    json:     ['#cbcb41','#a0a030'], jsonc: ['#cbcb41','#a0a030'],
    yaml:     ['#cb171e','#a01218'], yml: ['#cb171e','#a01218'],
    toml:     ['#9c4221','#7a3318'], xml: ['#e37933','#c06020'],
    csv:      ['#237346','#185530'], sql: ['#e97b00','#c06400'],
    graphql:  ['#e535ab','#b82889'], gql: ['#e535ab','#b82889'],
    // Docs
    md:       ['#4a6fa5','#2e5080'], mdx: ['#4a6fa5','#2e5080'],
    txt:      ['#7a8a94','#5a6a74'], rst: ['#7a8a94','#5a6a74'],
    // Shell
    sh:       ['#4eaa25','#388018'], bash: ['#4eaa25','#388018'],
    zsh:      ['#4eaa25','#388018'], fish: ['#4eaa25','#388018'],
    ps1:      ['#5391fe','#3570cc'],
    // C / C++
    c:        ['#555a64','#404550'], h: ['#a074c4','#8058a8'],
    cpp:      ['#f34b7d','#c8305c'], cc: ['#f34b7d','#c8305c'], hpp: ['#f34b7d','#c8305c'],
    // Java / JVM
    java:     ['#b07219','#886010'], jar: ['#b07219','#886010'],
    kt:       ['#a97bff','#8055d8'], scala: ['#dc322f','#b02520'], groovy: ['#6298b3','#4a7892'],
    // C# / .NET
    cs:       ['#239120','#186018'],
    // Ruby
    rb:       ['#701516','#500f10'],
    // PHP
    php:      ['#777bb4','#5558a0'],
    // Swift / Dart / otros
    swift:    ['#fa7343','#d85a2a'], dart: ['#00b4ab','#009088'],
    lua:      ['#2c2db0','#1c1d90'], r: ['#198ce7','#1070c0'],
    ex:       ['#6e4a7e','#4e3060'], exs: ['#6e4a7e','#4e3060'],
    hs:       ['#5e5086','#3e3466'], zig: ['#ec915c','#c87040'],
    nim:      ['#ffe953','#c8b800'],
    // Imágenes
    png:      ['#7e57c2','#5a3aa8'], jpg: ['#7e57c2','#5a3aa8'], jpeg: ['#7e57c2','#5a3aa8'],
    gif:      ['#7e57c2','#5a3aa8'], webp: ['#7e57c2','#5a3aa8'], avif: ['#7e57c2','#5a3aa8'],
    svg:      ['#ffb13b','#d89020'], ico: ['#7e57c2','#5a3aa8'], bmp: ['#7e57c2','#5a3aa8'],
    // Fuentes
    ttf:      ['#e91e63','#c01050'], otf: ['#e91e63','#c01050'],
    woff:     ['#e91e63','#c01050'], woff2: ['#e91e63','#c01050'],
    // Media
    mp3:      ['#e91e63','#c01050'], wav: ['#e91e63','#c01050'], ogg: ['#e91e63','#c01050'],
    mp4:      ['#e53935','#c02820'], mov: ['#e53935','#c02820'],
    avi:      ['#e53935','#c02820'], mkv: ['#e53935','#c02820'], webm: ['#e53935','#c02820'],
    // Comprimidos
    zip:      ['#f5a623','#d08010'], tar: ['#f5a623','#d08010'], gz: ['#f5a623','#d08010'],
    bz2:      ['#f5a623','#d08010'], xz: ['#f5a623','#d08010'],
    rar:      ['#f5a623','#d08010'], '7z': ['#f5a623','#d08010'],
    dmg:      ['#9e9e9e','#7a7a7a'], deb: ['#d70a53','#a80840'], rpm: ['#ee0000','#cc0000'],
    appimage: ['#52b038','#388028'],
    // Documentos
    pdf:      ['#e53935','#c02820'],
    doc:      ['#2b579a','#1a3870'], docx: ['#2b579a','#1a3870'],
    xls:      ['#217346','#175530'], xlsx: ['#217346','#175530'],
    ppt:      ['#d24726','#a83518'], pptx: ['#d24726','#a83518'],
    // Env / logs / config
    env:      ['#eaed00','#b8bc00'], lock: ['#607d8b','#405560'], log: ['#546e7a','#384e56'],
    // Binarios
    exe:      ['#4caf50','#2e8030'], bin: ['#607d8b','#405560'],
    so:       ['#607d8b','#405560'], dylib: ['#607d8b','#405560'], dll: ['#607d8b','#405560'],
    // DevOps / infra
    proto:    ['#5c6bc0','#3c50a0'], wasm: ['#654ff0','#4830d0'],
    tf:       ['#7b42bc','#5a2898'], hcl: ['#7b42bc','#5a2898'],
};

// Archivos especiales por nombre completo (prioridad sobre extensión)
const SPECIAL_FILE_COLORS = {
    'dockerfile':           ['#2496ed','#1070c0'],
    'docker-compose.yml':   ['#2496ed','#1070c0'],
    'docker-compose.yaml':  ['#2496ed','#1070c0'],
    'makefile':             ['#6d8086','#4a5a60'],
    'gnumakefile':          ['#6d8086','#4a5a60'],
    'cmakelists.txt':       ['#064f8c','#043a6a'],
    'cargo.toml':           ['#ce412b','#a82a18'],
    'cargo.lock':           ['#9c4221','#7a3318'],
    'package.json':         ['#cc3534','#a02020'],
    'package-lock.json':    ['#8b2222','#6a1515'],
    'yarn.lock':            ['#2c8ebb','#1c6890'],
    'pnpm-lock.yaml':       ['#f69220','#d07510'],
    'tsconfig.json':        ['#3178c6','#1855a0'],
    'jsconfig.json':        ['#f1e05a','#c5b400'],
    'webpack.config.js':    ['#8dd6f9','#5aaccc'],
    'vite.config.js':       ['#bd34fe','#9010d8'],
    'vite.config.ts':       ['#bd34fe','#9010d8'],
    'next.config.js':       ['#444444','#222222'],
    'nuxt.config.js':       ['#00dc82','#00a862'],
    '.gitignore':           ['#f05032','#c83820'],
    '.gitattributes':       ['#f05032','#c83820'],
    '.editorconfig':        ['#fff2c6','#c8c090'],
    '.prettierrc':          ['#f7b93e','#d09010'],
    '.prettierrc.json':     ['#f7b93e','#d09010'],
    '.eslintrc':            ['#4b32c3','#3020a0'],
    '.eslintrc.js':         ['#4b32c3','#3020a0'],
    '.eslintrc.json':       ['#4b32c3','#3020a0'],
    '.env':                 ['#eaed00','#b8bc00'],
    '.env.local':           ['#eaed00','#b8bc00'],
    '.env.example':         ['#eaed00','#b8bc00'],
    '.env.production':      ['#eaed00','#b8bc00'],
    'readme.md':            ['#4a6fa5','#2e5080'],
    'changelog.md':         ['#4a6fa5','#2e5080'],
    'license':              ['#5c8a5e','#3a6040'],
    'licence':              ['#5c8a5e','#3a6040'],
    '.bashrc':              ['#4eaa25','#388018'],
    '.zshrc':               ['#4eaa25','#388018'],
    '.bash_profile':        ['#4eaa25','#388018'],
    '.profile':             ['#4eaa25','#388018'],
    'gemfile':              ['#701516','#500f10'],
    'rakefile':             ['#701516','#500f10'],
    'requirements.txt':     ['#4584b6','#2d6898'],
    'pyproject.toml':       ['#4584b6','#2d6898'],
    'go.mod':               ['#00add8','#0087aa'],
    'go.sum':               ['#00add8','#0087aa'],
    'build.gradle':         ['#02303a','#011820'],
    'pom.xml':              ['#c71a36','#a01028'],
    'tauri.conf.json':      ['#ffc131','#d09810'],
    'procfile':             ['#79589f','#5a3878'],
};

// ── Tema "badge": datos de badges de texto ──────────────────────────────
// Usamos los mismos colores de FILE_COLORS pero mostramos una etiqueta corta
const BADGE_LABELS = {
    js:'JS', mjs:'MJS', cjs:'CJS', jsx:'JSX',
    ts:'TS', tsx:'TSX',
    rs:'RS', py:'PY', pyw:'PY', ipynb:'NB', go:'GO',
    html:'HTM', htm:'HTM', css:'CSS', scss:'CSS', sass:'CSS', less:'CSS', styl:'STL',
    vue:'VUE', svelte:'SVL',
    json:'JSON', jsonc:'JSON', yaml:'YML', yml:'YML', toml:'TOML', xml:'XML',
    csv:'CSV', sql:'SQL', graphql:'GQL', gql:'GQL',
    md:'MD', mdx:'MDX', txt:'TXT', rst:'RST',
    sh:'SH', bash:'SH', zsh:'ZSH', fish:'FSH', ps1:'PS',
    c:'C', h:'H', cpp:'C++', cc:'C++', hpp:'HPP',
    java:'JV', jar:'JAR', kt:'KT', scala:'SC', groovy:'GRV',
    cs:'C#', rb:'RB', php:'PHP', swift:'SWT', dart:'DRT',
    lua:'LUA', r:'R', ex:'EX', exs:'EX', hs:'HS', zig:'ZIG',
    png:'▪', jpg:'▪', jpeg:'▪', gif:'▪', webp:'▪', svg:'SVG', ico:'ICO',
    ttf:'TTF', otf:'OTF', woff:'WOF', woff2:'WOF',
    mp3:'♪', wav:'♪', mp4:'▶', mov:'▶', mkv:'▶',
    zip:'ZIP', tar:'TAR', gz:'GZ', bz2:'BZ2', xz:'XZ', rar:'RAR', '7z':'7Z',
    dmg:'DMG', deb:'DEB', appimage:'APP',
    pdf:'PDF', doc:'DOC', docx:'DOC', xls:'XLS', xlsx:'XLS', ppt:'PPT', pptx:'PPT',
    env:'ENV', lock:'LCK', log:'LOG',
    exe:'EXE', bin:'BIN', wasm:'WSM', proto:'PB', tf:'TF', hcl:'HCL',
};
// Etiquetas de badges para archivos especiales
const SPECIAL_BADGE_LABELS = {
    'dockerfile':'DCK', 'docker-compose.yml':'DCK', 'docker-compose.yaml':'DCK',
    'makefile':'MK', 'cmakelists.txt':'MK',
    'cargo.toml':'RS', 'cargo.lock':'LCK',
    'package.json':'PKG', 'package-lock.json':'LCK',
    'yarn.lock':'LCK', 'pnpm-lock.yaml':'LCK',
    'tsconfig.json':'TS', 'jsconfig.json':'JS',
    'vite.config.js':'VTE', 'vite.config.ts':'VTE',
    '.gitignore':'GIT', '.gitattributes':'GIT',
    '.editorconfig':'CFG', '.prettierrc':'PRT', '.prettierrc.json':'PRT',
    '.eslintrc':'ESL', '.eslintrc.js':'ESL', '.eslintrc.json':'ESL',
    '.env':'ENV', '.env.local':'ENV', '.env.example':'ENV', '.env.production':'ENV',
    'readme.md':'MD', 'changelog.md':'LOG', 'license':'LIC', 'licence':'LIC',
    '.bashrc':'SH', '.zshrc':'ZSH', '.bash_profile':'SH',
    'requirements.txt':'PY', 'pyproject.toml':'PY',
    'go.mod':'GO', 'go.sum':'GO',
    'cargo.toml':'RS', 'tauri.conf.json':'TAU',
};

// ── Colores de carpetas ─────────────────────────────────────────────────
// Colores de carpetas especiales por nombre
const FOLDER_COLORS = {
    'src': '#4fc3f7', 'lib': '#4fc3f7', 'app': '#4fc3f7', 'source': '#4fc3f7',
    'components': '#4fc3f7', 'pages': '#4fc3f7', 'views': '#4fc3f7',
    'dist': '#78909c', 'build': '#78909c', 'target': '#78909c',
    'out': '#78909c', 'output': '#78909c', 'release': '#78909c',
    'node_modules': '#ab47bc', 'vendor': '#ab47bc', 'packages': '#ab47bc',
    'test': '#66bb6a', 'tests': '#66bb6a', '__tests__': '#66bb6a',
    'spec': '#66bb6a', 'e2e': '#66bb6a', 'cypress': '#66bb6a',
    'docs': '#29b6f6', 'documentation': '#29b6f6', 'wiki': '#29b6f6',
    'assets': '#f48fb1', 'public': '#f48fb1', 'static': '#f48fb1',
    'images': '#f48fb1', 'img': '#f48fb1', 'media': '#f48fb1', 'icons': '#f48fb1',
    'styles': '#bf4080', 'css': '#bf4080', 'scss': '#bf4080',
    'config': '#a5d6a7', 'configs': '#a5d6a7', '.config': '#a5d6a7',
    'scripts': '#ffa726', 'bin': '#ffa726', 'tools': '#ffa726',
    '.git': '#f4511e', '.github': '#e0e0e0', '.husky': '#e0e0e0',
    'api': '#ff7043', 'routes': '#ff7043', 'controllers': '#ff7043',
    'models': '#80cbc4', 'schemas': '#80cbc4', 'types': '#80cbc4',
    'hooks': '#ce93d8', 'utils': '#ffe082', 'helpers': '#ffe082',
    'migrations': '#a1887f', 'seeds': '#a1887f',
};

// (FILE_ICONS y SPECIAL_FILES eliminados en v2 — reemplazados por FILE_COLORS/SPECIAL_FILE_COLORS)
const FILE_ICONS_LEGACY = {
    // JavaScript
    'js':     { label: 'JS',   bg: '#f7df1e', fg: '#000' },
    'mjs':    { label: 'MJS',  bg: '#f7df1e', fg: '#000' },
    'cjs':    { label: 'CJS',  bg: '#f7df1e', fg: '#000' },
    'jsx':    { label: 'JSX',  bg: '#61dafb', fg: '#000' },
    // TypeScript
    'ts':     { label: 'TS',   bg: '#3178c6' },
    'tsx':    { label: 'TSX',  bg: '#3178c6' },
    // Rust
    'rs':     { label: 'RS',   bg: '#ce412b' },
    // Python
    'py':     { label: 'PY',   bg: '#3572a5' },
    'pyw':    { label: 'PY',   bg: '#3572a5' },
    'ipynb':  { label: 'NB',   bg: '#3572a5' },
    // Go
    'go':     { label: 'GO',   bg: '#00add8' },
    // Web
    'html':   { label: 'HTM',  bg: '#e34c26' },
    'htm':    { label: 'HTM',  bg: '#e34c26' },
    'css':    { label: 'CSS',  bg: '#563d7c' },
    'scss':   { label: 'CSS',  bg: '#bf4080' },
    'sass':   { label: 'CSS',  bg: '#bf4080' },
    'less':   { label: 'CSS',  bg: '#1d365d' },
    'styl':   { label: 'STL',  bg: '#ff6347' },
    // Frameworks UI
    'vue':    { label: 'VUE',  bg: '#41b883' },
    'svelte': { label: 'SVL',  bg: '#ff3e00' },
    // Datos / Config
    'json':   { label: 'JSON', bg: '#cbcb41', fg: '#000' },
    'jsonc':  { label: 'JSON', bg: '#cbcb41', fg: '#000' },
    'yaml':   { label: 'YML',  bg: '#cb171e' },
    'yml':    { label: 'YML',  bg: '#cb171e' },
    'toml':   { label: 'TOML', bg: '#9c4221' },
    'xml':    { label: 'XML',  bg: '#e37933' },
    'csv':    { label: 'CSV',  bg: '#237346' },
    'sql':    { label: 'SQL',  bg: '#e97b00' },
    'graphql':{ label: 'GQL',  bg: '#e535ab' },
    'gql':    { label: 'GQL',  bg: '#e535ab' },
    // Docs
    'md':     { label: 'MD',   bg: '#083fa1' },
    'mdx':    { label: 'MDX',  bg: '#083fa1' },
    'txt':    { label: 'TXT',  bg: '#78909c' },
    'rst':    { label: 'RST',  bg: '#78909c' },
    // Shell
    'sh':     { label: 'SH',   bg: '#4eaa25' },
    'bash':   { label: 'SH',   bg: '#4eaa25' },
    'zsh':    { label: 'ZSH',  bg: '#4eaa25' },
    'fish':   { label: 'FSH',  bg: '#4eaa25' },
    'ps1':    { label: 'PS',   bg: '#5391fe' },
    // C / C++
    'c':      { label: 'C',    bg: '#555555' },
    'h':      { label: 'H',    bg: '#555555' },
    'cpp':    { label: 'C++',  bg: '#f34b7d' },
    'cc':     { label: 'C++',  bg: '#f34b7d' },
    'hpp':    { label: 'HPP',  bg: '#f34b7d' },
    // Java / JVM
    'java':   { label: 'JV',   bg: '#b07219' },
    'class':  { label: 'CLS',  bg: '#b07219' },
    'jar':    { label: 'JAR',  bg: '#b07219' },
    'kt':     { label: 'KT',   bg: '#a97bff' },
    'scala':  { label: 'SC',   bg: '#dc322f' },
    'groovy': { label: 'GRV',  bg: '#6298b3' },
    // C# / .NET
    'cs':     { label: 'C#',   bg: '#239120' },
    'csproj': { label: 'CSP',  bg: '#239120' },
    // Ruby
    'rb':     { label: 'RB',   bg: '#701516' },
    // PHP
    'php':    { label: 'PHP',  bg: '#777bb4' },
    // Swift / Dart / Kotlin
    'swift':  { label: 'SWT',  bg: '#fa7343' },
    'dart':   { label: 'DRT',  bg: '#00b4ab' },
    // Otros lenguajes
    'lua':    { label: 'LUA',  bg: '#000080' },
    'r':      { label: 'R',    bg: '#198ce7' },
    'ex':     { label: 'EX',   bg: '#6e4a7e' },
    'exs':    { label: 'EX',   bg: '#6e4a7e' },
    'hs':     { label: 'HS',   bg: '#5e5086' },
    'clj':    { label: 'CLJ',  bg: '#5881d8' },
    'nim':    { label: 'NIM',  bg: '#ffe953', fg: '#000' },
    'zig':    { label: 'ZIG',  bg: '#ec915c' },
    // Imágenes
    'png':    { label: '▪',    bg: '#7e57c2' },
    'jpg':    { label: '▪',    bg: '#7e57c2' },
    'jpeg':   { label: '▪',    bg: '#7e57c2' },
    'gif':    { label: '▪',    bg: '#7e57c2' },
    'webp':   { label: '▪',    bg: '#7e57c2' },
    'avif':   { label: '▪',    bg: '#7e57c2' },
    'svg':    { label: 'SVG',  bg: '#ffb13b', fg: '#000' },
    'ico':    { label: 'ICO',  bg: '#7e57c2' },
    'bmp':    { label: '▪',    bg: '#7e57c2' },
    // Fuentes
    'ttf':    { label: 'TTF',  bg: '#e91e63' },
    'otf':    { label: 'OTF',  bg: '#e91e63' },
    'woff':   { label: 'WOF',  bg: '#e91e63' },
    'woff2':  { label: 'WOF',  bg: '#e91e63' },
    // Media
    'mp3':    { label: '♪',    bg: '#e91e63' },
    'wav':    { label: '♪',    bg: '#e91e63' },
    'ogg':    { label: '♪',    bg: '#e91e63' },
    'mp4':    { label: '▶',    bg: '#e53935' },
    'mov':    { label: '▶',    bg: '#e53935' },
    'avi':    { label: '▶',    bg: '#e53935' },
    'mkv':    { label: '▶',    bg: '#e53935' },
    'webm':   { label: '▶',    bg: '#e53935' },
    // Comprimidos
    'zip':    { label: 'ZIP',  bg: '#f5a623' },
    'tar':    { label: 'TAR',  bg: '#f5a623' },
    'gz':     { label: 'GZ',   bg: '#f5a623' },
    'bz2':    { label: 'BZ2',  bg: '#f5a623' },
    'xz':     { label: 'XZ',   bg: '#f5a623' },
    'rar':    { label: 'RAR',  bg: '#f5a623' },
    '7z':     { label: '7Z',   bg: '#f5a623' },
    'dmg':    { label: 'DMG',  bg: '#999999' },
    'pkg':    { label: 'PKG',  bg: '#999999' },
    'deb':    { label: 'DEB',  bg: '#d70a53' },
    'rpm':    { label: 'RPM',  bg: '#ee0000' },
    'appimage':{ label: 'APP', bg: '#52b038' },
    // Documentos de oficina
    'pdf':    { label: 'PDF',  bg: '#e53935' },
    'doc':    { label: 'DOC',  bg: '#2b579a' },
    'docx':   { label: 'DOC',  bg: '#2b579a' },
    'xls':    { label: 'XLS',  bg: '#217346' },
    'xlsx':   { label: 'XLS',  bg: '#217346' },
    'ppt':    { label: 'PPT',  bg: '#d24726' },
    'pptx':   { label: 'PPT',  bg: '#d24726' },
    // Env / logs / locks
    'env':    { label: 'ENV',  bg: '#eaed00', fg: '#000' },
    'lock':   { label: 'LCK',  bg: '#607d8b' },
    'log':    { label: 'LOG',  bg: '#546e7a' },
    // Binarios / ejecutables
    'exe':    { label: 'EXE',  bg: '#4caf50' },
    'bin':    { label: 'BIN',  bg: '#607d8b' },
    'so':     { label: 'SO',   bg: '#607d8b' },
    'dylib':  { label: 'LIB',  bg: '#607d8b' },
    'dll':    { label: 'DLL',  bg: '#607d8b' },
    // Otros
    'proto':  { label: 'PB',   bg: '#5c6bc0' },
    'wasm':   { label: 'WSM',  bg: '#654ff0' },
    'tf':     { label: 'TF',   bg: '#7b42bc' },
    'hcl':    { label: 'HCL',  bg: '#7b42bc' },
};

// (SPECIAL_FILES eliminado en v2 — reemplazado por SPECIAL_FILE_COLORS)
const SPECIAL_FILES_LEGACY = {
    'dockerfile':          { label: 'DCK',  bg: '#2496ed' },
    'docker-compose.yml':  { label: 'DCK',  bg: '#2496ed' },
    'docker-compose.yaml': { label: 'DCK',  bg: '#2496ed' },
    'makefile':            { label: 'MK',   bg: '#6d8086' },
    'gnumakefile':         { label: 'MK',   bg: '#6d8086' },
    'cmakelists.txt':      { label: 'MK',   bg: '#064f8c' },
    'cargo.toml':          { label: 'RS',   bg: '#ce412b' },
    'cargo.lock':          { label: 'LCK',  bg: '#ce412b' },
    'package.json':        { label: 'PKG',  bg: '#cc3534' },
    'package-lock.json':   { label: 'LCK',  bg: '#cc3534' },
    'yarn.lock':           { label: 'LCK',  bg: '#2c8ebb' },
    'pnpm-lock.yaml':      { label: 'LCK',  bg: '#f69220' },
    'tsconfig.json':       { label: 'TS',   bg: '#3178c6' },
    'jsconfig.json':       { label: 'JS',   bg: '#f7df1e', fg: '#000' },
    'webpack.config.js':   { label: 'WPK',  bg: '#8dd6f9', fg: '#000' },
    'vite.config.js':      { label: 'VTE',  bg: '#bd34fe' },
    'vite.config.ts':      { label: 'VTE',  bg: '#bd34fe' },
    'next.config.js':      { label: 'NXT',  bg: '#000000' },
    'nuxt.config.js':      { label: 'NXT',  bg: '#00dc82', fg: '#000' },
    '.gitignore':          { label: 'GIT',  bg: '#f05032' },
    '.gitattributes':      { label: 'GIT',  bg: '#f05032' },
    '.editorconfig':       { label: 'CFG',  bg: '#fff2c6', fg: '#000' },
    '.prettierrc':         { label: 'PRT',  bg: '#f7b93e', fg: '#000' },
    '.prettierrc.json':    { label: 'PRT',  bg: '#f7b93e', fg: '#000' },
    '.eslintrc':           { label: 'ESL',  bg: '#4b32c3' },
    '.eslintrc.js':        { label: 'ESL',  bg: '#4b32c3' },
    '.eslintrc.json':      { label: 'ESL',  bg: '#4b32c3' },
    '.env':                { label: 'ENV',  bg: '#eaed00', fg: '#000' },
    '.env.local':          { label: 'ENV',  bg: '#eaed00', fg: '#000' },
    '.env.example':        { label: 'ENV',  bg: '#eaed00', fg: '#000' },
    '.env.production':     { label: 'ENV',  bg: '#eaed00', fg: '#000' },
    'readme.md':           { label: 'MD',   bg: '#083fa1' },
    'changelog.md':        { label: 'LOG',  bg: '#083fa1' },
    'license':             { label: 'LIC',  bg: '#5c8a5e' },
    'licence':             { label: 'LIC',  bg: '#5c8a5e' },
    '.bashrc':             { label: 'SH',   bg: '#4eaa25' },
    '.zshrc':              { label: 'ZSH',  bg: '#4eaa25' },
    '.bash_profile':       { label: 'SH',   bg: '#4eaa25' },
    '.profile':            { label: 'SH',   bg: '#4eaa25' },
    'gemfile':             { label: 'GEM',  bg: '#701516' },
    'rakefile':            { label: 'RB',   bg: '#701516' },
    'procfile':            { label: 'PRC',  bg: '#79589f' },
    'requirements.txt':    { label: 'PY',   bg: '#3572a5' },
    'pyproject.toml':      { label: 'PY',   bg: '#3572a5' },
    'go.mod':              { label: 'GO',   bg: '#00add8' },
    'go.sum':              { label: 'GO',   bg: '#00add8' },
    'build.gradle':        { label: 'GRD',  bg: '#02303a' },
    'pom.xml':             { label: 'MVN',  bg: '#c71a36' },
    'tauri.conf.json':     { label: 'TAU',  bg: '#ffc131', fg: '#000' },
};

// ── Resolución de colores ────────────────────────────────────────────────

function resolveFileColors(nameLower) {
    if (SPECIAL_FILE_COLORS[nameLower]) return SPECIAL_FILE_COLORS[nameLower];
    const parts = nameLower.split('.');
    if (parts.length >= 3) {
        const d = parts.slice(-2).join('.');
        if (FILE_COLORS[d]) return FILE_COLORS[d];
    }
    if (parts.length >= 2) {
        const ext = parts[parts.length - 1];
        if (FILE_COLORS[ext]) return FILE_COLORS[ext];
    }
    if (nameLower.startsWith('.')) return ['#78909c','#4a6070'];
    return ['#546e7a','#364e56'];
}

// ── Punto de entrada público ─────────────────────────────────────────────

/**
 * Devuelve el HTML del ícono de archivo.
 * Tema "seti"  → SVG outline de Tabler Icons (vía icons.js)
 * Tema "badge" → badge de texto coloreado
 */
function getFileIconHtml(filename) {
    const nameLower = filename.toLowerCase();
    const theme     = getIconTheme();

    // ── Badge ──────────────────────────────────────────────────────────────
    if (theme === 'badge') {
        const [fill] = resolveFileColors(nameLower);
        const label = SPECIAL_BADGE_LABELS[nameLower]
            || (() => {
                const parts = nameLower.split('.');
                if (parts.length >= 3) {
                    const d = parts.slice(-2).join('.');
                    if (BADGE_LABELS[d]) return BADGE_LABELS[d];
                }
                if (parts.length >= 2) return BADGE_LABELS[parts[parts.length - 1]] || null;
                return null;
            })()
            || (nameLower.startsWith('.') ? 'CFG' : '···');
        const fg = ['#f1e05a','#eaed00','#cbcb41','#ffe953','#8dd6f9','#ededed','#fff2c6'].includes(fill) ? '#000' : '#fff';
        return `<span class="file-icon" style="background:${fill};color:${fg}">${escapeHtml(label)}</span>`;
    }

    // ── Brand / Ember / Symbols ────────────────────────────────────────────
    if ((theme === 'brand' || theme === 'ember' || theme === 'symbols') && window.ICON_SET?.getThemedIconHtml) {
        const html = window.ICON_SET.getThemedIconHtml(filename, theme);
        if (html) return `<span class="icon-wrapper themed-icon">${html}</span>`;
    }

    // ── Seti (outline) — flujo original ───────────────────────────────────
    if (window.ICON_SET) {
        const { svg, color } = window.ICON_SET.getIconForFile(filename);
        return `<span class="icon-wrapper" style="color:${color}">${svg}</span>`;
    }

    // Fallback si icons.js aún no cargó
    const [fill, fold] = resolveFileColors(nameLower);
    return svgFileLegacy(fill, fold);
}

/**
 * Devuelve el HTML del ícono de carpeta, con color según el nombre.
 */
function getFolderIconHtml(name) {
    const color = FOLDER_COLORS[name.toLowerCase()] || '#dcb67a';
    const theme = getIconTheme();

    // ── Badge ──────────────────────────────────────────────────────────────
    if (theme === 'badge') {
        return `<span class="folder-icon" style="color:${color}">▶</span>`;
    }

    // ── Brand / Ember / Symbols ────────────────────────────────────────────
    if ((theme === 'brand' || theme === 'ember' || theme === 'symbols') && window.ICON_SET?.getThemedFolderHtml) {
        const html = window.ICON_SET.getThemedFolderHtml(name, theme);
        if (html) return `<span class="icon-wrapper themed-icon">${html}</span>`;
    }

    // ── Seti (outline) — flujo original ───────────────────────────────────
    if (window.ICON_SET) {
        const { svg } = window.ICON_SET.getIconForFolder(name);
        return `<span class="icon-wrapper" style="color:${color}">${svg}</span>`;
    }

    // Fallback si icons.js aún no cargó
    return svgFolderLegacy(color);
}

// ── Iniciar ───────────────────────────────────────────────────────────────

// Exponer función de re-render para que el selector de tema de íconos
// pueda forzar una actualización visual sin hacer fetch al backend.
// Cuando el usuario cambia de tema, simplemente re-renderizamos las entradas
// ya cacheadas del directorio actual.
window._explorerRefresh = function () {
    const cached = dirCache.get(currentPath);
    if (cached) {
        renderEntries(cached.entries, currentPath);
    }
};

// Sincronizar explorador con el CWD del shell activo (llamado al cambiar de tab)
window._syncExplorerToActiveShell = async function () {
    const activeShell = window.ocoteActiveShellId;
    if (!activeShell) return;
    try {
        const cwd = await window.__TAURI__.invoke('get_shell_cwd', { shellId: activeShell });
        if (cwd && cwd !== currentPath) {
            await loadDirectory(cwd);
        }
    } catch (err) {
        console.error('[Explorer] Error al sincronizar con shell activo:', err);
    }
};

// ── Collapsible explorer ─────────────────────────────────────────────────────
// Toggle con clic en el botón del borde o atajo Ctrl+B (estilo VS Code).
// El estado se persiste en localStorage para que sobreviva a reinicios.

const COLLAPSED_STORAGE_KEY = 'ocote_explorer_collapsed';

function toggleExplorer() {
    const panel = document.getElementById('explorer-panel');
    const btn = document.getElementById('explorer-toggle');
    if (!panel || !btn) return;

    const isCollapsed = panel.classList.toggle('collapsed');
    localStorage.setItem(COLLAPSED_STORAGE_KEY, isCollapsed ? '1' : '');
    btn.textContent = isCollapsed ? '▶' : '◀';
    btn.title = isCollapsed
        ? 'Mostrar explorador (Ctrl+B)'
        : 'Colapsar explorador (Ctrl+B)';

    // Refit terminal cuando la transición termine (el espacio cambió)
    setTimeout(() => {
        const active = window.TAB_MANAGER?.getTab(window.ocoteActiveShellId);
        if (active?.fitAddon) active.fitAddon.fit();
    }, 250);
}

// Restaurar estado colapsado al cargar la página
(function initCollapsedState() {
    const panel = document.getElementById('explorer-panel');
    const btn = document.getElementById('explorer-toggle');
    if (localStorage.getItem(COLLAPSED_STORAGE_KEY) === '1') {
        if (panel) panel.classList.add('collapsed');
        if (btn) {
            btn.textContent = '▶';
            btn.title = 'Mostrar explorador (Ctrl+B)';
        }
    }
})();

// Click en el botón toggle
document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('explorer-toggle');
    if (btn) btn.addEventListener('click', toggleExplorer);
});

// Atajo de teclado: Ctrl+B (no usado por ningún otro comando)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.key === 'b' && !e.shiftKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        toggleExplorer();
    }
});

// Cerrar menú contextual al hacer clic fuera o presionar Esc
document.addEventListener('click', (e) => {
    if (_contextMenuEl && !_contextMenuEl.contains(e.target)) {
        closeContextMenu();
    }
});
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeContextMenu();
});

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExplorer);
} else {
    initExplorer();
}
