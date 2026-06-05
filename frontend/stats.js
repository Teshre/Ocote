// stats.js — Dashboard de estadísticas de uso (100% offline)
//
// Dos fuentes (ver stats.rs): historial del shell (top comandos all-time) +
// log propio de Ocote (hora pico, % errores, comando más lento, días activos).
// El log crece a medida que usas Ocote; el historial está disponible desde ya.

(function () {
  'use strict';

  const invoke  = window.__TAURI__?.invoke;
  const overlay = document.getElementById('stats-overlay');
  const card    = document.getElementById('stats-card');
  if (!overlay || !card || !invoke) return;

  function esc(s) {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  // ── Abrir / cerrar ─────────────────────────────────────────────────────────

  async function open() {
    overlay.classList.remove('hidden');
    card.innerHTML = '<div class="stats-loading">Analizando tu historial…</div>';
    try {
      const s = await invoke('get_stats');
      render(s);
    } catch (e) {
      card.innerHTML = `<div class="stats-loading">No se pudieron cargar las estadísticas:<br>${esc(String(e))}</div>`;
    }
  }

  function close() {
    overlay.classList.add('hidden');
  }

  // ── Render de componentes ────────────────────────────────────────────────

  // Lista de barras horizontales (programas / comandos más usados)
  function barList(items, max) {
    if (!items || !items.length) return '<div class="stats-empty">Sin datos en el historial</div>';
    return items.map(it => {
      const pct = max > 0 ? Math.round((it.count / max) * 100) : 0;
      return `<div class="stat-bar-row">
        <span class="stat-bar-name" title="${esc(it.name)}">${esc(it.name)}</span>
        <span class="stat-bar-track"><span class="stat-bar-fill" style="width:${Math.max(pct, 3)}%"></span></span>
        <span class="stat-bar-count">${it.count}</span>
      </div>`;
    }).join('');
  }

  // Mini gráfico de barras verticales: actividad por hora del día (0-23)
  function hourChart(byHour) {
    const max  = Math.max(...byHour, 1);
    const peak = byHour.indexOf(Math.max(...byHour));
    let bars = '';
    for (let h = 0; h < 24; h++) {
      const pct = Math.round((byHour[h] / max) * 100);
      const isPeak = byHour[h] > 0 && h === peak;
      bars += `<div class="hour-bar ${isPeak ? 'peak' : ''}" style="height:${Math.max(pct, 2)}%"
                   title="${h}:00 — ${byHour[h]} comando${byHour[h] !== 1 ? 's' : ''}"></div>`;
    }
    return `<div class="hour-chart">${bars}</div>
      <div class="hour-axis"><span>0h</span><span>6h</span><span>12h</span><span>18h</span><span>23h</span></div>`;
  }

  function emptyLog() {
    return `<div class="stats-empty-log">
      Aún no hay comandos registrados por Ocote. A medida que uses la terminal,
      aquí aparecerán tu hora pico, tasa de éxito y tu comando más lento.
    </div>`;
  }

  function render(s) {
    const hasLog      = s.log_total > 0;
    const successPct  = hasLog ? Math.round((s.log_success / s.log_total) * 100) : 0;
    const maxProg     = s.top_programs[0]?.count || 0;
    const maxCmd      = s.top_commands[0]?.count || 0;

    card.innerHTML = `
      <div class="stats-header">
        <h2>Estadísticas <span class="stats-sub">· 100% offline · ${esc(s.shell)}</span></h2>
        <button id="stats-close" aria-label="Cerrar">✕</button>
      </div>

      <div class="stats-cards">
        <div class="stat-card">
          <div class="stat-num">${s.history_total.toLocaleString('es')}</div>
          <div class="stat-label">comandos en tu historial</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${s.history_unique.toLocaleString('es')}</div>
          <div class="stat-label">comandos únicos</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${s.log_total.toLocaleString('es')}</div>
          <div class="stat-label">registrados por Ocote</div>
        </div>
        <div class="stat-card">
          <div class="stat-num">${hasLog ? successPct + '%' : '—'}</div>
          <div class="stat-label">tasa de éxito</div>
        </div>
      </div>

      <div class="stats-grid">
        <div class="stats-section">
          <h3>Programas más usados</h3>
          ${barList(s.top_programs, maxProg)}
        </div>
        <div class="stats-section">
          <h3>Comandos más usados</h3>
          ${barList(s.top_commands, maxCmd)}
        </div>
      </div>

      <div class="stats-section">
        <h3>Actividad por hora del día</h3>
        ${hasLog ? hourChart(s.by_hour) : emptyLog()}
      </div>

      ${hasLog ? `
      <div class="stats-mini-row">
        <div class="stat-mini"><span class="stat-mini-val ok">${s.log_success}</span><span class="stat-mini-label">exitosos</span></div>
        <div class="stat-mini"><span class="stat-mini-val err">${s.log_error}</span><span class="stat-mini-label">con error</span></div>
        <div class="stat-mini"><span class="stat-mini-val">${s.active_days}</span><span class="stat-mini-label">días activos</span></div>
        ${s.slowest ? `<div class="stat-mini stat-mini--wide"><span class="stat-mini-val">${s.slowest.duration_secs}s</span><span class="stat-mini-label">más lento: ${esc(s.slowest.command.slice(0, 28))}</span></div>` : ''}
      </div>` : ''}

      <p class="stats-foot">🔒 Tu historial y tus comandos nunca salen de tu máquina. Sin IA, sin red.</p>
    `;

    document.getElementById('stats-close')?.addEventListener('click', close);
  }

  // ── Wiring ─────────────────────────────────────────────────────────────────

  document.getElementById('stats-btn')?.addEventListener('click', open);
  document.getElementById('stats-backdrop')?.addEventListener('click', close);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !overlay.classList.contains('hidden')) close();
  });

  window.openStats = open;
})();
