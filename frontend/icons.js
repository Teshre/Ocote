// icons.js — Iconos SVG inline para el explorador de archivos
// Usa paths de Tabler Icons (MIT license): https://tabler-icons.io
// Todos los SVGs usan stroke="currentColor" para heredar el color del contenedor.
// El tamaño base es 16×16 escalado desde viewBox 24×24.

const ICONS = {
  // ── Carpetas ──────────────────────────────────────────────────────────
  folder: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M5 4h4l3 3h7a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2"/></svg>`,

  folderOpen: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M5 19l2.757-7.351a1 1 0 0 1 .936-.649h12.307a1 1 0 0 1 .986 1.164l-.996 5.211a2 2 0 0 1-1.964 1.625h-14.026a2 2 0 0 1-2-2v-11a2 2 0 0 1 2-2h4l3 3h7a2 2 0 0 1 2 2v2"/></svg>`,

  // ── Archivos genéricos ─────────────────────────────────────────────────
  file: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/></svg>`,

  fileCode: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M10 13l-1 2l1 2"/><path d="M14 13l1 2l-1 2"/></svg>`,

  fileText: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M14 3v4a1 1 0 0 0 1 1h4"/><path d="M17 21h-10a2 2 0 0 1-2-2v-14a2 2 0 0 1 2-2h7l5 5v11a2 2 0 0 1-2 2z"/><path d="M9 9l1 0"/><path d="M9 13l6 0"/><path d="M9 17l6 0"/></svg>`,

  // ── Tipos específicos ──────────────────────────────────────────────────
  photo: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M15 8h.01"/><path d="M3 6a3 3 0 0 1 3-3h12a3 3 0 0 1 3 3v12a3 3 0 0 1-3 3h-12a3 3 0 0 1-3-3v-12z"/><path d="M3 16l5-5c.928-.893 2.072-.893 3 0l5 5"/><path d="M14 14l1-1c.928-.893 2.072-.893 3 0l3 3"/></svg>`,

  music: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M3 17a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/><path d="M13 17a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/><path d="M9 17v-13h10v13"/><path d="M9 8h10"/></svg>`,

  video: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M15 10l4.553-2.276a1 1 0 0 1 1.447.894v6.764a1 1 0 0 1-1.447.894l-4.553-2.276v-4z"/><path d="M3 6m0 2a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-8a2 2 0 0 1-2-2z"/></svg>`,

  zip: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M16 16v-8h2a2 2 0 1 1 0 4h-2"/><path d="M12 8v8"/><path d="M4 8h4l-4 8h4"/></svg>`,

  database: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M12 6m-8 0a8 3 0 1 0 16 0a8 3 0 1 0-16 0"/><path d="M4 6v6a8 3 0 0 0 16 0v-6"/><path d="M4 12v6a8 3 0 0 0 16 0v-6"/></svg>`,

  settings: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 0 0 2.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 0 0 1.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 0 0-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 0 0-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 0 0-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 0 0-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 0 0 1.066-2.573c-.94-1.543.826-3.31 2.37-2.37c1 .608 2.296.07 2.572-1.065z"/><path d="M9 12a3 3 0 1 0 6 0a3 3 0 0 0-6 0"/></svg>`,

  pdf: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M10 8v8h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2h-2z"/><path d="M3 12h2a2 2 0 1 0 0-4h-2v8"/><path d="M17 12h3"/><path d="M21 8h-4v8"/></svg>`,

  terminal: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M5 7l5 5l-5 5"/><path d="M12 19l7 0"/></svg>`,

  table: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M3 5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2v-14z"/><path d="M3 10h18"/><path d="M10 3v18"/></svg>`,

  markdown: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" stroke-width="2" stroke="currentColor" fill="none" stroke-linecap="round" stroke-linejoin="round"><path stroke="none" d="M0 0h24v24H0z"/><path d="M3 5m0 2a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v10a2 2 0 0 1-2 2h-14a2 2 0 0 1-2-2z"/><path d="M7 15v-6l2 2l2-2v6"/><path d="M14 13l2 2l2-2m-2 2v-6"/></svg>`,
};

// ── Colores y mapeo de extensiones ─────────────────────────────────────

const ICON_FILE_MAP = {
  // Lenguajes de programación
  js:         { icon: 'fileCode', color: '#f7df1e' },
  mjs:        { icon: 'fileCode', color: '#f7df1e' },
  cjs:        { icon: 'fileCode', color: '#f7df1e' },
  ts:         { icon: 'fileCode', color: '#3178c6' },
  tsx:        { icon: 'fileCode', color: '#3178c6' },
  jsx:        { icon: 'fileCode', color: '#61dafb' },
  py:         { icon: 'fileCode', color: '#3776ab' },
  pyc:        { icon: 'fileCode', color: '#3776ab' },
  pyo:        { icon: 'fileCode', color: '#3776ab' },
  rs:         { icon: 'fileCode', color: '#dea584' },
  go:         { icon: 'fileCode', color: '#00add8' },
  java:       { icon: 'fileCode', color: '#b07219' },
  class:      { icon: 'fileCode', color: '#b07219' },
  jar:        { icon: 'fileCode', color: '#b07219' },
  kt:         { icon: 'fileCode', color: '#a97bff' },
  kts:        { icon: 'fileCode', color: '#a97bff' },
  scala:      { icon: 'fileCode', color: '#c22d40' },
  php:        { icon: 'fileCode', color: '#4f5d95' },
  rb:         { icon: 'fileCode', color: '#701516' },
  erb:        { icon: 'fileCode', color: '#701516' },
  swift:      { icon: 'fileCode', color: '#f05138' },
  c:          { icon: 'fileCode', color: '#555555' },
  h:          { icon: 'fileCode', color: '#555555' },
  cpp:        { icon: 'fileCode', color: '#f34b7d' },
  hpp:        { icon: 'fileCode', color: '#f34b7d' },
  cs:         { icon: 'fileCode', color: '#178600' },
  fs:         { icon: 'fileCode', color: '#b845fc' },
  fsx:        { icon: 'fileCode', color: '#b845fc' },
  clj:        { icon: 'fileCode', color: '#db5855' },
  cljs:       { icon: 'fileCode', color: '#db5855' },
  elm:        { icon: 'fileCode', color: '#60b5cc' },
  ex:         { icon: 'fileCode', color: '#6e4a7e' },
  exs:        { icon: 'fileCode', color: '#6e4a7e' },
  erl:        { icon: 'fileCode', color: '#b83998' },
  hrl:        { icon: 'fileCode', color: '#b83998' },
  hs:         { icon: 'fileCode', color: '#5e5086' },
  lhs:        { icon: 'fileCode', color: '#5e5086' },
  lua:        { icon: 'fileCode', color: '#000080' },
  nim:        { icon: 'fileCode', color: '#ffe953' },
  r:          { icon: 'fileCode', color: '#198ce7' },
  rmd:        { icon: 'fileCode', color: '#198ce7' },
  dart:       { icon: 'fileCode', color: '#00b4ab' },
  v:          { icon: 'fileCode', color: '#5f87d7' },
  sol:        { icon: 'fileCode', color: '#aa6746' },

  // Web / markup
  html:       { icon: 'fileCode', color: '#e34c26' },
  htm:        { icon: 'fileCode', color: '#e34c26' },
  xhtml:      { icon: 'fileCode', color: '#e34c26' },
  css:        { icon: 'fileCode', color: '#264de4' },
  scss:       { icon: 'fileCode', color: '#cc6699' },
  sass:       { icon: 'fileCode', color: '#cc6699' },
  less:       { icon: 'fileCode', color: '#1d365d' },
  styl:       { icon: 'fileCode', color: '#b3d107' },
  stylus:     { icon: 'fileCode', color: '#b3d107' },

  // Datos / config
  json:       { icon: 'fileText', color: '#292929' },
  jsonc:      { icon: 'fileText', color: '#292929' },
  yaml:       { icon: 'settings', color: '#cb171e' },
  yml:        { icon: 'settings', color: '#cb171e' },
  toml:       { icon: 'settings', color: '#9c4121' },
  ini:        { icon: 'settings', color: '#9b59b6' },
  conf:       { icon: 'settings', color: '#9b59b6' },
  config:     { icon: 'settings', color: '#9b59b6' },
  env:        { icon: 'settings', color: '#9b59b6' },
  properties: { icon: 'settings', color: '#9b59b6' },
  lock:       { icon: 'settings', color: '#9b59b6' },

  // Markdown
  md:         { icon: 'markdown', color: '#083fa1' },
  mdx:        { icon: 'markdown', color: '#083fa1' },
  rst:        { icon: 'markdown', color: '#333333' },

  // Shell
  sh:         { icon: 'terminal', color: '#89e051' },
  bash:       { icon: 'terminal', color: '#89e051' },
  zsh:        { icon: 'terminal', color: '#89e051' },
  fish:       { icon: 'terminal', color: '#4aae47' },
  ps1:        { icon: 'terminal', color: '#012456' },
  ps1xml:     { icon: 'terminal', color: '#012456' },
  bat:        { icon: 'terminal', color: '#c1f12e' },
  cmd:        { icon: 'terminal', color: '#c1f12e' },

  // Imagen
  jpg:        { icon: 'photo', color: '#26b99a' },
  jpeg:       { icon: 'photo', color: '#26b99a' },
  png:        { icon: 'photo', color: '#26b99a' },
  gif:        { icon: 'photo', color: '#26b99a' },
  svg:        { icon: 'photo', color: '#ffb13b' },
  ico:        { icon: 'photo', color: '#26b99a' },
  webp:       { icon: 'photo', color: '#26b99a' },
  avif:       { icon: 'photo', color: '#26b99a' },
  bmp:        { icon: 'photo', color: '#26b99a' },
  tiff:       { icon: 'photo', color: '#26b99a' },
  tif:        { icon: 'photo', color: '#26b99a' },
  psd:        { icon: 'photo', color: '#001e36' },
  xcf:        { icon: 'photo', color: '#665e54' },
  sketch:     { icon: 'photo', color: '#f7b500' },
  fig:        { icon: 'photo', color: '#f24e1e' },

  // Audio
  mp3:        { icon: 'music', color: '#f1c40f' },
  wav:        { icon: 'music', color: '#f1c40f' },
  ogg:        { icon: 'music', color: '#f1c40f' },
  flac:       { icon: 'music', color: '#f1c40f' },
  aac:        { icon: 'music', color: '#f1c40f' },
  m4a:        { icon: 'music', color: '#f1c40f' },
  wma:        { icon: 'music', color: '#f1c40f' },

  // Video
  mp4:        { icon: 'video', color: '#e74c3c' },
  mov:        { icon: 'video', color: '#e74c3c' },
  avi:        { icon: 'video', color: '#e74c3c' },
  mkv:        { icon: 'video', color: '#e74c3c' },
  webm:       { icon: 'video', color: '#e74c3c' },
  flv:        { icon: 'video', color: '#e74c3c' },
  wmv:        { icon: 'video', color: '#e74c3c' },

  // Comprimido
  zip:        { icon: 'zip', color: '#f39c12' },
  tar:        { icon: 'zip', color: '#f39c12' },
  gz:         { icon: 'zip', color: '#f39c12' },
  bz2:        { icon: 'zip', color: '#f39c12' },
  xz:         { icon: 'zip', color: '#f39c12' },
  rar:        { icon: 'zip', color: '#f39c12' },
  '7z':       { icon: 'zip', color: '#f39c12' },
  deb:        { icon: 'zip', color: '#a80030' },
  rpm:        { icon: 'zip', color: '#465a98' },
  apk:        { icon: 'zip', color: '#3ddc84' },
  ipa:        { icon: 'zip', color: '#0d96f6' },

  // Documentos
  pdf:        { icon: 'pdf', color: '#e74c3c' },
  doc:        { icon: 'fileText', color: '#2b579a' },
  docx:       { icon: 'fileText', color: '#2b579a' },
  odt:        { icon: 'fileText', color: '#2b579a' },
  xls:        { icon: 'table',  color: '#217346' },
  xlsx:       { icon: 'table',  color: '#217346' },
  ods:        { icon: 'table',  color: '#217346' },
  csv:        { icon: 'table',  color: '#217346' },
  tsv:        { icon: 'table',  color: '#217346' },
  ppt:        { icon: 'fileText', color: '#d24726' },
  pptx:       { icon: 'fileText', color: '#d24726' },
  odp:        { icon: 'fileText', color: '#d24726' },
  txt:        { icon: 'fileText', color: '#95a5a6' },
  rtf:        { icon: 'fileText', color: '#95a5a6' },
  log:        { icon: 'fileText', color: '#95a5a6' },

  // Database
  sql:        { icon: 'database', color: '#3498db' },
  db:         { icon: 'database', color: '#3498db' },
  sqlite:     { icon: 'database', color: '#3498db' },
  sqlite3:    { icon: 'database', color: '#3498db' },
  mdb:        { icon: 'database', color: '#3498db' },
  accdb:      { icon: 'database', color: '#3498db' },
  dump:       { icon: 'database', color: '#3498db' },

  // Ejecutables
  exe:        { icon: 'terminal', color: '#00a4ef' },
  dll:        { icon: 'terminal', color: '#00a4ef' },
  bin:        { icon: 'terminal', color: '#00a4ef' },
  app:        { icon: 'terminal', color: '#00a4ef' },
  dmg:        { icon: 'terminal', color: '#00a4ef' },
  pkg:        { icon: 'terminal', color: '#00a4ef' },
  msi:        { icon: 'terminal', color: '#00a4ef' },
  so:         { icon: 'terminal', color: '#00a4ef' },
  dylib:      { icon: 'terminal', color: '#00a4ef' },
  o:          { icon: 'terminal', color: '#00a4ef' },
  a:          { icon: 'terminal', color: '#00a4ef' },
  wasm:       { icon: 'terminal', color: '#654ff0' },

  // E-book
  epub:       { icon: 'fileText', color: '#86b9e0' },
  mobi:       { icon: 'fileText', color: '#86b9e0' },
  azw:        { icon: 'fileText', color: '#86b9e0' },
  azw3:       { icon: 'fileText', color: '#86b9e0' },

  // 3D / CAD
  stl:        { icon: 'settings', color: '#f39c12' },
  obj:        { icon: 'settings', color: '#f39c12' },
  fbx:        { icon: 'settings', color: '#f39c12' },
  dxf:        { icon: 'settings', color: '#f39c12' },
  dwg:        { icon: 'settings', color: '#f39c12' },

  // Fallback
  default:    { icon: 'file', color: '#95a5a6' },
};

// ── Colores de carpeta por nombre ────────────────────────────────────────

const ICON_FOLDER_MAP = {
  // Source
  src:        '#3498db',
  source:     '#3498db',
  sources:    '#3498db',
  lib:        '#9b59b6',
  libs:       '#9b59b6',
  library:    '#9b59b6',
  vendor:     '#9b59b6',
  node_modules: '#8e44ad',
  package:    '#e74c3c',

  // Build / output
  dist:       '#27ae60',
  build:      '#27ae60',
  out:        '#27ae60',
  output:     '#27ae60',
  target:     '#27ae60',
  release:    '#27ae60',
  debug:      '#e67e22',
  obj:        '#7f8c8d',

  // Bin / exec
  bin:        '#2c3e50',
  sbin:       '#2c3e50',

  // Temp
  tmp:        '#95a5a6',
  temp:       '#95a5a6',
  cache:      '#95a5a6',

  // Logs
  logs:       '#f39c12',
  log:        '#f39c12',

  // Tests
  test:       '#2ecc71',
  tests:      '#2ecc71',
  spec:       '#2ecc71',
  specs:      '#2ecc71',
  e2e:        '#2ecc71',
  cypress:    '#2ecc71',
  playwright: '#2ecc71',
  __tests__:  '#2ecc71',
  __mocks__:  '#2ecc71',

  // Docs
  docs:       '#3498db',
  doc:        '#3498db',
  documentation: '#3498db',
  wiki:       '#3498db',
  storybook:  '#ff4785',

  // Examples
  examples:   '#e67e22',
  example:    '#e67e22',
  samples:    '#e67e22',
  sample:     '#e67e22',
  demo:       '#e67e22',
  demos:      '#e67e22',

  // Assets
  assets:     '#e74c3c',
  images:     '#e74c3c',
  image:      '#e74c3c',
  img:        '#e74c3c',
  imgs:       '#e74c3c',
  pictures:   '#e74c3c',
  photos:     '#e74c3c',
  media:      '#e74c3c',
  static:     '#e74c3c',
  public:     '#e74c3c',
  resources:  '#e74c3c',
  res:        '#e74c3c',
  raw:        '#e74c3c',

  // Icons / fonts
  icons:      '#f1c40f',
  icon:       '#f1c40f',
  font:       '#f1c40f',
  fonts:      '#f1c40f',
  fontello:   '#f1c40f',
  webfonts:   '#f1c40f',

  // Styles
  styles:     '#9b59b6',
  style:      '#9b59b6',
  css:        '#9b59b6',
  scss:       '#9b59b6',
  sass:       '#9b59b6',
  less:       '#9b59b6',
  stylus:     '#9b59b6',
  styl:       '#9b59b6',
  themes:     '#9b59b6',
  theme:      '#9b59b6',

  // Scripts
  scripts:    '#f39c12',
  script:     '#f39c12',
  js:         '#f39c12',
  ts:         '#3178c6',
  typescript: '#3178c6',
  javascript: '#f39c12',
  python:     '#3776ab',
  rust:       '#dea584',
  go:         '#00add8',
  java:       '#b07219',
  php:        '#4f5d95',
  ruby:       '#701516',
  shell:      '#89e051',
  bash:       '#89e051',
  zsh:        '#89e051',
  powershell: '#012456',

  // DevOps
  docker:     '#2496ed',
  kubernetes: '#326ce5',
  k8s:        '#326ce5',
  helm:       '#0f1689',
  terraform:  '#623ce4',
  ansible:    '#1a1918',
  vagrant:    '#1563ff',
  puppet:     '#ffae1a',
  chef:       '#f09820',
  salt:       '#00eace',
  ci:         '#3e86c7',
  cicd:       '#3e86c7',
  github:     '#24292e',
  gitlab:     '#fc6d26',
  bitbucket:  '#2684ff',
  azure:      '#0089d6',
  aws:        '#ff9900',
  gcp:        '#4285f4',
  firebase:   '#ffca28',
  netlify:    '#00c7b7',
  vercel:     '#000000',
  heroku:     '#6762a6',
  cloudflare: '#f48120',

  // Server
  server:     '#2c3e50',
  servers:    '#2c3e50',
  client:     '#3498db',
  clients:    '#3498db',
  api:        '#2c3e50',
  apis:       '#2c3e50',
  graphql:    '#e10098',
  rest:       '#2c3e50',
  grpc:       '#244c5a',
  proxy:      '#2c3e50',
  middleware: '#2c3e50',

  // Database
  db:         '#3498db',
  database:   '#3498db',
  databases:  '#3498db',
  data:       '#3498db',
  migrations: '#3498db',
  seeds:      '#3498db',
  seeders:    '#3498db',
  fixtures:   '#3498db',
  factory:    '#3498db',

  // Config
  config:     '#9b59b6',
  configs:    '#9b59b6',
  configuration: '#9b59b6',
  settings:   '#9b59b6',
  etc:        '#7f8c8d',
  env:        '#9b59b6',
  environments: '#9b59b6',
  environment: '#9b59b6',

  // Tools
  tools:      '#e67e22',
  tool:       '#e67e22',
  util:       '#e67e22',
  utils:      '#e67e22',
  utilities:  '#e67e22',
  helper:     '#e67e22',
  helpers:    '#e67e22',
  hook:       '#e67e22',
  hooks:      '#e67e22',
  mixin:      '#e67e22',
  mixins:     '#e67e22',
  plugin:     '#e67e22',
  plugins:    '#e67e22',
  extension:  '#e67e22',
  extensions: '#e67e22',
  addon:      '#e67e22',
  addons:     '#e67e22',

  // System paths
  var:        '#3498db',
  home:       '#2ecc71',
  usr:        '#3498db',
  opt:        '#9b59b6',
  mnt:        '#f39c12',
  media:      '#e74c3c',
  proc:       '#95a5a6',
  sys:        '#95a5a6',
  dev:        '#95a5a6',
  run:        '#95a5a6',
  srv:        '#27ae60',
  boot:       '#f39c12',
  root:       '#e74c3c',
  etc:        '#7f8c8d',

  // VCS
  git:        '#f05032',
  hg:         '#999999',
  svn:        '#809cc9',
  vcs:        '#999999',

  // IDE / editor
  vscode:     '#007acc',
  idea:       '#fe315d',
  eclipse:    '#2c2255',

  // Misc
  backup:     '#f39c12',
  backups:    '#f39c12',
  old:        '#f39c12',
  archive:    '#f39c12',
  archives:   '#f39c12',
  deprecated: '#f39c12',
  obsolete:   '#f39c12',

  default:    '#dcb67a',
};

// ── Helpers ─────────────────────────────────────────────────────────────

function getIconForFile(filename) {
  const ext = filename.split('.').pop().toLowerCase();
  const info = ICON_FILE_MAP[ext] || ICON_FILE_MAP.default;
  return {
    svg: ICONS[info.icon] || ICONS.file,
    color: info.color,
  };
}

function getIconForFolder(name) {
  const lower = name.toLowerCase();
  const color = ICON_FOLDER_MAP[lower] || ICON_FOLDER_MAP.default;
  return {
    svg: ICONS.folder,
    color,
  };
}

// Exponer para explorer.js
window.ICON_SET = {
  ICONS,
  FILE_COLORS: ICON_FILE_MAP,
  FOLDER_COLORS: ICON_FOLDER_MAP,
  getIconForFile,
  getIconForFolder,
};
