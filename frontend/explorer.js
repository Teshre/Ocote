// explorer.js — Panel lateral de explorador de archivos
// FASE 2

// NOTA: Usamos window.__TAURI__.invoke directamente porque terminal.js ya declaró `const { invoke }`
// y los scripts en el scope global no permiten redeclarar `const`.

// ── Referencias DOM ───────────────────────────────────────────────────────
const panel = document.getElementById('explorer-panel');
// Apuntamos al span interno del breadcrumb para no borrar el selector de idioma
const breadcrumb = document.getElementById('breadcrumb-path');

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

// ── Sistema de íconos dinámicos ──────────────────────────────────────────
//
// Cada archivo muestra un badge de color que refleja su tecnología,
// igual que el Material Icon Theme de VS Code.
//
// Estructura del badge: <span class="file-icon" style="background:BG;color:FG">LABEL</span>
// Las carpetas usan un triángulo coloreado según el nombre.
//
// Jerarquía de resolución para archivos:
//   1. Nombre completo especial  (package.json, Cargo.toml, .env…)
//   2. Doble extensión           (.d.ts, .tar.gz…)
//   3. Extensión simple          (.js, .rs, .py…)
//   4. Dotfiles sin extensión    (.gitconfig → CFG)
//   5. Fallback genérico         (···)

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

// Íconos de archivos por extensión: { label, bg, fg? }
const FILE_ICONS = {
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

// Archivos especiales reconocidos por nombre completo (priority sobre extensión)
const SPECIAL_FILES = {
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

/**
 * Devuelve el HTML del badge de ícono para un archivo dado.
 */
function getFileIconHtml(filename) {
    const nameLower = filename.toLowerCase();

    // 1. Nombre completo especial
    const special = SPECIAL_FILES[nameLower];
    if (special) return makeIconBadge(special);

    // 2. Doble extensión (.d.ts, .tar.gz, .min.js…)
    const parts = nameLower.split('.');
    if (parts.length >= 3) {
        const doubleExt = parts.slice(-2).join('.');
        if (FILE_ICONS[doubleExt]) return makeIconBadge(FILE_ICONS[doubleExt]);
    }

    // 3. Extensión simple
    if (parts.length >= 2) {
        const ext = parts[parts.length - 1];
        if (FILE_ICONS[ext]) return makeIconBadge(FILE_ICONS[ext]);
    }

    // 4. Dotfiles sin extensión conocida (.gitconfig, .npmrc…)
    if (filename.startsWith('.')) {
        return makeIconBadge({ label: 'CFG', bg: '#78909c' });
    }

    // 5. Fallback genérico
    return makeIconBadge({ label: '···', bg: '#455a64' });
}

/**
 * Devuelve el HTML del ícono de carpeta, con color según el nombre.
 * Carpetas especiales (src, test, node_modules…) tienen su propio color.
 * El resto usa el naranja Ocote por defecto.
 */
function getFolderIconHtml(name) {
    const color = FOLDER_COLORS[name.toLowerCase()] || '#f5a623';
    return `<span class="folder-icon" style="color:${color}">▶</span>`;
}

/** Construye el HTML del badge dado un objeto { label, bg, fg }. */
function makeIconBadge({ label, bg, fg = '#fff' }) {
    return `<span class="file-icon" style="background:${bg};color:${fg}">${escapeHtml(label)}</span>`;
}

// ── Iniciar ───────────────────────────────────────────────────────────────

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initExplorer);
} else {
    initExplorer();
}
