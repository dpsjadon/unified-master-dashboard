/**
 * IntelliSmart SBPDCL - Unified Smart Meter Intelligence Platform
 * Multi-Tab Architecture: Master Cumulative, Daily Velocity, ULA Tracker, Search
 */

const state = {
  activeTab: 'tabCumulative',
  activeCircle: 'ALL',
  activeCumType: 'circle',
  activeDailyType: 'circle',
  activeUlaType: 'circle',
  dateMode: 'all',
  selectedMonth: '',
  startDate: '',
  endDate: '',
  charts: {},
  data: {
    summary: null,
    cumulative: null,
    daily: null,
    ula: null
  },
  searchFilters: {
    cumulative: '',
    daily: '',
    ula: ''
  },
  sortConfig: {
    cumulative: { col: 'total', dir: 'desc' },
    daily: { col: 'total', dir: 'desc' },
    ula: { col: 'scope', dir: 'desc' }
  }
};

const PALETTES = {
  circles: ['#0284c7', '#00a3e0', '#38bdf8', '#10b981', '#f59e0b', '#8b5cf6', '#ec4899'],
  tariffs: ['#0284c7', '#00a3e0', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6', '#06b6d4', '#14b8a6', '#64748b'],
  phases: ['#10b981', '#00a3e0', '#f59e0b']
};

document.addEventListener('DOMContentLoaded', () => {
  setupTheme();
  setupNavigation();
  setupDateFilters();
  setupSearch();
  setupSync();
  setupCircleSlicer();
  loadInitialData();
});


// --- CIRCLE SLICER CONTROLS ---
function setupCircleSlicer() {
  const circleSelect = document.getElementById('circleSelect');
  const clearBtn = document.getElementById('slicerClearBtn');

  if (circleSelect) {
    circleSelect.addEventListener('change', (e) => {
      selectCircleFilter(e.target.value);
    });
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', () => {
      selectCircleFilter('ALL');
    });
  }
}

async function selectCircleFilter(circle) {
  state.activeCircle = circle;

  // Sync dropdown value
  const circleSelect = document.getElementById('circleSelect');
  if (circleSelect && circleSelect.value !== circle) {
    circleSelect.value = circle || 'ALL';
  }

  // Toggle clear filter button
  const clearBtn = document.getElementById('slicerClearBtn');
  if (clearBtn) {
    clearBtn.style.setProperty('display', (circle && circle !== 'ALL') ? 'inline-flex' : 'none', 'important');
  }

  // Update scope label in header
  const scopeDiscom = document.getElementById('scopeDiscomText');
  if (scopeDiscom) {
    scopeDiscom.textContent = (circle && circle !== 'ALL') ? `${circle} Circle (Filtered)` : 'SBPDCL (Entire Discom)';
  }
  const mobileScopeDiscom = document.getElementById('mobileScopeDiscomText');
  if (mobileScopeDiscom) {
    mobileScopeDiscom.textContent = (circle && circle !== 'ALL') ? circle : 'SBPDCL';
  }

  // 1. Reload Top Summary KPIs with circle filter
  await loadSummaryKpis();

  // 2. Reload the active tab's reports
  if (state.activeTab === 'tabCumulative') {
    loadCumulativeTable();
    loadCumulativeTrends();
  } else if (state.activeTab === 'tabDaily') {
    loadDailyTable();
  } else if (state.activeTab === 'tabUla') {
    loadUlaTable();
  }
}

// --- THEME ---
function setupTheme() {
  const toggleBtn = document.getElementById('btnThemeToggle');
  const mobileToggleBtn = document.getElementById('btnMobileThemeToggle');

  // Enforce Day Theme (Light Mode) as Default on initial load
  let theme = 'light';
  const saved = localStorage.getItem('unified_dashboard_theme');
  if (saved === 'dark' && sessionStorage.getItem('theme_manually_toggled')) {
    theme = 'dark';
  } else {
    // Default to clean Day Theme
    theme = 'light';
    localStorage.setItem('unified_dashboard_theme', 'light');
  }

  document.documentElement.setAttribute('data-theme', theme);
  updateThemeIcon(theme);

  function toggle() {
    const curr = document.documentElement.getAttribute('data-theme') || 'light';
    const next = curr === 'dark' ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    localStorage.setItem('unified_dashboard_theme', next);
    sessionStorage.setItem('theme_manually_toggled', 'true');
    updateThemeIcon(next);
    resizeAllCharts();
  }

  if (toggleBtn) toggleBtn.addEventListener('click', toggle);
  if (mobileToggleBtn) mobileToggleBtn.addEventListener('click', toggle);
}

function updateThemeIcon(theme) {
  const icons = [document.getElementById('themeIcon'), document.getElementById('mobileThemeIcon')];
  icons.forEach(icon => {
    if (icon) {
      icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
      icon.style.color = theme === 'dark' ? '#f59e0b' : '#0284c7';
    }
  });
}

// --- NAVIGATION ---
function setupNavigation() {
  // Main Tabs
  const mainTabs = document.querySelectorAll('.main-tab-btn');
  mainTabs.forEach(btn => {
    btn.addEventListener('click', () => {
      mainTabs.forEach(b => b.classList.remove('active'));
      document.querySelectorAll('.tab-content').forEach(p => p.classList.remove('active'));

      btn.classList.add('active');
      const targetId = btn.getAttribute('data-tab');
      state.activeTab = targetId;
      const targetPane = document.getElementById(targetId);
      if (targetPane) targetPane.classList.add('active');

      if (targetId === 'tabSearch') {
        // For Smart meter & MSN search: keep it simple, only search bar, no cards required
        document.body.classList.add('search-tab-active');
      } else {
        document.body.classList.remove('search-tab-active');
        // Dynamically update the 6 KPI cards for the active tab
        updateKpiCardsForActiveTab();
      }

      if (targetId === 'tabCumulative') {
        loadCumulativeTable();
        loadCumulativeTrends();
      } else if (targetId === 'tabDaily') {
        loadDailyTable();
      } else if (targetId === 'tabUla') {
        loadUlaTable();
      }
      resizeAllCharts();
    });
  });

  // Executive Dimension Dropdowns
  const selectCumType = document.getElementById('selectCumulativeType');
  if (selectCumType) {
    selectCumType.addEventListener('change', (e) => {
      state.activeCumType = e.target.value;
      loadCumulativeTable();
    });
  }

  const selectDailyType = document.getElementById('selectDailyType');
  if (selectDailyType) {
    selectDailyType.addEventListener('change', (e) => {
      state.activeDailyType = e.target.value;
      loadDailyTable();
    });
  }

  const selectUlaType = document.getElementById('selectUlaType');
  if (selectUlaType) {
    selectUlaType.addEventListener('change', (e) => {
      state.activeUlaType = e.target.value;
      loadUlaTable();
    });
  }

  // Legacy sub-pills support (if present)
  document.querySelectorAll('[data-cum-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-cum-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeCumType = btn.getAttribute('data-cum-type');
      if (selectCumType) selectCumType.value = state.activeCumType;
      loadCumulativeTable();
    });
  });

  document.querySelectorAll('[data-daily-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-daily-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeDailyType = btn.getAttribute('data-daily-type');
      if (selectDailyType) selectDailyType.value = state.activeDailyType;
      loadDailyTable();
    });
  });

  document.querySelectorAll('[data-ula-type]').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('[data-ula-type]').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      state.activeUlaType = btn.getAttribute('data-ula-type');
      if (selectUlaType) selectUlaType.value = state.activeUlaType;
      loadUlaTable();
    });
  });

  // Table Search Inputs
  const searchCum = document.getElementById('searchCumulative');
  if (searchCum) {
    searchCum.addEventListener('input', (e) => {
      state.searchFilters.cumulative = e.target.value.toLowerCase().trim();
      renderCumulativeTable();
    });
  }

  const searchDaily = document.getElementById('searchDaily');
  if (searchDaily) {
    searchDaily.addEventListener('input', (e) => {
      state.searchFilters.daily = e.target.value.toLowerCase().trim();
      renderDailyTable();
    });
  }

  const searchUla = document.getElementById('searchUla');
  if (searchUla) {
    searchUla.addEventListener('input', (e) => {
      state.searchFilters.ula = e.target.value.toLowerCase().trim();
      renderUlaTable();
    });
  }

  // Export CSV Buttons
  const btnExportCum = document.getElementById('btnExportCumulativeCsv');
  if (btnExportCum) btnExportCum.addEventListener('click', exportCumulativeCsv);
  const btnExportDaily = document.getElementById('btnExportDailyCsv');
  if (btnExportDaily) btnExportDaily.addEventListener('click', exportDailyCsv);
  const btnExportUla = document.getElementById('btnExportUlaCsv');
  if (btnExportUla) btnExportUla.addEventListener('click', exportUlaCsv);
}

// --- DATE RANGE FILTERS ---
function setupDateFilters() {
  const selectDateMode = document.getElementById('selectDateMode');
  const monthGroup = document.getElementById('monthSelectGroup');
  const customGroup = document.getElementById('customDateGroup');
  const selectMonth = document.getElementById('selectMonth');
  const badge = document.getElementById('activeFilterBadge');

  if (selectDateMode) {
    selectDateMode.addEventListener('change', (e) => {
      const mode = e.target.value;
      state.dateMode = mode;

      if (monthGroup) {
        monthGroup.style.display = mode === 'monthly' ? 'flex' : 'none';
        monthGroup.classList.toggle('d-none', mode !== 'monthly');
      }
      if (customGroup) {
        customGroup.style.display = mode === 'daily' ? 'flex' : 'none';
        customGroup.classList.toggle('d-none', mode !== 'daily');
      }

      if (mode === 'all') {
        if (badge) badge.textContent = 'All Time Cumulative (1,124,022 Meters)';
        state.selectedMonth = '';
        state.startDate = '';
        state.endDate = '';
        loadCumulativeTable();
      } else if (mode === 'weekly') {
        if (badge) badge.textContent = 'Last 7 Days (Weekly Velocity)';
        loadCumulativeTable();
      } else if (mode === 'monthly') {
        if (badge) badge.textContent = `Month: ${state.selectedMonth || 'Latest'}`;
        loadCumulativeTable();
      }
    });
  }

  const modeBtns = document.querySelectorAll('.date-mode-btn');
  modeBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      modeBtns.forEach(b => {
        b.classList.remove('btn-primary');
        b.classList.add('btn-secondary');
      });
      btn.classList.remove('btn-secondary');
      btn.classList.add('btn-primary');

      const mode = btn.getAttribute('data-mode');
      if (selectDateMode) selectDateMode.value = mode;
      state.dateMode = mode;

      if (monthGroup) {
        monthGroup.style.display = mode === 'monthly' ? 'flex' : 'none';
        monthGroup.classList.toggle('d-none', mode !== 'monthly');
      }
      if (customGroup) {
        customGroup.style.display = mode === 'daily' ? 'flex' : 'none';
        customGroup.classList.toggle('d-none', mode !== 'daily');
      }

      if (mode === 'all') {
        if (badge) badge.textContent = 'All Time Cumulative (1,124,022 Meters)';
        state.selectedMonth = '';
        state.startDate = '';
        state.endDate = '';
        loadCumulativeTable();
      } else if (mode === 'weekly') {
        if (badge) badge.textContent = 'Last 7 Days (Weekly Velocity)';
        loadCumulativeTable();
      } else if (mode === 'monthly') {
        if (badge) badge.textContent = `Month: ${state.selectedMonth || 'Latest'}`;
        loadCumulativeTable();
      }
    });
  });

  if (selectMonth) {
    selectMonth.addEventListener('change', (e) => {
      state.selectedMonth = e.target.value;
      if (badge) badge.textContent = `Month: ${state.selectedMonth || 'All'}`;
      loadCumulativeTable();
    });
  }

  const applyBtn = document.getElementById('btnApplyCustomDate');
  if (applyBtn) {
    applyBtn.addEventListener('click', () => {
      state.startDate = document.getElementById('inputStartDate').value;
      state.endDate = document.getElementById('inputEndDate').value;
      if (badge) badge.textContent = `Custom Range: ${state.startDate} to ${state.endDate}`;
      loadCumulativeTable();
    });
  }
}

// --- SUMMARY KPIS & INITIAL DATA LOAD ---
async function loadSummaryKpis() {
  try {
    const url = (state.activeCircle && state.activeCircle !== 'ALL')
      ? `/api/summary?circle=${encodeURIComponent(state.activeCircle)}`
      : '/api/summary';
    const res = await fetch(url);
    const json = await res.json();
    if (json.success) {
      state.data.summary = json;
      populateSummaryKpis(json);
    }
  } catch (err) {
    console.error('Error loading /api/summary:', err);
  }
}

async function loadInitialData() {
  await loadSummaryKpis();

  // Load Months Dropdown
  try {
    const mRes = await fetch('/api/cumulative/months');
    const mJson = await mRes.json();
    if (mJson.success && mJson.months) {
      const select = document.getElementById('selectMonth');
      select.innerHTML = mJson.months.map(m => `<option value="${m.install_month}">${m.install_month} (${m.count.toLocaleString()} meters)</option>`).join('');
      if (mJson.months.length > 0) {
        state.selectedMonth = mJson.months[0].install_month;
      }
    }
  } catch (err) {
    console.error('Error loading months:', err);
  }

  loadCumulativeTable();
  loadCumulativeTrends();
}

function setKpiCard(cardNum, { accent, icon, title, value, subHtml }) {
  const card = document.getElementById(`kpiCard${cardNum}`);
  if (card && accent) {
    card.style.setProperty('--card-accent', accent);
  }
  const titleEl = document.getElementById(`kpiCard${cardNum}Title`);
  if (titleEl) titleEl.textContent = title;

  const iconEl = document.getElementById(`kpiCard${cardNum}Icon`);
  if (iconEl && icon) {
    iconEl.className = `${icon} kpi-icon`;
  }

  const valIds = ['', 'kpiCumulativeTotal', 'kpiPhase1Total', 'kpiPhase3Total', 'kpiOldToSmTotal', 'kpiNscTotal', 'kpiDailyTypeTotal'];
  const valEl = document.getElementById(valIds[cardNum]);
  if (valEl) valEl.innerHTML = value;

  const subEl = document.getElementById(`kpiCard${cardNum}Sub`);
  if (subEl) subEl.innerHTML = subHtml;
}

function updateKpiCardsForActiveTab() {
  if (!state.data.summary) return;
  const json = state.data.summary;
  const m = json.master || {};
  const d = json.daily || {};
  const u = json.ula || {};

  const totalMaster = Number(m.total || 0);
  const p1 = Number(m.phase_1ph || 0);
  const p3 = Number((m.phase_3ph_wc || 0) + (m.phase_3ph_4ct || 0));
  const oldToSm = Number(m.old_to_sm || 0);
  const nsc = Number(m.nsc || 0);

  const replDaily = Number(d.replacement || 0);
  const nscDaily = Number(d.nsc || 0);
  const sumDaily = Number(d.total_daily != null ? d.total_daily : (replDaily + nscDaily));
  const activeTeams = Number(d.active_teams || 0);
  const avgTeam = d.avg_per_team || (activeTeams > 0 ? (sumDaily / activeTeams).toFixed(1) : '0');
  const targetPct = d.achievement_pct || (sumDaily > 0 ? ((sumDaily / 2285) * 100).toFixed(1) : '0');

  const uScope = Number(u.scope || 91033);
  const uInstalled = Number(u.installed || 0);
  const uPending = Number(u.pending || (uScope - uInstalled));
  const uPct = Number(u.completion_pct || (uScope > 0 ? (uInstalled * 100 / uScope).toFixed(2) : 0));
  const uToday = Number(u.today_installed || 0);

  const isCircleFiltered = state.activeCircle && state.activeCircle !== 'ALL';
  const circleLabel = isCircleFiltered ? `${state.activeCircle} Circle` : 'SBPDCL Discom Total';

  if (state.activeTab === 'tabDaily') {
    // --- DAILY INSTALLATION TAB CARDS ---
    setKpiCard(1, {
      accent: '#10b981',
      icon: 'fa-solid fa-bolt-lightning',
      title: "Today's Daily Installed",
      value: sumDaily.toLocaleString(),
      subHtml: `<span class="badge badge-emerald"><i class="fa-solid fa-calendar-day"></i> ${d.date || 'Today'} Batch</span> <span>${circleLabel}</span>`
    });

    setKpiCard(2, {
      accent: '#0284c7',
      icon: 'fa-solid fa-arrows-rotate',
      title: 'Daily Replacement (OldToSM)',
      value: replDaily.toLocaleString(),
      subHtml: `<span class="badge badge-cyan">${sumDaily > 0 ? ((replDaily / sumDaily) * 100).toFixed(1) : '0'}% Today's Share</span>`
    });

    setKpiCard(3, {
      accent: '#8b5cf6',
      icon: 'fa-solid fa-circle-plus',
      title: 'Daily New Connection (NSC)',
      value: nscDaily.toLocaleString(),
      subHtml: `<span class="badge badge-purple">${sumDaily > 0 ? ((nscDaily / sumDaily) * 100).toFixed(1) : '0'}% Today's Share</span>`
    });

    setKpiCard(4, {
      accent: '#f59e0b',
      icon: 'fa-solid fa-users-gear',
      title: 'Active Field Teams',
      value: `${activeTeams.toLocaleString()} Teams`,
      subHtml: `<span class="badge badge-amber"><i class="fa-solid fa-person-digging"></i> Field Deployments</span>`
    });

    setKpiCard(5, {
      accent: '#06b6d4',
      icon: 'fa-solid fa-gauge-simple-high',
      title: 'Team Output Velocity',
      value: `${avgTeam} <small style="font-size:0.75rem; font-weight:500;">/ Team</small>`,
      subHtml: `<span class="badge badge-cyan"><i class="fa-solid fa-bolt"></i> Avg Meters / Team</span>`
    });

    setKpiCard(6, {
      accent: '#f43f5e',
      icon: 'fa-solid fa-bullseye',
      title: 'Daily Target Run Rate',
      value: `${targetPct}%`,
      subHtml: `<span class="badge badge-rose"><i class="fa-solid fa-flag-checkered"></i> Target: 2,285 / Day</span>`
    });

  } else if (state.activeTab === 'tabUla') {
    // --- ULA METERING TAB CARDS ---
    setKpiCard(1, {
      accent: '#6366f1',
      icon: 'fa-solid fa-arrows-to-dot',
      title: 'Total ULA Identified Scope',
      value: uScope.toLocaleString(),
      subHtml: `<span class="badge badge-indigo"><i class="fa-solid fa-bullseye"></i> Unmetered Consumer Base</span> <span>${circleLabel}</span>`
    });

    setKpiCard(2, {
      accent: '#10b981',
      icon: 'fa-solid fa-circle-check',
      title: 'ULA Replaced / Metered',
      value: uInstalled.toLocaleString(),
      subHtml: `<span class="badge badge-emerald"><i class="fa-solid fa-check-double"></i> ${uPct}% Achieved</span>`
    });

    setKpiCard(3, {
      accent: '#f59e0b',
      icon: 'fa-solid fa-clock-rotate-left',
      title: 'Pending ULA Replacement',
      value: uPending.toLocaleString(),
      subHtml: `<span class="badge badge-amber">${(100 - uPct).toFixed(1)}% Remaining</span>`
    });

    setKpiCard(4, {
      accent: '#0284c7',
      icon: 'fa-solid fa-chart-line',
      title: 'Overall ULA Conversion Rate',
      value: `${uPct}%`,
      subHtml: `<span class="badge badge-cyan"><i class="fa-solid fa-flag-checkered"></i> Scope Converted</span>`
    });

    setKpiCard(5, {
      accent: '#ec4899',
      icon: 'fa-solid fa-bolt',
      title: "Today's ULA Converted",
      value: uToday.toLocaleString(),
      subHtml: `<span class="badge badge-rose"><i class="fa-solid fa-calendar-day"></i> Latest Batch Progress</span>`
    });

    setKpiCard(6, {
      accent: '#8b5cf6',
      icon: 'fa-solid fa-sitemap',
      title: 'ULA Operational Coverage',
      value: isCircleFiltered ? '1 Circle' : '7 Circles',
      subHtml: `<span class="badge badge-purple">26 Divisions • 77 Sub-Divs</span>`
    });

  } else if (state.activeTab === 'tabSearch') {
    // --- SMART METER SEARCH TAB CARDS ---
    setKpiCard(1, {
      accent: '#0284c7',
      icon: 'fa-solid fa-magnifying-glass',
      title: 'Searchable Master Database',
      value: totalMaster.toLocaleString(),
      subHtml: `<span class="badge badge-cyan"><i class="fa-solid fa-database"></i> Live Query Engine</span>`
    });

    setKpiCard(2, {
      accent: '#10b981',
      icon: 'fa-solid fa-fingerprint',
      title: 'Indexed Query Keys',
      value: 'MSN & CA Number',
      subHtml: `<span class="badge badge-emerald">Instant Record Match</span>`
    });

    setKpiCard(3, {
      accent: '#f59e0b',
      icon: 'fa-solid fa-tags',
      title: 'Consumer Tariffs Indexed',
      value: 'DS1D, DS2D, NDS...',
      subHtml: `<span class="badge badge-amber">Domestic, Com., Ind., Ag.</span>`
    });

    setKpiCard(4, {
      accent: '#6366f1',
      icon: 'fa-solid fa-network-wired',
      title: 'Phase Specifications',
      value: '1-PH / 3-PH WC / 4CT',
      subHtml: `<span class="badge badge-indigo">Full Technical Match</span>`
    });

    setKpiCard(5, {
      accent: '#8b5cf6',
      icon: 'fa-solid fa-arrows-rotate',
      title: 'Installation Nature',
      value: 'Replacement & NSC',
      subHtml: `<span class="badge badge-purple">Old Meter vs New Conn</span>`
    });

    setKpiCard(6, {
      accent: '#ec4899',
      icon: 'fa-solid fa-map-location-dot',
      title: 'Hierarchy Coverage',
      value: isCircleFiltered ? '1 Circle' : '7 Circles',
      subHtml: `<span class="badge badge-rose">26 Div &bull; 77 SubDiv &bull; 241 Sec</span>`
    });

  } else {
    // --- CUMULATIVE MASTER ANALYTICS (DEFAULT) ---
    setKpiCard(1, {
      accent: '#0284c7',
      icon: 'fa-solid fa-gauge-high',
      title: 'Cumulative Installed',
      value: totalMaster.toLocaleString(),
      subHtml: `<span class="badge badge-cyan"><i class="fa-solid fa-circle-check"></i> Project Master Total</span> <span>${m.circles || (isCircleFiltered ? 1 : 7)} Circles</span>`
    });

    setKpiCard(2, {
      accent: '#10b981',
      icon: 'fa-solid fa-bolt',
      title: 'Single Phase (1 PH)',
      value: p1.toLocaleString(),
      subHtml: `<span class="badge badge-emerald">${totalMaster > 0 ? ((p1 / totalMaster) * 100).toFixed(2) : '0'}% Discom Share</span>`
    });

    setKpiCard(3, {
      accent: '#f59e0b',
      icon: 'fa-solid fa-network-wired',
      title: 'Three Phase (WC & 4CT)',
      value: p3.toLocaleString(),
      subHtml: `<span class="badge badge-amber">3PH WC: ${Number(m.phase_3ph_wc || 0).toLocaleString()} | 4CT: ${Number(m.phase_3ph_4ct || 0).toLocaleString()}</span>`
    });

    setKpiCard(4, {
      accent: '#6366f1',
      icon: 'fa-solid fa-arrows-rotate',
      title: 'Replacement (OldToSM)',
      value: oldToSm.toLocaleString(),
      subHtml: `<span class="badge badge-indigo">${totalMaster > 0 ? ((oldToSm / totalMaster) * 100).toFixed(2) : '0'}% Discom Share</span>`
    });

    setKpiCard(5, {
      accent: '#8b5cf6',
      icon: 'fa-solid fa-circle-plus',
      title: 'New Connection (NSC)',
      value: nsc.toLocaleString(),
      subHtml: `<span class="badge badge-purple">${totalMaster > 0 ? ((nsc / totalMaster) * 100).toFixed(2) : '0'}% Discom Share</span>`
    });

    setKpiCard(6, {
      accent: '#f43f5e',
      icon: 'fa-solid fa-layer-group',
      title: 'Daily Installation Type',
      value: `${replDaily.toLocaleString()} / ${nscDaily.toLocaleString()}`,
      subHtml: `<span class="badge badge-rose" id="kpiDailyTypeSub">${sumDaily.toLocaleString()} Today's Total</span>`
    });
  }
}

function populateSummaryKpis(json) {
  state.data.summary = json;
  updateKpiCardsForActiveTab();

  // Also update global header pills, badges and timestamps
  const m = json.master || {};
  const d = json.daily || {};
  const replDaily = Number(d.replacement || 0);
  const nscDaily = Number(d.nsc || 0);
  const sumDaily = Number(d.total_daily != null ? d.total_daily : (replDaily + nscDaily));

  if (document.getElementById('scopeDailyCount')) {
    document.getElementById('scopeDailyCount').textContent = `${sumDaily.toLocaleString()} Meters (${d.date || 'Today'})`;
  }
  if (document.getElementById('tabDailyBadge')) {
    document.getElementById('tabDailyBadge').textContent = `${sumDaily.toLocaleString()} Daily`;
  }
  if (document.getElementById('statusPillDaily')) {
    document.getElementById('statusPillDaily').textContent = `${sumDaily.toLocaleString()} Daily Velocity`;
  }
  if (document.getElementById('statusPillText')) {
    document.getElementById('statusPillText').innerHTML = `${Number(m.total || 0).toLocaleString()} Total Installed &bull; <span id="statusPillDaily">${sumDaily.toLocaleString()} Daily Velocity</span>`;
  }
  if (document.getElementById('scopeCumulativeCount')) {
    document.getElementById('scopeCumulativeCount').textContent = `${Number(m.total || 0).toLocaleString()} Smart Meters`;
  }
  if (document.getElementById('mobileScopeTotal')) {
    document.getElementById('mobileScopeTotal').textContent = `${Number(m.total || 0).toLocaleString()} Meters`;
  }
  if (document.getElementById('scopeReportDownloadTime')) {
    const dlTime = json.report_download_time || json.daily_download_time || '2026-10-12 13:47:24';
    document.getElementById('scopeReportDownloadTime').textContent = `${dlTime} IST`;
  }
  if (document.getElementById('mobileReportDownloadTime')) {
    const dlTime = json.report_download_time || json.daily_download_time || '2026-10-12 13:47:24';
    document.getElementById('mobileReportDownloadTime').textContent = `${dlTime.substring(5, 16)} IST`;
  }
}

// --- TAB 1: CUMULATIVE TABLES & CHARTS ---
async function loadCumulativeTable() {
  const container = document.getElementById('cumulativeTableContainer');
  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading DuckDB analytics...</div>';

  try {
    const params = new URLSearchParams({
      type: state.activeCumType,
      date_mode: state.dateMode,
      month: state.selectedMonth,
      start: state.startDate,
      end: state.endDate
    });
    if (state.activeCircle && state.activeCircle !== 'ALL') {
      params.append('circle', state.activeCircle);
    }

    const res = await fetch(`/api/cumulative/table?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      state.data.cumulative = json;
      renderCumulativeTable();
    }
  } catch (err) {
    container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load data: ${err.message}</div>`;
  }
}

function renderCumulativeTable() {
  const container = document.getElementById('cumulativeTableContainer');
  const data = state.data.cumulative;
  if (!data || !data.rows) return;

  const type = state.activeCumType;
  const selectCumType = document.getElementById('selectCumulativeType');
  if (selectCumType && selectCumType.value !== type) {
    selectCumType.value = type;
  }
  const q = state.searchFilters.cumulative;
  let rows = data.rows.slice();

  // Search filter
  if (q) {
    rows = rows.filter(r => {
      return Object.values(r).some(val => String(val).toLowerCase().includes(q));
    });
  }

  const titles = {
    circle: 'Circle Wise Summary Table (All 7 Circles)',
    division: 'Division Wise Summary Table (26 Operational Divisions)',
    subdivision: 'Sub-Division Wise Summary Table (77 Sub-Divisions)',
    section: 'Section Wise Summary Table (241 Sections)',
    agency: 'Agency Wise Footprint & Deployment (74 Agencies)',
    phase: 'Phase Wise Installation Matrix (1 PH vs 3PH WC vs 3PH 4CT)',
    tariff: 'Consumer Tariff Category Installation Matrix',
    installation_type: 'Installation Type Wise Installation Matrix (OldToSM vs NSC)'
  };
  document.getElementById('cumulativeTableTitle').textContent = titles[type] || 'Summary Table';
  document.getElementById('cumulativeTableRowCount').textContent = `${rows.length} Rows (${data.total_records.toLocaleString()} Meters)`;

  if (type === 'circle') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumCircle">
        <thead>
          <tr>
            <th>Circle Name</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">1 Phase (1 PH)</th>
            <th class="text-right">3 Phase WC</th>
            <th class="text-right">3 Phase 4CT</th>
            <th class="text-right">DS1D (Dom. R)</th>
            <th class="text-right">NDS1D</th>
            <th class="text-right">KJ (BPL)</th>
            <th class="text-right">DS2D (Dom. U)</th>
            <th class="text-right">Divisions</th>
            <th class="text-right">Discom Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.circle}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right" style="color: #10b981;">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right" style="color: #0284c7;">${r.phase_3ph_wc.toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b;">${r.phase_3ph_4ct.toLocaleString()}</td>
              <td class="text-right">${(r.ds1d || 0).toLocaleString()}</td>
              <td class="text-right">${(r.nds1d || 0).toLocaleString()}</td>
              <td class="text-right">${(r.kj || 0).toLocaleString()}</td>
              <td class="text-right">${(r.ds2d || 0).toLocaleString()}</td>
              <td class="text-right">${r.divisions}</td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>SBPDCL DISCOM TOTAL</strong></td>
            <td class="text-right"><strong>${data.total_records.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_1ph||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_3ph_wc||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_3ph_4ct||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.ds1d||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.nds1d||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.kj||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.ds2d||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>26</strong></td>
            <td class="text-right"><strong>100.0%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (type === 'division') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumDiv">
        <thead>
          <tr>
            <th>Division Name</th>
            <th>Parent Circle</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">1 Phase (1 PH)</th>
            <th class="text-right">3 Phase WC</th>
            <th class="text-right">3 Phase 4CT</th>
            <th class="text-right">DS1D (Dom. R)</th>
            <th class="text-right">NDS1D</th>
            <th class="text-right">KJ (BPL)</th>
            <th class="text-right">Sub-Divisions</th>
            <th class="text-right">Sections</th>
            <th class="text-right">Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.division}</strong></td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right" style="color: #10b981;">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph_wc.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph_4ct.toLocaleString()}</td>
              <td class="text-right">${(r.ds1d || 0).toLocaleString()}</td>
              <td class="text-right">${(r.nds1d || 0).toLocaleString()}</td>
              <td class="text-right">${(r.kj || 0).toLocaleString()}</td>
              <td class="text-right">${r.subdivisions}</td>
              <td class="text-right">${r.sections}</td>
              <td class="text-right"><span class="badge badge-purple">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'subdivision') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumSubDiv">
        <thead>
          <tr>
            <th>Sub-Division Name</th>
            <th>Parent Division</th>
            <th>Parent Circle</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">1 Phase</th>
            <th class="text-right">3 Phase WC</th>
            <th class="text-right">3 Phase 4CT</th>
            <th class="text-right">Sections</th>
            <th class="text-right">Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.subdivision}</strong></td>
              <td>${r.division}</td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph_wc.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph_4ct.toLocaleString()}</td>
              <td class="text-right">${r.sections}</td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'section') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumSection">
        <thead>
          <tr>
            <th>Section Name</th>
            <th>Sub-Division</th>
            <th>Division</th>
            <th>Circle</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">1 Phase</th>
            <th class="text-right">3 Phase WC</th>
            <th class="text-right">DS1D</th>
            <th class="text-right">Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.section}</strong></td>
              <td>${r.subdivision}</td>
              <td>${r.division}</td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph_wc.toLocaleString()}</td>
              <td class="text-right">${(r.ds1d||0).toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'agency') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumAgency">
        <thead>
          <tr>
            <th>Agency Name</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">Field Technicians</th>
            <th class="text-right">Circles Active</th>
            <th class="text-right">Divisions Active</th>
            <th class="text-right">1 Phase</th>
            <th class="text-right">3 Phase</th>
            <th class="text-right">Discom Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.agency}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right">${r.installers.toLocaleString()}</td>
              <td class="text-right">${r.circles}</td>
              <td class="text-right">${r.divisions}</td>
              <td class="text-right">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right">${(r.phase_3ph_wc + r.phase_3ph_4ct).toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-emerald">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'phase') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumPhase">
        <thead>
          <tr>
            <th>Phase Specification</th>
            <th class="text-right">Total Meters Installed</th>
            <th class="text-right">Share (%)</th>
            <th class="text-right">GAYA</th>
            <th class="text-right">Patna</th>
            <th class="text-right">BIHARSARIF</th>
            <th class="text-right">ARRAH</th>
            <th class="text-right">SASARAM</th>
            <th class="text-right">AURANGABAD</th>
            <th class="text-right">MUNGER</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.phase}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
              <td class="text-right">${r.gaya.toLocaleString()}</td>
              <td class="text-right">${r.patna.toLocaleString()}</td>
              <td class="text-right">${r.biharsarif.toLocaleString()}</td>
              <td class="text-right">${r.arrah.toLocaleString()}</td>
              <td class="text-right">${r.sasaram.toLocaleString()}</td>
              <td class="text-right">${r.aurangabad.toLocaleString()}</td>
              <td class="text-right">${r.munger.toLocaleString()}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'tariff') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumTariff">
        <thead>
          <tr>
            <th>Consumer Tariff Code</th>
            <th class="text-right">Total Meters Installed</th>
            <th class="text-right">Discom Share (%)</th>
            <th class="text-right">1 Phase (1 PH)</th>
            <th class="text-right">3 Phase (WC & 4CT)</th>
            <th class="text-right">Circles Active</th>
            <th class="text-right">Divisions Active</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.tariff || 'UNCLASSIFIED / OTHER'}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${(r.total || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-purple">${r.pct_share || 0}%</span></td>
              <td class="text-right">${(r.phase_1ph || 0).toLocaleString()}</td>
              <td class="text-right">${((r.phase_3ph_wc || 0) + (r.phase_3ph_4ct || 0)).toLocaleString()}</td>
              <td class="text-right">${r.circles || 0}</td>
              <td class="text-right">${r.divisions || 0}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'installation_type') {
    container.innerHTML = `
      <table class="styled-table" id="tableCumInstallType">
        <thead>
          <tr>
            <th>Installation Type</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">Discom Share (%)</th>
            <th class="text-right">1 Phase (1 PH)</th>
            <th class="text-right">3 Phase WC</th>
            <th class="text-right">3 Phase 4CT</th>
            <th class="text-right">DS1D (Dom. R)</th>
            <th class="text-right">NDS1D</th>
            <th class="text-right">KJ (BPL)</th>
            <th class="text-right">DS2D</th>
            <th class="text-right">Divisions</th>
            <th class="text-right">Agencies</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.installation_type === 'OldToSM' ? 'OldToSM (Old Meter Replacement)' : (r.installation_type === 'NSC' ? 'NSC (New Service Connection)' : r.installation_type)}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right"><span class="badge ${r.installation_type === 'OldToSM' ? 'badge-indigo' : 'badge-purple'}">${r.pct_share}%</span></td>
              <td class="text-right" style="color: #10b981;">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right" style="color: #0284c7;">${r.phase_3ph_wc.toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b;">${r.phase_3ph_4ct.toLocaleString()}</td>
              <td class="text-right">${(r.ds1d || 0).toLocaleString()}</td>
              <td class="text-right">${(r.nds1d || 0).toLocaleString()}</td>
              <td class="text-right">${(r.kj || 0).toLocaleString()}</td>
              <td class="text-right">${(r.ds2d || 0).toLocaleString()}</td>
              <td class="text-right">${r.divisions}</td>
              <td class="text-right">${r.agencies}</td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>SBPDCL DISCOM TOTAL</strong></td>
            <td class="text-right"><strong>${data.total_records.toLocaleString()}</strong></td>
            <td class="text-right"><strong>100.0%</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_1ph||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_3ph_wc||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_3ph_4ct||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.ds1d||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.nds1d||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.kj||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.ds2d||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>26</strong></td>
            <td class="text-right"><strong>74</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  }
}

async function loadCumulativeTrends() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  try {
    const circleParam = (state.activeCircle && state.activeCircle !== 'ALL') ? `&circle=${encodeURIComponent(state.activeCircle)}` : '';
    const res = await fetch(`/api/cumulative/trends?grain=monthly${circleParam}`);
    const json = await res.json();
    if (json.success && json.trends) {
      const canvas = document.getElementById('chartCumulativeTrend');
      if (canvas) {
        if (state.charts.cumTrend) state.charts.cumTrend.destroy();
        const ctx = canvas.getContext('2d');
        state.charts.cumTrend = new Chart(ctx, {
          type: 'bar',
          data: {
            labels: json.trends.map(t => t.period),
            datasets: [{
              label: 'Meters Installed',
              data: json.trends.map(t => t.count),
              backgroundColor: '#0284c7',
              borderRadius: 4
            }]
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { ticks: { color: textColor, maxRotation: 45 }, grid: { display: false } },
              y: { ticks: { color: textColor, callback: v => (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: gridColor } }
            },
            plugins: {
              legend: { display: false },
              tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()} meters installed` } }
            }
          }
        });
      }
    }
  } catch (err) {
    console.error('Error loading trends:', err);
  }

  // Circle Donut
  const circleCanvas = document.getElementById('chartCumulativeCircle');
  if (circleCanvas) {
    if (state.charts.cumCircle) state.charts.cumCircle.destroy();
    const ctx = circleCanvas.getContext('2d');
    state.charts.cumCircle = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['GAYA', 'Patna', 'BIHARSARIF', 'ARRAH', 'SASARAM', 'AURANGABAD', 'MUNGER'],
        datasets: [{
          data: [236356, 199581, 171874, 159444, 140322, 115198, 101247],
          backgroundColor: PALETTES.circles,
          borderColor: isDark ? '#0d1b2e' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'right', labels: { color: textColor, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} meters (${((ctx.parsed/1124022)*100).toFixed(1)}%)` } }
        }
      }
    });
  }

  // Phase Donut
  const phaseCanvas = document.getElementById('chartCumulativePhase');
  if (phaseCanvas) {
    if (state.charts.cumPhase) state.charts.cumPhase.destroy();
    const ctx = phaseCanvas.getContext('2d');
    state.charts.cumPhase = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['1 Phase (1 PH)', '3 Phase WC', '3 Phase 4CT'],
        datasets: [{
          data: [1080325, 41982, 1715],
          backgroundColor: PALETTES.phases,
          borderColor: isDark ? '#0d1b2e' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { position: 'bottom', labels: { color: textColor, font: { size: 11 } } },
          tooltip: { callbacks: { label: ctx => ` ${ctx.label}: ${ctx.parsed.toLocaleString()} meters` } }
        }
      }
    });
  }

  // Tariff Bar Chart
  const tariffCanvas = document.getElementById('chartCumulativeTariff');
  if (tariffCanvas) {
    if (state.charts.cumTariff) state.charts.cumTariff.destroy();
    const ctx = tariffCanvas.getContext('2d');
    state.charts.cumTariff = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['DS1D', 'NDS1D', 'KJ', 'DS2D', 'NDS2D', 'LTIS1D', 'HGN', 'KJ_BPL', 'IAS1'],
        datasets: [{
          label: 'Meters',
          data: [663723, 156798, 101288, 93473, 38566, 27174, 20908, 11493, 4284],
          backgroundColor: PALETTES.tariffs,
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, font: { weight: 600 } }, grid: { display: false } },
          y: { ticks: { color: textColor, callback: v => (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: gridColor } }
        },
        plugins: {
          legend: { display: false },
          tooltip: { callbacks: { label: ctx => ` ${ctx.parsed.y.toLocaleString()} meters` } }
        }
      }
    });
  }
}

// --- TAB 2: DAILY TABLES & CHARTS ---
async function loadDailyTable() {
  const container = document.getElementById('dailyTableContainer');
  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading daily batch reports...</div>';

  try {
    const circleParam = (state.activeCircle && state.activeCircle !== 'ALL') ? `&circle=${encodeURIComponent(state.activeCircle)}` : '';
    const res = await fetch(`/api/daily/table?type=${state.activeDailyType}${circleParam}`);
    const json = await res.json();
    if (json.success) {
      state.data.daily = json;
      renderDailyTable();
      renderDailyCharts();
    }
  } catch (err) {
    container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load daily data: ${err.message}</div>`;
  }
}

function renderDailyTable() {
  const container = document.getElementById('dailyTableContainer');
  const data = state.data.daily;
  if (!data || !data.rows) return;

  const type = state.activeDailyType;
  const selectDailyType = document.getElementById('selectDailyType');
  if (selectDailyType && selectDailyType.value !== type) {
    selectDailyType.value = type;
  }
  const q = state.searchFilters.daily;
  let rows = data.rows.slice();

  if (q) {
    rows = rows.filter(r => Object.values(r).some(val => String(val).toLowerCase().includes(q)));
  }

  const titles = {
    circle: 'Circle Wise Daily Installation Table (7 Operational Circles)',
    division: 'Division Wise Daily Installation Table (26 Divisions)',
    section: 'Section Wise Daily Installation Table (222 Active Sections)',
    agency: 'Agency Wise Daily Performance & Team Productivity',
    phase: 'Phase Wise Daily Output (1 PH vs 3 PH)',
    tariff: 'Consumer Tariff Category Daily Distribution',
    teams: 'Field Team Availability & Daily Leaderboard (448 Teams)'
  };
  document.getElementById('dailyTableTitle').textContent = titles[type] || 'Daily Summary Table';
  document.getElementById('dailyTableRowCount').textContent = `${rows.length} Rows (${(data.total_records || rows.reduce((a,c) => a + (c.total||0), 0)).toLocaleString()} Daily Meters)`;

  if (type === 'circle') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailyCircle">
        <thead>
          <tr>
            <th>Circle Name</th>
            <th class="text-right">Total Installs</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC New</th>
            <th class="text-right">Active Teams</th>
            <th class="text-right">Productivity (M/Team)</th>
            <th class="text-right">1 Phase</th>
            <th class="text-right">3 Phase</th>
            <th class="text-right">Daily Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.circle}</strong></td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right" style="color: #0284c7;">${r.replacement.toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b;">${r.nsc.toLocaleString()}</td>
              <td class="text-right">${r.teams}</td>
              <td class="text-right"><strong>${r.avg_per_team}</strong></td>
              <td class="text-right">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph.toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-emerald">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>${(state.activeCircle && state.activeCircle !== 'ALL') ? state.activeCircle + ' CIRCLE TOTAL' : 'SBPDCL DISCOM TOTAL'}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.total || ((c.replacement||0) + (c.nsc||0))), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.replacement||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.nsc||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.teams||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${(rows.reduce((a,c) => a + (c.teams||0), 0) > 0 ? (rows.reduce((a,c) => a + (c.total||0), 0) / rows.reduce((a,c) => a + (c.teams||0), 0)).toFixed(1) : '0.0')}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_1ph||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_3ph||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>100.0%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (type === 'division') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailyDiv">
        <thead>
          <tr>
            <th>Division Name</th>
            <th>Parent Circle</th>
            <th class="text-right">Total Installs</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC New</th>
            <th class="text-right">Active Teams</th>
            <th class="text-right">Productivity (M/Team)</th>
            <th class="text-right">1 Phase</th>
            <th class="text-right">3 Phase</th>
            <th class="text-right">Daily Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.division}</strong></td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right" style="color: #0284c7;">${r.replacement.toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b;">${r.nsc.toLocaleString()}</td>
              <td class="text-right">${r.teams}</td>
              <td class="text-right"><strong>${r.avg_per_team}</strong></td>
              <td class="text-right">${r.phase_1ph.toLocaleString()}</td>
              <td class="text-right">${r.phase_3ph.toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-emerald">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>TOTAL (${rows.length} DIVISIONS)</strong></td>
            <td><strong>${(state.activeCircle && state.activeCircle !== 'ALL') ? state.activeCircle + ' CIRCLE' : 'ALL 7 CIRCLES'}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.total || ((c.replacement||0) + (c.nsc||0))), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.replacement||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.nsc||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.teams||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${(rows.reduce((a,c) => a + (c.teams||0), 0) > 0 ? (rows.reduce((a,c) => a + (c.total||0), 0) / rows.reduce((a,c) => a + (c.teams||0), 0)).toFixed(1) : '0.0')}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_1ph||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>${rows.reduce((a,c) => a + (c.phase_3ph||0), 0).toLocaleString()}</strong></td>
            <td class="text-right"><strong>100.0%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (type === 'section') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailySection">
        <thead>
          <tr>
            <th>Section Name</th>
            <th>Division</th>
            <th>Circle</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC New</th>
            <th class="text-right">Active Teams</th>
            <th class="text-right">Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.section}</strong></td>
              <td>${r.division}</td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right">${r.replacement.toLocaleString()}</td>
              <td class="text-right">${r.nsc.toLocaleString()}</td>
              <td class="text-right">${r.teams}</td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'agency') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailyAgency">
        <thead>
          <tr>
            <th>Agency Code</th>
            <th class="text-right">Total Meters Installed</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC New</th>
            <th class="text-right">Field Teams Deployed</th>
            <th class="text-right">Productivity (Meters / Team)</th>
            <th class="text-right">Daily Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.agency}</strong></td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right">${r.replacement.toLocaleString()}</td>
              <td class="text-right">${r.nsc.toLocaleString()}</td>
              <td class="text-right">${r.teams}</td>
              <td class="text-right"><strong>${r.avg_per_team}</strong></td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'phase') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailyPhase">
        <thead>
          <tr>
            <th>Phase Specification</th>
            <th class="text-right">Total Meters</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC New</th>
            <th class="text-right">Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.phase}</strong></td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${r.total.toLocaleString()}</td>
              <td class="text-right">${r.replacement.toLocaleString()}</td>
              <td class="text-right">${r.nsc.toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-cyan">${r.pct_share}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'tariff') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailyTariff">
        <thead>
          <tr>
            <th>Tariff Category</th>
            <th class="text-right">Total Installed</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC New</th>
            <th class="text-right">Daily Share (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.tariff || 'UNCLASSIFIED / OTHER'}</strong></td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${(r.total || 0).toLocaleString()}</td>
              <td class="text-right">${(r.replacement || 0).toLocaleString()}</td>
              <td class="text-right">${(r.nsc || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-purple">${r.pct_share || 0}%</span></td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } else if (type === 'teams') {
    container.innerHTML = `
      <table class="styled-table" id="tableDailyTeams">
        <thead>
          <tr>
            <th>Field Login ID</th>
            <th>Agency</th>
            <th>Circle</th>
            <th>Division</th>
            <th class="text-right">Total Installed Today</th>
            <th class="text-right">Replacement</th>
            <th class="text-right">NSC</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.login_id}</strong></td>
              <td><span class="badge badge-emerald">${r.agency}</span></td>
              <td>${r.circle}</td>
              <td>${r.division}</td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${r.total_installed}</td>
              <td class="text-right">${r.replacement}</td>
              <td class="text-right">${r.nsc}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  }
}

function renderDailyCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  // Daily Divisions Bar
  const divCanvas = document.getElementById('chartDailyDivisions');
  if (divCanvas) {
    if (state.charts.dailyDiv) state.charts.dailyDiv.destroy();
    const ctx = divCanvas.getContext('2d');
    state.charts.dailyDiv = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['BUXAR', 'JAHANABAD', 'SASARAM', 'JAGDISHPUR', 'SHERGHATI', 'FATUHA', 'GAYA RURAL', 'MANPUR', 'LAKHISARAI', 'ARRAH'],
        datasets: [{
          label: 'Daily Installs',
          data: [298, 238, 232, 227, 216, 212, 210, 204, 182, 178],
          backgroundColor: '#10b981',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor, font: { size: 10 } }, grid: { display: false } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Daily Agencies Bar
  const agCanvas = document.getElementById('chartDailyAgencies');
  if (agCanvas) {
    if (state.charts.dailyAg) state.charts.dailyAg.destroy();
    const ctx = agCanvas.getContext('2d');
    state.charts.dailyAg = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: ['AEWS', 'SMRT', 'PCI', 'ST', 'SSC', 'SIV', 'HPL', 'SAWNA', 'JMT'],
        datasets: [{
          label: 'Installed',
          data: [2017, 834, 432, 153, 140, 136, 119, 111, 105],
          backgroundColor: '#00a3e0',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { ticks: { color: textColor }, grid: { color: gridColor } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // Type Donut
  const typeCanvas = document.getElementById('chartDailyType');
  if (typeCanvas) {
    if (state.charts.dailyType) state.charts.dailyType.destroy();
    const ctx = typeCanvas.getContext('2d');
    state.charts.dailyType = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: ['Replacement (63.9%)', 'NSC New (36.1%)'],
        datasets: [{
          data: [2585, 1463],
          backgroundColor: ['#0284c7', '#f59e0b'],
          borderColor: isDark ? '#0d1b2e' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'bottom', labels: { color: textColor } } }
      }
    });
  }
}

// --- TAB 3: ULA METERING TRACKER ---
async function loadUlaTable() {
  const container = document.getElementById('ulaTableContainer');
  container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading ULA Scope & Progress...</div>';

  try {
    const circleParam = (state.activeCircle && state.activeCircle !== 'ALL') ? `&circle=${encodeURIComponent(state.activeCircle)}` : '';
    const res = await fetch(`/api/ula/table?type=${state.activeUlaType}${circleParam}`);
    const json = await res.json();
    if (json.success) {
      state.data.ula = json;
      renderUlaTable();
      renderUlaCharts();
    }
  } catch (err) {
    container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load ULA data: ${err.message}</div>`;
  }
}

function renderUlaTable() {
  const container = document.getElementById('ulaTableContainer');
  const data = state.data.ula;
  if (!data || !data.rows) return;

  const type = state.activeUlaType;
  const selectUlaType = document.getElementById('selectUlaType');
  if (selectUlaType && selectUlaType.value !== type) {
    selectUlaType.value = type;
  }
  const q = state.searchFilters.ula;
  let rows = data.rows.slice();

  if (q) {
    rows = rows.filter(r => Object.values(r).some(val => String(val).toLowerCase().includes(q)));
  }

  const titles = {
    circle: 'Circle Wise ULA Metering Scope & Installation Progress',
    division: 'Division Wise ULA Scope & Execution Progress',
    agency: 'Agency Wise ULA Deployment & Completion'
  };
  document.getElementById('ulaTableTitle').textContent = titles[type] || 'ULA Progress Table';
  document.getElementById('ulaTableRowCount').textContent = `${rows.length} Rows (91,033 ULA Scope)`;

  const totalScope = rows.reduce((a,c) => a + (Number(c.scope) || 0), 0);
  const totalCum = rows.reduce((a,c) => a + (Number(c.cumulative_installed) || 0), 0);
  const totalToday = rows.reduce((a,c) => a + (Number(c.today_installed) || 0), 0);
  const totalPending = rows.reduce((a,c) => a + (Number(c.pending) || 0), 0);
  const totalRate = totalScope > 0 ? (totalCum * 100 / totalScope).toFixed(2) : '0.00';

  if (type === 'circle') {
    container.innerHTML = `
      <table class="styled-table" id="tableUlaCircle">
        <thead>
          <tr>
            <th>Circle Name</th>
            <th class="text-right">Total ULA Scope</th>
            <th class="text-right">Cumulative Installed</th>
            <th class="text-right">Today's Daily Installed</th>
            <th class="text-right">Pending Scope</th>
            <th class="text-right">Completion Rate (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.circle}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${Number(r.scope || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${Number(r.cumulative_installed || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b; font-weight:700;">${Number(r.today_installed || 0).toLocaleString()}</td>
              <td class="text-right" style="color: var(--text-muted);">${Number(r.pending || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge ${r.completion_pct > 2 ? 'badge-emerald' : 'badge-amber'}">${r.completion_pct}%</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>TOTAL ULA DISCOM SCOPE</strong></td>
            <td class="text-right"><strong>${totalScope.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalCum.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalToday.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalPending.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalRate}%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (type === 'division') {
    container.innerHTML = `
      <table class="styled-table" id="tableUlaDiv">
        <thead>
          <tr>
            <th>Division Name</th>
            <th>Parent Circle</th>
            <th class="text-right">Total ULA Scope</th>
            <th class="text-right">Cumulative Installed</th>
            <th class="text-right">Today's Daily Installed</th>
            <th class="text-right">Pending Scope</th>
            <th class="text-right">Completion Rate (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.division}</strong></td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${Number(r.scope || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #10b981;">${Number(r.cumulative_installed || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b;">${Number(r.today_installed || 0).toLocaleString()}</td>
              <td class="text-right">${Number(r.pending || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-purple">${r.completion_pct}%</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>TOTAL (${rows.length} DIVISIONS)</strong></td>
            <td>-</td>
            <td class="text-right"><strong>${totalScope.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalCum.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalToday.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalPending.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalRate}%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  } else if (type === 'agency') {
    container.innerHTML = `
      <table class="styled-table" id="tableUlaAgency">
        <thead>
          <tr>
            <th>Agency Code</th>
            <th class="text-right">Assigned Scope</th>
            <th class="text-right">Cumulative Installed</th>
            <th class="text-right">Today's Installed</th>
            <th class="text-right">Pending Scope</th>
            <th class="text-right">Completion Rate (%)</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong>${r.agency}</strong></td>
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${Number(r.scope || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #10b981;">${Number(r.cumulative_installed || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b;">${Number(r.today_installed || 0).toLocaleString()}</td>
              <td class="text-right">${Number(r.pending || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge badge-emerald">${r.completion_pct}%</span></td>
            </tr>
          `).join('')}
        </tbody>
        <tfoot>
          <tr class="table-total-row">
            <td><strong>TOTAL (${rows.length} AGENCIES)</strong></td>
            <td class="text-right"><strong>${totalScope.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalCum.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalToday.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalPending.toLocaleString()}</strong></td>
            <td class="text-right"><strong>${totalRate}%</strong></td>
          </tr>
        </tfoot>
      </table>
    `;
  }
}

function renderUlaCharts() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  let circleData = [];
  if (state.data.ula && state.data.ula.rows) {
    if (state.activeUlaType === 'circle') {
      circleData = state.data.ula.rows;
    } else {
      const map = {};
      state.data.ula.rows.forEach(r => {
        const c = r.circle || 'UNKNOWN';
        if (!map[c]) map[c] = { circle: c, scope: 0, cumulative_installed: 0, pending: 0 };
        map[c].scope += (Number(r.scope) || 0);
        map[c].cumulative_installed += (Number(r.cumulative_installed) || 0);
        map[c].pending += (Number(r.pending) || 0);
      });
      circleData = Object.values(map);
    }
  }

  const labels = circleData.map(r => r.circle);
  const completed = circleData.map(r => r.cumulative_installed || 0);
  const pending = circleData.map(r => r.pending || 0);
  const scopes = circleData.map(r => r.scope || 0);
  const totalScopeSum = scopes.reduce((a, b) => a + b, 0) || 1;

  const progCanvas = document.getElementById('chartUlaProgress');
  if (progCanvas && labels.length > 0) {
    if (state.charts.ulaProg) state.charts.ulaProg.destroy();
    const ctx = progCanvas.getContext('2d');
    state.charts.ulaProg = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: labels,
        datasets: [
          { label: 'Completed', data: completed, backgroundColor: '#10b981' },
          { label: 'Pending Scope', data: pending, backgroundColor: '#8b5cf6' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: textColor }, grid: { display: false } },
          y: { stacked: true, ticks: { color: textColor, callback: v => (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: gridColor } }
        },
        plugins: { legend: { position: 'top', labels: { color: textColor } } }
      }
    });
  }

  const shareCanvas = document.getElementById('chartUlaShare');
  if (shareCanvas && labels.length > 0) {
    if (state.charts.ulaShare) state.charts.ulaShare.destroy();
    const ctx = shareCanvas.getContext('2d');
    const shareLabels = circleData.map(r => `${r.circle} (${((r.scope * 100) / totalScopeSum).toFixed(1)}%)`);
    state.charts.ulaShare = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: shareLabels,
        datasets: [{
          data: scopes,
          backgroundColor: PALETTES.circles,
          borderColor: isDark ? '#0d1b2e' : '#ffffff',
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { position: 'right', labels: { color: textColor, font: { size: 10 } } } }
      }
    });
  }
}

// --- TAB 4: SEARCH ---
function setupSearch() {
  const btn = document.getElementById('btnExecuteSearch');
  const input = document.getElementById('inputGlobalSearch');

  const doSearch = async () => {
    const q = input.value.trim();
    if (!q || q.length < 3) return;
    const container = document.getElementById('searchResultsContainer');
    container.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fa-solid fa-spinner fa-spin"></i> Searching 1.124M master records...</div>';

    try {
      const res = await fetch(`/api/search?q=${encodeURIComponent(q)}`);
      const json = await res.json();
      if (json.success && json.results) {
        if (json.results.length === 0) {
          container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-muted);">No records found matching query.</div>';
          return;
        }

        container.innerHTML = `
          <table class="styled-table">
            <thead>
              <tr>
                <th>Consumer No</th>
                <th>Consumer Name</th>
                <th>New MSN</th>
                <th>Old MSN</th>
                <th>Phase</th>
                <th>Tariff</th>
                <th>Agency</th>
                <th>Division</th>
                <th>Circle</th>
                <th>Install Date</th>
              </tr>
            </thead>
            <tbody>
              ${json.results.map(r => `
                <tr>
                  <td><strong>${r.consumer_number}</strong></td>
                  <td>${r.consumer_name || '--'}</td>
                  <td style="color: var(--brand-cyan); font-weight:700;">${r.new_msn}</td>
                  <td>${r.old_msn || '--'}</td>
                  <td>${r.phase}</td>
                  <td>${r.tariff}</td>
                  <td><span class="badge badge-emerald">${r.agency}</span></td>
                  <td>${r.division}</td>
                  <td>${r.circle}</td>
                  <td>${r.install_date ? String(r.install_date).substring(0, 10) : '--'}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        `;
      }
    } catch (err) {
      container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Search failed: ${err.message}</div>`;
    }
  };

  btn.addEventListener('click', doSearch);
  input.addEventListener('keypress', (e) => {
    if (e.key === 'Enter') doSearch();
  });
}

// --- CSV EXPORTS ---
function exportCumulativeCsv() {
  const data = state.data.cumulative;
  if (!data || !data.rows || data.rows.length === 0) return;
  const headers = Object.keys(data.rows[0]);
  const rows = data.rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  downloadBlob(csvContent, `SBPDCL_Cumulative_${state.activeCumType}_Summary.csv`);
}

function exportDailyCsv() {
  const data = state.data.daily;
  if (!data || !data.rows || data.rows.length === 0) return;
  const headers = Object.keys(data.rows[0]);
  const rows = data.rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  downloadBlob(csvContent, `SBPDCL_Daily_${state.activeDailyType}_Report.csv`);
}

function exportUlaCsv() {
  const data = state.data.ula;
  if (!data || !data.rows || data.rows.length === 0) return;
  const headers = Object.keys(data.rows[0]);
  const rows = data.rows.map(r => headers.map(h => `"${String(r[h] ?? '').replace(/"/g, '""')}"`).join(','));
  const csvContent = 'data:text/csv;charset=utf-8,' + [headers.join(','), ...rows].join('\n');
  downloadBlob(csvContent, `SBPDCL_ULA_${state.activeUlaType}_Progress.csv`);
}

function downloadBlob(content, filename) {
  const encodedUri = encodeURI(content);
  const link = document.createElement('a');
  link.setAttribute('href', encodedUri);
  link.setAttribute('download', filename);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// --- SEPARATE MDM SYNC CONTROLS ---
function setupSync() {
  const modal = document.getElementById('syncModal');
  const title = document.getElementById('modalSyncTitle');
  const icon = document.getElementById('syncModalIcon');
  const closeBtn = document.getElementById('btnCloseSyncModal');
  const closeActionBtn = document.getElementById('btnModalCloseAction');
  const consoleBox = document.getElementById('syncStepsConsole');
  const progressBar = document.getElementById('syncProgressBar');
  const percentText = document.getElementById('syncPercentText');
  const stageText = document.getElementById('syncCurrentStage');
  const liveIndicator = document.getElementById('syncLiveIndicator');

  closeBtn.addEventListener('click', () => modal.classList.add('hidden'));
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.classList.add('hidden');
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !modal.classList.contains('hidden')) {
      modal.classList.add('hidden');
    }
  });
  if (closeActionBtn) {
    closeActionBtn.addEventListener('click', () => {
      modal.classList.add('hidden');
      setupCircleSlicer();
  loadInitialData();
      if (state.activeTab === 'tabDaily') loadDailyTable();
      else if (state.activeTab === 'tabCumulative') loadCumulativeTable();
      else if (state.activeTab === 'tabUla') loadUlaTable();
    });
  }

  let pollInterval = null;

  async function startSyncFlow(endpoint, syncTitle, syncIconClass, syncType) {
    modal.classList.remove('hidden');
    title.textContent = syncTitle;
    icon.className = syncIconClass + ' fa-spin';
    if (closeActionBtn) closeActionBtn.style.display = 'none';
    progressBar.style.width = '5%';
    percentText.textContent = '5%';
    stageText.innerHTML = '<i class="fa-solid fa-gear fa-spin" style="color: var(--brand-cyan);"></i> Initializing download from MDM portal...';
    liveIndicator.innerHTML = '<i class="fa-solid fa-circle fa-fade"></i> LIVE STREAM';
    liveIndicator.style.color = '#10b981';

    const isCloud = window.location.hostname !== 'localhost' && window.location.hostname !== '127.0.0.1';
    let cloudNotice = '';
    if (isCloud) {
      cloudNotice = `
        <div class="terminal-line" style="color: #38bdf8;">
          <span class="terminal-time">[INFO]</span>
          <span class="terminal-tag active">CLOUD</span>
          <span class="terminal-text">Notice: SBPDCL MDMS security firewalls cloud datacenters (403 Forbidden). For automated downloads, click Sync on your laptop (localhost:8095), which will auto-push the latest data here.</span>
        </div>
      `;
    }

    consoleBox.innerHTML = `
      <div class="terminal-line">
        <span class="terminal-time">[${new Date().toLocaleTimeString()}]</span>
        <span class="terminal-tag active">START</span>
        <span class="terminal-text">Initiated automated download request for ${syncType.toUpperCase()} reports...</span>
      </div>
      ${cloudNotice}
    `;

    try {
      const res = await fetch(endpoint);
      const startJson = await res.json();
    } catch (err) {
      consoleBox.innerHTML += `
        <div class="terminal-line">
          <span class="terminal-time">[${new Date().toLocaleTimeString()}]</span>
          <span class="terminal-tag error">ERROR</span>
          <span class="terminal-text">Failed to contact server endpoint: ${err.message}</span>
        </div>
      `;
    }

    // Start polling status every 600ms
    if (pollInterval) clearInterval(pollInterval);
    let lastRenderedStepsCount = 0;

    pollInterval = setInterval(async () => {
      try {
        const sRes = await fetch('/api/sync/status');
        const sJson = await sRes.json();
        const d = sJson.data || {};

        // Update progress bar & percent
        const pct = Math.min(100, Math.max(5, d.percent || 5));
        progressBar.style.width = pct + '%';
        percentText.textContent = pct + '%';
        stageText.innerHTML = `<i class="fa-solid fa-gear fa-spin" style="color: var(--brand-cyan);"></i> ${d.message || d.stage}`;

        // Render steps
        const steps = d.steps || [];
        if (steps.length > lastRenderedStepsCount) {
          for (let i = lastRenderedStepsCount; i < steps.length; i++) {
            const step = steps[i];
            const tagClass = step.status === 'error' ? 'error' : (step.status === 'success' ? 'ok' : 'active');
            const row = document.createElement('div');
            row.className = 'terminal-line';
            row.innerHTML = `
              <span class="terminal-time">[${step.time || ''}]</span>
              <span class="terminal-tag ${tagClass}">${step.stage || 'STEP'}</span>
              <span class="terminal-text">${step.message || ''}</span>
            `;
            consoleBox.appendChild(row);
          }
          lastRenderedStepsCount = steps.length;
          consoleBox.scrollTop = consoleBox.scrollHeight;
        }

        // Check if finished
        if (d.stage === 'COMPLETE' || pct === 100) {
          clearInterval(pollInterval);
          icon.className = syncIconClass;
          progressBar.style.width = '100%';
          percentText.textContent = '100%';
          stageText.innerHTML = '<i class="fa-solid fa-circle-check" style="color: #10b981;"></i> ' + (d.message || 'Download & Synchronization Complete!');
          liveIndicator.innerHTML = '<i class="fa-solid fa-check"></i> COMPLETE';
          liveIndicator.style.color = '#10b981';
          if (closeActionBtn) closeActionBtn.style.display = 'inline-block';
          
          // Refresh background data
          setupCircleSlicer();
  loadInitialData();
          if (state.activeTab === 'tabDaily') loadDailyTable();
          else if (state.activeTab === 'tabCumulative') loadCumulativeTable();
          else if (state.activeTab === 'tabUla') loadUlaTable();
        } else if (d.stage === 'ERROR') {
          clearInterval(pollInterval);
          icon.className = 'fa-solid fa-triangle-exclamation';
          icon.style.color = '#f43f5e';
          stageText.innerHTML = '<i class="fa-solid fa-triangle-exclamation" style="color: #f43f5e;"></i> ' + (d.error || d.message || 'Sync encountered error');
          liveIndicator.innerHTML = '<i class="fa-solid fa-xmark"></i> FAILED';
          liveIndicator.style.color = '#f43f5e';
          if (closeActionBtn) {
            closeActionBtn.style.display = 'inline-block';
            closeActionBtn.innerHTML = '<i class="fa-solid fa-xmark"></i> Close';
          }
        }
      } catch (pollErr) {
        console.error('Polling error:', pollErr);
      }
    }, 600);
  }

  // 1. Daily Reports Sync Button
  document.getElementById('btnSyncDaily').addEventListener('click', () => {
    startSyncFlow('/api/sync/daily', 'Daily Reports MDM Live Downloader', 'fa-solid fa-cloud-arrow-down', 'Daily Installation');
  });

  // 2. Cumulative Master DB Sync Button
  document.getElementById('btnSyncMaster').addEventListener('click', () => {
    startSyncFlow('/api/sync/master', 'Master Database MDM Live Downloader', 'fa-solid fa-database', 'Master Database');
  });
}

function resizeAllCharts() {
  setTimeout(() => {
    Object.values(state.charts).forEach(c => c && c.resize && c.resize());
  }, 100);
}


function toggleMobileCharts(banner) {
  const nextGrid = banner.nextElementSibling;
  if (nextGrid && nextGrid.classList.contains('charts-grid')) {
    nextGrid.classList.toggle('charts-revealed');
    const isRevealed = nextGrid.classList.contains('charts-revealed');
    banner.querySelector('span').textContent = isRevealed ? 'Hide Visual Analytics & Charts' : 'View Visual Analytics & Charts';
    if (isRevealed && typeof resizeAllCharts === 'function') {
      setTimeout(resizeAllCharts, 100);
    }
  }
}
window.toggleMobileCharts = toggleMobileCharts;
