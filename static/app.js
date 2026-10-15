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
  activeUnsyncType: 'circle',
  activeMeterAvailType: 'circle',
  unsyncFilters: {
    circle: 'ALL',
    division: 'ALL',
    vendor: 'ALL',
    status_vendor: 'ALL',
    aging: 'ALL',
    match_status: 'ALL',
    comm_type: 'ALL',
    meter_type: 'ALL',
    phase: 'ALL'
  },
  meterAvailFilters: {
    circle: 'ALL',
    division: 'ALL',
    vendor: 'ALL',
    status_vendor: 'ALL',
    aging: 'ALL',
    match_status: 'ALL',
    comm_type: 'ALL',
    meter_type: 'ALL',
    phase: 'ALL'
  },
  unsyncPage: 1,
  meterAvailPage: 1,
  unsyncPageLimit: 50,
  meterAvailPageLimit: 50,
  unsyncData: null,
  meterAvailData: null,
  charts: {},
  data: {
    summary: null,
    cumulative: null,
    daily: null,
    ula: null,
    unsync: null,
    meter_available: null
  },
  searchFilters: {
    cumulative: '',
    daily: '',
    ula: '',
    unsync: '',
    meter_available: ''
  },
  sortConfig: {
    cumulative: { col: 'total', dir: 'desc' },
    daily: { col: 'total', dir: 'desc' },
    ula: { col: 'scope', dir: 'desc' },
    unsync: { col: 'total', dir: 'desc' },
    meter_available: { col: 'total', dir: 'desc' }
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
      } else if (targetId === 'tabUnsync') {
        loadUnsyncFilters();
        loadUnsyncDashboard();
      } else if (targetId === 'tabMeterAvailable') {
        loadMeterAvailFilters();
        loadMeterAvailDashboard();
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

  const selectUnsyncType = document.getElementById('selectUnsyncType');
  if (selectUnsyncType) {
    selectUnsyncType.addEventListener('change', (e) => {
      state.activeUnsyncType = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const selectMeterAvailType = document.getElementById('selectMeterAvailType');
  if (selectMeterAvailType) {
    selectMeterAvailType.addEventListener('change', (e) => {
      state.activeMeterAvailType = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  // --- UNSYNC FILTER CONTROLS ---
  const filterUnsyncStatusVendor = document.getElementById('filterUnsyncStatusVendor');
  if (filterUnsyncStatusVendor) {
    filterUnsyncStatusVendor.addEventListener('change', (e) => {
      state.unsyncFilters.status_vendor = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncCircle = document.getElementById('filterUnsyncCircle');
  if (filterUnsyncCircle) {
    filterUnsyncCircle.addEventListener('change', (e) => {
      state.unsyncFilters.circle = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncDivision = document.getElementById('filterUnsyncDivision');
  if (filterUnsyncDivision) {
    filterUnsyncDivision.addEventListener('change', (e) => {
      state.unsyncFilters.division = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncVendor = document.getElementById('filterUnsyncVendor');
  if (filterUnsyncVendor) {
    filterUnsyncVendor.addEventListener('change', (e) => {
      state.unsyncFilters.vendor = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncAging = document.getElementById('filterUnsyncAging');
  if (filterUnsyncAging) {
    filterUnsyncAging.addEventListener('change', (e) => {
      state.unsyncFilters.aging = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncMatch = document.getElementById('filterUnsyncMatch');
  if (filterUnsyncMatch) {
    filterUnsyncMatch.addEventListener('change', (e) => {
      state.unsyncFilters.match_status = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncCommType = document.getElementById('filterUnsyncCommType');
  if (filterUnsyncCommType) {
    filterUnsyncCommType.addEventListener('change', (e) => {
      state.unsyncFilters.comm_type = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncMeterType = document.getElementById('filterUnsyncMeterType');
  if (filterUnsyncMeterType) {
    filterUnsyncMeterType.addEventListener('change', (e) => {
      state.unsyncFilters.meter_type = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const filterUnsyncPhase = document.getElementById('filterUnsyncPhase');
  if (filterUnsyncPhase) {
    filterUnsyncPhase.addEventListener('change', (e) => {
      state.unsyncFilters.phase = e.target.value;
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  const btnResetUnsyncFilters = document.getElementById('btnResetUnsyncFilters');
  if (btnResetUnsyncFilters) {
    btnResetUnsyncFilters.addEventListener('click', () => {
      state.unsyncFilters = { circle: 'ALL', division: 'ALL', vendor: 'ALL', status_vendor: 'ALL', aging: 'ALL', match_status: 'ALL', comm_type: 'ALL', meter_type: 'ALL', phase: 'ALL' };
      if (filterUnsyncStatusVendor) filterUnsyncStatusVendor.value = 'ALL';
      if (filterUnsyncCircle) filterUnsyncCircle.value = 'ALL';
      if (filterUnsyncDivision) filterUnsyncDivision.value = 'ALL';
      if (filterUnsyncVendor) filterUnsyncVendor.value = 'ALL';
      if (filterUnsyncAging) filterUnsyncAging.value = 'ALL';
      if (filterUnsyncMatch) filterUnsyncMatch.value = 'ALL';
      if (filterUnsyncCommType) filterUnsyncCommType.value = 'ALL';
      if (filterUnsyncMeterType) filterUnsyncMeterType.value = 'ALL';
      if (filterUnsyncPhase) filterUnsyncPhase.value = 'ALL';
      const s = document.getElementById('searchUnsync');
      if (s) s.value = '';
      state.searchFilters.unsync = '';
      state.unsyncPage = 1;
      loadUnsyncDashboard();
    });
  }

  // --- METER AVAILABLE FILTER CONTROLS ---
  const filterMeterAvailStatusVendor = document.getElementById('filterMeterAvailStatusVendor');
  if (filterMeterAvailStatusVendor) {
    filterMeterAvailStatusVendor.addEventListener('change', (e) => {
      state.meterAvailFilters.status_vendor = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailCircle = document.getElementById('filterMeterAvailCircle');
  if (filterMeterAvailCircle) {
    filterMeterAvailCircle.addEventListener('change', (e) => {
      state.meterAvailFilters.circle = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailDivision = document.getElementById('filterMeterAvailDivision');
  if (filterMeterAvailDivision) {
    filterMeterAvailDivision.addEventListener('change', (e) => {
      state.meterAvailFilters.division = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailVendor = document.getElementById('filterMeterAvailVendor');
  if (filterMeterAvailVendor) {
    filterMeterAvailVendor.addEventListener('change', (e) => {
      state.meterAvailFilters.vendor = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailAging = document.getElementById('filterMeterAvailAging');
  if (filterMeterAvailAging) {
    filterMeterAvailAging.addEventListener('change', (e) => {
      state.meterAvailFilters.aging = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailMatch = document.getElementById('filterMeterAvailMatch');
  if (filterMeterAvailMatch) {
    filterMeterAvailMatch.addEventListener('change', (e) => {
      state.meterAvailFilters.match_status = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailCommType = document.getElementById('filterMeterAvailCommType');
  if (filterMeterAvailCommType) {
    filterMeterAvailCommType.addEventListener('change', (e) => {
      state.meterAvailFilters.comm_type = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailMeterType = document.getElementById('filterMeterAvailMeterType');
  if (filterMeterAvailMeterType) {
    filterMeterAvailMeterType.addEventListener('change', (e) => {
      state.meterAvailFilters.meter_type = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const filterMeterAvailPhase = document.getElementById('filterMeterAvailPhase');
  if (filterMeterAvailPhase) {
    filterMeterAvailPhase.addEventListener('change', (e) => {
      state.meterAvailFilters.phase = e.target.value;
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
    });
  }

  const btnResetMeterAvailFilters = document.getElementById('btnResetMeterAvailFilters');
  if (btnResetMeterAvailFilters) {
    btnResetMeterAvailFilters.addEventListener('click', () => {
      state.meterAvailFilters = { circle: 'ALL', division: 'ALL', vendor: 'ALL', status_vendor: 'ALL', aging: 'ALL', match_status: 'ALL', comm_type: 'ALL', meter_type: 'ALL', phase: 'ALL' };
      if (filterMeterAvailStatusVendor) filterMeterAvailStatusVendor.value = 'ALL';
      if (filterMeterAvailCircle) filterMeterAvailCircle.value = 'ALL';
      if (filterMeterAvailDivision) filterMeterAvailDivision.value = 'ALL';
      if (filterMeterAvailVendor) filterMeterAvailVendor.value = 'ALL';
      if (filterMeterAvailAging) filterMeterAvailAging.value = 'ALL';
      if (filterMeterAvailMatch) filterMeterAvailMatch.value = 'ALL';
      if (filterMeterAvailCommType) filterMeterAvailCommType.value = 'ALL';
      if (filterMeterAvailMeterType) filterMeterAvailMeterType.value = 'ALL';
      if (filterMeterAvailPhase) filterMeterAvailPhase.value = 'ALL';
      const s = document.getElementById('searchMeterAvail');
      if (s) s.value = '';
      state.searchFilters.meter_available = '';
      state.meterAvailPage = 1;
      loadMeterAvailDashboard();
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

  // Interactive Inventory Pills (Circle / Division / Agency / Aging / Meters)
  document.querySelectorAll('.inv-pill-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const dashboard = btn.getAttribute('data-inv-tab');
      const type = btn.getAttribute('data-type');
      if (dashboard === 'unsync') {
        state.activeUnsyncType = type;
        state.unsyncPage = 1;
        const sel = document.getElementById('selectUnsyncType');
        if (sel) sel.value = type;
        updateInventoryPills('unsync', type);
        loadUnsyncDashboard();
      } else if (dashboard === 'meter_available') {
        state.activeMeterAvailType = type;
        state.meterAvailPage = 1;
        const sel = document.getElementById('selectMeterAvailType');
        if (sel) sel.value = type;
        updateInventoryPills('meter_available', type);
        loadMeterAvailDashboard();
      }
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

  const searchUnsync = document.getElementById('searchUnsync');
  if (searchUnsync) {
    let unsyncTimer;
    searchUnsync.addEventListener('input', (e) => {
      state.searchFilters.unsync = e.target.value.toLowerCase().trim();
      clearTimeout(unsyncTimer);
      unsyncTimer = setTimeout(() => {
        if (state.activeUnsyncType === 'meters') {
          state.unsyncPage = 1;
          renderUnsyncMetersTable();
        } else {
          renderUnsyncTable(state.unsyncData);
        }
      }, 250);
    });
  }

  const searchMeterAvail = document.getElementById('searchMeterAvail');
  if (searchMeterAvail) {
    let meterAvailTimer;
    searchMeterAvail.addEventListener('input', (e) => {
      state.searchFilters.meter_available = e.target.value.toLowerCase().trim();
      clearTimeout(meterAvailTimer);
      meterAvailTimer = setTimeout(() => {
        if (state.activeMeterAvailType === 'meters') {
          state.meterAvailPage = 1;
          renderMeterAvailMetersTable();
        } else {
          renderMeterAvailTable(state.meterAvailData);
        }
      }, 250);
    });
  }

  // Pagination for Unsync and Meter Available Meters list
  const btnPrevUnsync = document.getElementById('btnPrevUnsyncPage');
  if (btnPrevUnsync) {
    btnPrevUnsync.addEventListener('click', () => {
      if (state.unsyncPage > 1) {
        state.unsyncPage--;
        renderUnsyncMetersTable();
      }
    });
  }
  const btnNextUnsync = document.getElementById('btnNextUnsyncPage');
  if (btnNextUnsync) {
    btnNextUnsync.addEventListener('click', () => {
      state.unsyncPage++;
      renderUnsyncMetersTable();
    });
  }

  const btnPrevMeterAvail = document.getElementById('btnPrevMeterAvailPage');
  if (btnPrevMeterAvail) {
    btnPrevMeterAvail.addEventListener('click', () => {
      if (state.meterAvailPage > 1) {
        state.meterAvailPage--;
        renderMeterAvailMetersTable();
      }
    });
  }
  const btnNextMeterAvail = document.getElementById('btnNextMeterAvailPage');
  if (btnNextMeterAvail) {
    btnNextMeterAvail.addEventListener('click', () => {
      state.meterAvailPage++;
      renderMeterAvailMetersTable();
    });
  }

  // Export CSV Buttons
  const btnExportCum = document.getElementById('btnExportCumulativeCsv');
  if (btnExportCum) btnExportCum.addEventListener('click', exportCumulativeCsv);
  const btnExportDaily = document.getElementById('btnExportDailyCsv');
  if (btnExportDaily) btnExportDaily.addEventListener('click', exportDailyCsv);
  const btnExportUla = document.getElementById('btnExportUlaCsv');
  if (btnExportUla) btnExportUla.addEventListener('click', exportUlaCsv);
  const btnExportUnsync = document.getElementById('btnExportUnsyncCsv');
  if (btnExportUnsync) btnExportUnsync.addEventListener('click', exportUnsyncCsv);
  const btnExportMeterAvail = document.getElementById('btnExportMeterAvailCsv');
  if (btnExportMeterAvail) btnExportMeterAvail.addEventListener('click', exportMeterAvailCsv);
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

  } else if (state.activeTab === 'tabUnsync') {
    // --- UNSYNC DASHBOARD TAB CARDS (Excludes SBPDCL) ---
    const un = json.unsync || {};
    const unTotal = Number(un.total || 5087);
    const unClosed = Number(un.closed || 501);
    const unOpen = Number(un.open_unsync || 4586);
    const unActive = Number(un.active_vendor || 3226);
    const unCrit = Number(un.critical_aging || 3819);
    const unFresh = Number(un.fresh_aging || 931);
    const unPct = unTotal > 0 ? ((unClosed / unTotal) * 100).toFixed(1) : '0';

    setKpiCard(1, {
      accent: '#0284c7',
      icon: 'fa-solid fa-arrows-rotate',
      title: 'Total Unsync Scope',
      value: unTotal.toLocaleString(),
      subHtml: `<span class="badge badge-cyan"><i class="fa-solid fa-ban"></i> Excludes SBPDCL</span> <span>${circleLabel}</span>`
    });

    setKpiCard(2, {
      accent: '#10b981',
      icon: 'fa-solid fa-circle-check',
      title: 'Closed in Master',
      value: unClosed.toLocaleString(),
      subHtml: `<span class="badge badge-emerald"><i class="fa-solid fa-check-double"></i> ${unPct}% Closed</span>`
    });

    setKpiCard(3, {
      accent: '#f59e0b',
      icon: 'fa-solid fa-clock-rotate-left',
      title: 'Open / Pending Unsync',
      value: unOpen.toLocaleString(),
      subHtml: `<span class="badge badge-amber">${(100 - parseFloat(unPct)).toFixed(1)}% Pending</span>`
    });

    setKpiCard(4, {
      accent: '#6366f1',
      icon: 'fa-solid fa-user-check',
      title: 'Active Vendor Deployment',
      value: unActive.toLocaleString(),
      subHtml: `<span class="badge badge-indigo">${unTotal > 0 ? ((unActive / unTotal) * 100).toFixed(1) : '0'}% Active Share</span>`
    });

    setKpiCard(5, {
      accent: '#f43f5e',
      icon: 'fa-solid fa-triangle-exclamation',
      title: 'Critical Aging (>30 Days)',
      value: unCrit.toLocaleString(),
      subHtml: `<span class="badge badge-rose"><i class="fa-solid fa-fire"></i> High Priority</span>`
    });

    setKpiCard(6, {
      accent: '#06b6d4',
      icon: 'fa-solid fa-bolt',
      title: 'Fresh Aging (0-7 Days)',
      value: unFresh.toLocaleString(),
      subHtml: `<span class="badge badge-cyan">Recent Unsync</span>`
    });

  } else if (state.activeTab === 'tabMeterAvailable') {
    // --- METER AVAILABLE TAB CARDS (Includes SBPDCL) ---
    const ma = json.meter_available || {};
    const maTotal = Number(ma.total || 123090);
    const maInst = Number(ma.installed || 734);
    const maAvail = Number(ma.available || 122356);
    const maActive = Number(ma.active_vendor || 16342);
    const maCrit = Number(ma.critical_aging || 95753);
    const maFresh = Number(ma.fresh_aging || 6295);
    const maPct = maTotal > 0 ? ((maInst / maTotal) * 100).toFixed(2) : '0';

    setKpiCard(1, {
      accent: '#10b981',
      icon: 'fa-solid fa-boxes-stacked',
      title: 'Total Meter Available Stock',
      value: maTotal.toLocaleString(),
      subHtml: `<span class="badge badge-emerald"><i class="fa-solid fa-warehouse"></i> Includes SBPDCL</span> <span>${circleLabel}</span>`
    });

    setKpiCard(2, {
      accent: '#0284c7',
      icon: 'fa-solid fa-circle-check',
      title: 'Installed in Master',
      value: maInst.toLocaleString(),
      subHtml: `<span class="badge badge-cyan"><i class="fa-solid fa-bolt"></i> ${maPct}% Installed</span>`
    });

    setKpiCard(3, {
      accent: '#f59e0b',
      icon: 'fa-solid fa-box-open',
      title: 'Available (Not Installed)',
      value: maAvail.toLocaleString(),
      subHtml: `<span class="badge badge-amber">${(100 - parseFloat(maPct)).toFixed(1)}% Available</span>`
    });

    setKpiCard(4, {
      accent: '#8b5cf6',
      icon: 'fa-solid fa-user-check',
      title: 'Active Vendor Stock',
      value: maActive.toLocaleString(),
      subHtml: `<span class="badge badge-purple">${maTotal > 0 ? ((maActive / maTotal) * 100).toFixed(1) : '0'}% Active Share</span>`
    });

    setKpiCard(5, {
      accent: '#f43f5e',
      icon: 'fa-solid fa-clock-rotate-left',
      title: 'Aging Stock (>30 Days)',
      value: maCrit.toLocaleString(),
      subHtml: `<span class="badge badge-rose">Long Outstanding</span>`
    });

    setKpiCard(6, {
      accent: '#06b6d4',
      icon: 'fa-solid fa-truck-ramp-box',
      title: 'Fresh Stock (0-7 Days)',
      value: maFresh.toLocaleString(),
      subHtml: `<span class="badge badge-cyan">Recently Received</span>`
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
  if (document.getElementById('tabUnsyncBadge')) {
    const unTotal = Number(json.unsync?.total || 5087);
    document.getElementById('tabUnsyncBadge').textContent = `${unTotal.toLocaleString()} Unsync`;
  }
  if (document.getElementById('tabMeterAvailBadge')) {
    const maTotal = Number(json.meter_available?.total || 123090);
    document.getElementById('tabMeterAvailBadge').textContent = `${Math.round(maTotal/1000)}K Available`;
  }
  if (document.getElementById('scopeReportDownloadTime')) {
    const dlTime = json.report_download_time || json.daily_download_time || '';
    const nextSync = json.next_auto_sync ? ` &bull; <i class="fa-solid fa-clock-rotate-left"></i> Next: ${json.next_auto_sync}` : '';
    document.getElementById('scopeReportDownloadTime').innerHTML = `${dlTime} IST<span style="font-size:0.75rem; color: #10b981; font-weight:600; margin-left: 6px;">${nextSync}</span>`;
  }
  if (document.getElementById('mobileReportDownloadTime')) {
    const dlTime = json.report_download_time || json.daily_download_time || '';
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

// --- TAB: UNSYNC & METER AVAILABLE DASHBOARDS ---

async function loadUnsyncFilters() {
  try {
    const res = await fetch('/api/inventory/filters?dashboard=unsync');
    const json = await res.json();
    if (!json.success) return;

    const fillSelect = (id, list, placeholder) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = el.value || 'ALL';
      el.innerHTML = `<option value="ALL">${placeholder}</option>` +
        list.map(v => `<option value="${v}">${v}</option>`).join('');
      if (list.includes(cur)) el.value = cur;
      else el.value = 'ALL';
    };

    fillSelect('filterUnsyncCircle', json.circles || [], 'All Circles (SBPDCL Excluded)');
    fillSelect('filterUnsyncDivision', json.divisions || [], 'All HigherOffices');
    fillSelect('filterUnsyncVendor', json.vendors || [], 'All Vendors');
    fillSelect('filterUnsyncCommType', json.comm_types || [], 'All Comm Types');
    fillSelect('filterUnsyncMeterType', json.meter_types || [], 'All Meter Types');
    fillSelect('filterUnsyncPhase', json.phases || [], 'All Phases');
  } catch (err) {
    console.error('Error loading unsync filters:', err);
  }
}

async function loadMeterAvailFilters() {
  try {
    const res = await fetch('/api/inventory/filters?dashboard=meter_available');
    const json = await res.json();
    if (!json.success) return;

    const fillSelect = (id, list, placeholder) => {
      const el = document.getElementById(id);
      if (!el) return;
      const cur = el.value || 'ALL';
      el.innerHTML = `<option value="ALL">${placeholder}</option>` +
        list.map(v => `<option value="${v}">${v}</option>`).join('');
      if (list.includes(cur)) el.value = cur;
      else el.value = 'ALL';
    };

    fillSelect('filterMeterAvailCircle', json.circles || [], 'All Circles (Including SBPDCL)');
    fillSelect('filterMeterAvailDivision', json.divisions || [], 'All HigherOffices');
    fillSelect('filterMeterAvailVendor', json.vendors || [], 'All Vendors');
    fillSelect('filterMeterAvailCommType', json.comm_types || [], 'All Comm Types');
    fillSelect('filterMeterAvailMeterType', json.meter_types || [], 'All Meter Types');
    fillSelect('filterMeterAvailPhase', json.phases || [], 'All Phases');
  } catch (err) {
    console.error('Error loading meter available filters:', err);
  }
}

function updateInventoryPills(dashboard, activeType) {
  const pillGroupId = (dashboard === 'unsync') ? 'unsyncPillGroup' : 'meterAvailPillGroup';
  const group = document.getElementById(pillGroupId);
  if (!group) return;
  group.querySelectorAll('.inv-pill-btn').forEach(btn => {
    if (btn.getAttribute('data-type') === activeType) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
}

function updateInventoryBreadcrumbs(dashboard) {
  const isUnsync = (dashboard === 'unsync');
  const filters = isUnsync ? state.unsyncFilters : state.meterAvailFilters;
  const chipCircle = document.getElementById(isUnsync ? 'chipUnsyncCircle' : 'chipMeterAvailCircle');
  const chipDivision = document.getElementById(isUnsync ? 'chipUnsyncDivision' : 'chipMeterAvailDivision');
  const chipVendor = document.getElementById(isUnsync ? 'chipUnsyncVendor' : 'chipMeterAvailVendor');
  const hintEl = document.getElementById(isUnsync ? 'unsyncBreadcrumbHint' : 'meterAvailBreadcrumbHint');

  let hasAny = false;

  if (chipCircle) {
    if (filters.circle && filters.circle !== 'ALL') {
      chipCircle.innerHTML = `<i class="fa-solid fa-circle-dot" style="color: #6366f1;"></i> Circle: <strong>${filters.circle}</strong> <span class="chip-remove" onclick="window.clearInventoryFilter('${dashboard}', 'circle')" title="Remove Circle filter">&times;</span>`;
      chipCircle.style.display = 'inline-flex';
      hasAny = true;
    } else {
      chipCircle.style.display = 'none';
    }
  }

  if (chipDivision) {
    if (filters.division && filters.division !== 'ALL') {
      chipDivision.innerHTML = `<i class="fa-solid fa-building" style="color: #8b5cf6;"></i> Division: <strong>${filters.division}</strong> <span class="chip-remove" onclick="window.clearInventoryFilter('${dashboard}', 'division')" title="Remove Division filter">&times;</span>`;
      chipDivision.style.display = 'inline-flex';
      hasAny = true;
    } else {
      chipDivision.style.display = 'none';
    }
  }

  if (chipVendor) {
    if (filters.vendor && filters.vendor !== 'ALL') {
      chipVendor.innerHTML = `<i class="fa-solid fa-truck-field" style="color: #f59e0b;"></i> Agency: <strong>${filters.vendor}</strong> <span class="chip-remove" onclick="window.clearInventoryFilter('${dashboard}', 'vendor')" title="Remove Agency filter">&times;</span>`;
      chipVendor.style.display = 'inline-flex';
      hasAny = true;
    } else {
      chipVendor.style.display = 'none';
    }
  }

  const chipComm = document.getElementById(isUnsync ? 'chipUnsyncCommType' : 'chipMeterAvailCommType');
  if (chipComm) {
    if (filters.comm_type && filters.comm_type !== 'ALL') {
      chipComm.innerHTML = `<i class="fa-solid fa-satellite-dish" style="color: #0284c7;"></i> Comm: <strong>${filters.comm_type}</strong> <span class="chip-remove" onclick="window.clearInventoryFilter('${dashboard}', 'comm_type')" title="Remove Comm Type filter">&times;</span>`;
      chipComm.style.display = 'inline-flex';
      hasAny = true;
    } else {
      chipComm.style.display = 'none';
    }
  }

  const chipMeterType = document.getElementById(isUnsync ? 'chipUnsyncMeterType' : 'chipMeterAvailMeterType');
  if (chipMeterType) {
    if (filters.meter_type && filters.meter_type !== 'ALL') {
      chipMeterType.innerHTML = `<i class="fa-solid fa-gauge" style="color: #8b5cf6;"></i> Type: <strong>${filters.meter_type}</strong> <span class="chip-remove" onclick="window.clearInventoryFilter('${dashboard}', 'meter_type')" title="Remove Meter Type filter">&times;</span>`;
      chipMeterType.style.display = 'inline-flex';
      hasAny = true;
    } else {
      chipMeterType.style.display = 'none';
    }
  }

  const chipPhase = document.getElementById(isUnsync ? 'chipUnsyncPhase' : 'chipMeterAvailPhase');
  if (chipPhase) {
    if (filters.phase && filters.phase !== 'ALL') {
      chipPhase.innerHTML = `<i class="fa-solid fa-bolt" style="color: #f59e0b;"></i> Phase: <strong>${filters.phase}</strong> <span class="chip-remove" onclick="window.clearInventoryFilter('${dashboard}', 'phase')" title="Remove Phase filter">&times;</span>`;
      chipPhase.style.display = 'inline-flex';
      hasAny = true;
    } else {
      chipPhase.style.display = 'none';
    }
  }

  if (hintEl) {
    hintEl.innerHTML = hasAny
      ? `<button type="button" class="btn btn-secondary" style="padding: 2px 8px; font-size: 0.70rem; border-radius: 4px;" onclick="window.clearInventoryAllFilters('${dashboard}')"><i class="fa-solid fa-rotate-left"></i> Reset Hierarchy & Filters</button>`
      : `<i class="fa-solid fa-lightbulb"></i> Tip: Click any row in Circle, Division or Agency summary to drill down!`;
  }
}

window.drilldownInventory = function(dashboard, level, val, parentCircle) {
  const isUnsync = (dashboard === 'unsync');
  const filters = isUnsync ? state.unsyncFilters : state.meterAvailFilters;

  if (level === 'circle') {
    filters.circle = val;
    const cSel = document.getElementById(isUnsync ? 'filterUnsyncCircle' : 'filterMeterAvailCircle');
    if (cSel) cSel.value = val;
    if (isUnsync) {
      state.activeUnsyncType = 'division';
      const s = document.getElementById('selectUnsyncType');
      if (s) s.value = 'division';
      updateInventoryPills('unsync', 'division');
      loadUnsyncDashboard();
    } else {
      state.activeMeterAvailType = 'division';
      const s = document.getElementById('selectMeterAvailType');
      if (s) s.value = 'division';
      updateInventoryPills('meter_available', 'division');
      loadMeterAvailDashboard();
    }
  } else if (level === 'division') {
    filters.division = val;
    if (parentCircle && filters.circle === 'ALL') {
      filters.circle = parentCircle;
      const cSel = document.getElementById(isUnsync ? 'filterUnsyncCircle' : 'filterMeterAvailCircle');
      if (cSel) cSel.value = parentCircle;
    }
    const dSel = document.getElementById(isUnsync ? 'filterUnsyncDivision' : 'filterMeterAvailDivision');
    if (dSel) dSel.value = val;
    if (isUnsync) {
      state.activeUnsyncType = 'vendor';
      const s = document.getElementById('selectUnsyncType');
      if (s) s.value = 'vendor';
      updateInventoryPills('unsync', 'vendor');
      loadUnsyncDashboard();
    } else {
      state.activeMeterAvailType = 'vendor';
      const s = document.getElementById('selectMeterAvailType');
      if (s) s.value = 'vendor';
      updateInventoryPills('meter_available', 'vendor');
      loadMeterAvailDashboard();
    }
  } else if (level === 'vendor') {
    filters.vendor = val;
    const vSel = document.getElementById(isUnsync ? 'filterUnsyncVendor' : 'filterMeterAvailVendor');
    if (vSel) vSel.value = val;
    if (isUnsync) {
      state.activeUnsyncType = 'meters';
      state.unsyncPage = 1;
      const s = document.getElementById('selectUnsyncType');
      if (s) s.value = 'meters';
      updateInventoryPills('unsync', 'meters');
      loadUnsyncDashboard();
    } else {
      state.activeMeterAvailType = 'meters';
      state.meterAvailPage = 1;
      const s = document.getElementById('selectMeterAvailType');
      if (s) s.value = 'meters';
      updateInventoryPills('meter_available', 'meters');
      loadMeterAvailDashboard();
    }
  }
};

window.clearInventoryFilter = function(dashboard, level) {
  const isUnsync = (dashboard === 'unsync');
  const filters = isUnsync ? state.unsyncFilters : state.meterAvailFilters;
  if (level === 'circle') {
    filters.circle = 'ALL';
    const cSel = document.getElementById(isUnsync ? 'filterUnsyncCircle' : 'filterMeterAvailCircle');
    if (cSel) cSel.value = 'ALL';
  } else if (level === 'division') {
    filters.division = 'ALL';
    const dSel = document.getElementById(isUnsync ? 'filterUnsyncDivision' : 'filterMeterAvailDivision');
    if (dSel) dSel.value = 'ALL';
  } else if (level === 'vendor') {
    filters.vendor = 'ALL';
    const vSel = document.getElementById(isUnsync ? 'filterUnsyncVendor' : 'filterMeterAvailVendor');
    if (vSel) vSel.value = 'ALL';
  } else if (level === 'comm_type') {
    filters.comm_type = 'ALL';
    const sel = document.getElementById(isUnsync ? 'filterUnsyncCommType' : 'filterMeterAvailCommType');
    if (sel) sel.value = 'ALL';
  } else if (level === 'meter_type') {
    filters.meter_type = 'ALL';
    const sel = document.getElementById(isUnsync ? 'filterUnsyncMeterType' : 'filterMeterAvailMeterType');
    if (sel) sel.value = 'ALL';
  } else if (level === 'phase') {
    filters.phase = 'ALL';
    const sel = document.getElementById(isUnsync ? 'filterUnsyncPhase' : 'filterMeterAvailPhase');
    if (sel) sel.value = 'ALL';
  }
  if (isUnsync) loadUnsyncDashboard();
  else loadMeterAvailDashboard();
};

window.clearInventoryAllFilters = function(dashboard) {
  const isUnsync = (dashboard === 'unsync');
  if (isUnsync) {
    state.unsyncFilters = { circle: 'ALL', division: 'ALL', vendor: 'ALL', status_vendor: 'ALL', aging: 'ALL', match_status: 'ALL', comm_type: 'ALL', meter_type: 'ALL', phase: 'ALL' };
    ['filterUnsyncCircle', 'filterUnsyncDivision', 'filterUnsyncVendor', 'filterUnsyncStatusVendor', 'filterUnsyncAging', 'filterUnsyncMatch', 'filterUnsyncCommType', 'filterUnsyncMeterType', 'filterUnsyncPhase'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'ALL';
    });
    loadUnsyncDashboard();
  } else {
    state.meterAvailFilters = { circle: 'ALL', division: 'ALL', vendor: 'ALL', status_vendor: 'ALL', aging: 'ALL', match_status: 'ALL', comm_type: 'ALL', meter_type: 'ALL', phase: 'ALL' };
    ['filterMeterAvailCircle', 'filterMeterAvailDivision', 'filterMeterAvailVendor', 'filterMeterAvailStatusVendor', 'filterMeterAvailAging', 'filterMeterAvailMatch', 'filterMeterAvailCommType', 'filterMeterAvailMeterType', 'filterMeterAvailPhase'].forEach(id => {
      const el = document.getElementById(id);
      if (el) el.value = 'ALL';
    });
    loadMeterAvailDashboard();
  }
};

function escapeAttr(s) {
  return String(s || '').replace(/'/g, "\\'").replace(/"/g, '&quot;');
}

async function loadUnsyncDashboard() {
  const container = document.getElementById('unsyncTableContainer');
  const pagination = document.getElementById('unsyncPagination');

  updateInventoryPills('unsync', state.activeUnsyncType);
  updateInventoryBreadcrumbs('unsync');

  if (state.activeUnsyncType === 'meters') {
    if (pagination) pagination.style.display = 'flex';
    renderUnsyncMetersTable();
    return;
  }

  if (pagination) pagination.style.display = 'none';
  if (container) {
    container.innerHTML = '<div style="text-align:center; padding: 2.5rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Calculating Unsync analytics in DuckDB...</div>';
  }

  try {
    const params = new URLSearchParams({ dashboard: 'unsync' });
    if (state.unsyncFilters.circle !== 'ALL') params.append('circle', state.unsyncFilters.circle);
    if (state.unsyncFilters.division !== 'ALL') params.append('division', state.unsyncFilters.division);
    if (state.unsyncFilters.vendor !== 'ALL') params.append('vendor', state.unsyncFilters.vendor);
    if (state.unsyncFilters.status_vendor !== 'ALL') params.append('status_vendor', state.unsyncFilters.status_vendor);
    if (state.unsyncFilters.aging !== 'ALL') params.append('aging', state.unsyncFilters.aging);
    if (state.unsyncFilters.match_status !== 'ALL') params.append('match_status', state.unsyncFilters.match_status);
    if (state.unsyncFilters.comm_type !== 'ALL') params.append('comm_type', state.unsyncFilters.comm_type);
    if (state.unsyncFilters.meter_type !== 'ALL') params.append('meter_type', state.unsyncFilters.meter_type);
    if (state.unsyncFilters.phase !== 'ALL') params.append('phase', state.unsyncFilters.phase);

    const res = await fetch(`/api/inventory/summary?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      state.unsyncData = json;
      renderUnsyncTable(json);
      renderUnsyncCharts(json);
    } else {
      if (container) container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load unsync summary: ${json.error}</div>`;
    }
  } catch (err) {
    if (container) container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Error loading unsync dashboard: ${err.message}</div>`;
  }
}

async function loadMeterAvailDashboard() {
  const container = document.getElementById('meterAvailTableContainer');
  const pagination = document.getElementById('meterAvailPagination');

  updateInventoryPills('meter_available', state.activeMeterAvailType);
  updateInventoryBreadcrumbs('meter_available');

  if (state.activeMeterAvailType === 'meters') {
    if (pagination) pagination.style.display = 'flex';
    renderMeterAvailMetersTable();
    return;
  }

  if (pagination) pagination.style.display = 'none';
  if (container) {
    container.innerHTML = '<div style="text-align:center; padding: 2.5rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Calculating Meter Available inventory in DuckDB...</div>';
  }

  try {
    const params = new URLSearchParams({ dashboard: 'meter_available' });
    if (state.meterAvailFilters.circle !== 'ALL') params.append('circle', state.meterAvailFilters.circle);
    if (state.meterAvailFilters.division !== 'ALL') params.append('division', state.meterAvailFilters.division);
    if (state.meterAvailFilters.vendor !== 'ALL') params.append('vendor', state.meterAvailFilters.vendor);
    if (state.meterAvailFilters.status_vendor !== 'ALL') params.append('status_vendor', state.meterAvailFilters.status_vendor);
    if (state.meterAvailFilters.aging !== 'ALL') params.append('aging', state.meterAvailFilters.aging);
    if (state.meterAvailFilters.match_status !== 'ALL') params.append('match_status', state.meterAvailFilters.match_status);
    if (state.meterAvailFilters.comm_type !== 'ALL') params.append('comm_type', state.meterAvailFilters.comm_type);
    if (state.meterAvailFilters.meter_type !== 'ALL') params.append('meter_type', state.meterAvailFilters.meter_type);
    if (state.meterAvailFilters.phase !== 'ALL') params.append('phase', state.meterAvailFilters.phase);

    const res = await fetch(`/api/inventory/summary?${params.toString()}`);
    const json = await res.json();
    if (json.success) {
      state.meterAvailData = json;
      renderMeterAvailTable(json);
      renderMeterAvailCharts(json);
    } else {
      if (container) container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load meter available summary: ${json.error}</div>`;
    }
  } catch (err) {
    if (container) container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Error loading meter available dashboard: ${err.message}</div>`;
  }
}

function renderUnsyncTable(data) {
  const container = document.getElementById('unsyncTableContainer');
  if (!container || !data) return;

  const type = state.activeUnsyncType;
  const q = state.searchFilters.unsync;

  const isCircle = (type === 'circle');
  const isDivision = (type === 'division');
  const isVendor = (type === 'vendor');

  let list = [];
  let dimKey = 'circle';
  let dimLabel = 'Circle Name';

  if (isCircle) {
    list = data.circles || [];
    dimKey = 'circle';
    dimLabel = 'Circle Name';
  } else if (isDivision) {
    list = data.divisions || [];
    dimKey = 'division';
    dimLabel = 'HigherOffice (Division)';
  } else if (isVendor) {
    list = data.vendors || [];
    dimKey = 'vendor';
    dimLabel = 'Agency / Vendor';
  } else if (type === 'aging') {
    list = data.aging || [];
    dimKey = 'aging_bucket';
    dimLabel = 'Aging Bucket';
  } else if (type === 'meter_type') {
    list = data.meter_types || [];
    dimKey = 'meter_type';
    dimLabel = 'Meter Type';
  } else if (type === 'phase') {
    list = data.phases || [];
    dimKey = 'phase';
    dimLabel = 'Phase Type';
  } else if (type === 'comm_type') {
    list = data.comm_types || [];
    dimKey = 'comm_type';
    dimLabel = 'Communication Type';
  }

  let rows = list.slice();
  if (q) {
    rows = rows.filter(r => Object.values(r).some(val => String(val).toLowerCase().includes(q)));
  }

  const titleEl = document.getElementById('unsyncTableTitle');
  const countEl = document.getElementById('unsyncTableRowCount');
  const totalMeters = (data.kpi && data.kpi.total) ? data.kpi.total : rows.reduce((a,c) => a + (c.total||0), 0);
  if (titleEl) titleEl.textContent = `${dimLabel} Wise Unsync Interactive Summary`;
  if (countEl) countEl.textContent = `${rows.length} Rows (${totalMeters.toLocaleString()} Scope)`;

  const totalClosed = rows.reduce((a,c) => a + (c.matched || 0), 0);
  const totalOpen = rows.reduce((a,c) => a + (c.pending || 0), 0);
  const totalScope = rows.reduce((a,c) => a + (c.total || 0), 0);
  const totalActive = rows.reduce((a,c) => a + (c.active_count || 0), 0);
  const totalInactive = rows.reduce((a,c) => a + (c.inactive_count || 0), 0);
  const totalAging07 = rows.reduce((a,c) => a + (c.aging_0_7 || 0), 0);
  const totalAging815 = rows.reduce((a,c) => a + (c.aging_8_15 || 0), 0);
  const totalAging1530 = rows.reduce((a,c) => a + (c.aging_15_30 || 0), 0);
  const totalAgingGt30 = rows.reduce((a,c) => a + (c.aging_gt_30 || 0), 0);
  const avgClosureRate = totalScope > 0 ? ((totalClosed * 100) / totalScope).toFixed(2) : '0.00';

  container.innerHTML = `
    <table class="styled-table" id="tableUnsyncDynamic">
      <thead>
        <tr>
          <th>${dimLabel}</th>
          ${isDivision ? '<th>Parent Circle</th>' : ''}
          ${isVendor ? '<th>Vendor Status</th>' : ''}
          <th class="text-right">Total Scope</th>
          <th class="text-right">Closed (Installed)</th>
          <th class="text-right">Open Unsync</th>
          <th class="text-right">Closure Rate (%)</th>
          ${!isVendor ? '<th class="text-right">Active Vendor</th><th class="text-right">In Active</th>' : ''}
          <th class="text-right">0-7 Days</th>
          <th class="text-right">8-15 Days</th>
          <th class="text-right">15-30 Days</th>
          <th class="text-right">>30 Days (Critical)</th>
          ${(isCircle || isDivision || isVendor) ? '<th class="text-center" style="width: 125px;">Interactive Drill</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          let rowClick = '';
          let actionBtn = '';
          if (isCircle) {
            rowClick = `onclick="window.drilldownInventory('unsync', 'circle', '${escapeAttr(r.circle)}')"` ;
            actionBtn = `<td class="text-center"><button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.drilldownInventory('unsync', 'circle', '${escapeAttr(r.circle)}')"><i class="fa-solid fa-sitemap"></i> Divisions &rarr;</button></td>`;
          } else if (isDivision) {
            rowClick = `onclick="window.drilldownInventory('unsync', 'division', '${escapeAttr(r.division)}', '${escapeAttr(r.circle)}')"` ;
            actionBtn = `<td class="text-center"><button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.drilldownInventory('unsync', 'division', '${escapeAttr(r.division)}', '${escapeAttr(r.circle)}')"><i class="fa-solid fa-truck-field"></i> Agencies &rarr;</button></td>`;
          } else if (isVendor) {
            rowClick = `onclick="window.drilldownInventory('unsync', 'vendor', '${escapeAttr(r.vendor)}')"` ;
            actionBtn = `<td class="text-center"><button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.drilldownInventory('unsync', 'vendor', '${escapeAttr(r.vendor)}')"><i class="fa-solid fa-list-check"></i> Meters &rarr;</button></td>`;
          }

          return `
            <tr class="${(isCircle || isDivision || isVendor) ? 'interactive-row' : ''}" ${rowClick}>
              <td>
                <strong style="color: ${isCircle ? '#0284c7' : (isDivision ? '#8b5cf6' : '#0f172a')};">
                  ${isCircle ? '<i class="fa-solid fa-circle-dot" style="font-size:0.75rem;"></i> ' : (isDivision ? '<i class="fa-solid fa-building" style="font-size:0.75rem;"></i> ' : (isVendor ? '<i class="fa-solid fa-truck-field" style="font-size:0.75rem;"></i> ' : ''))}
                  ${r[dimKey] || 'UNKNOWN'}
                </strong>
              </td>
              ${isDivision ? `<td><span class="badge badge-indigo">${r.circle || '--'}</span></td>` : ''}
              ${isVendor ? `<td><span class="badge ${(r.active_count > 0 || r.status_vendor === 'Active') ? 'badge-emerald' : 'badge-slate'}">${(r.active_count > 0 || r.status_vendor === 'Active') ? 'Active' : 'In Active'}</span></td>` : ''}
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${(r.total || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${(r.matched || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b; font-weight:700;">${(r.pending || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge ${Number(r.matched_pct || 0) > 10 ? 'badge-emerald' : 'badge-cyan'}">${Number(r.matched_pct || 0).toFixed(2)}%</span></td>
              ${!isVendor ? `<td class="text-right" style="color: #6366f1;">${(r.active_count || 0).toLocaleString()}</td><td class="text-right" style="color: var(--text-muted);">${(r.inactive_count || 0).toLocaleString()}</td>` : ''}
              <td class="text-right">${(r.aging_0_7 || 0).toLocaleString()}</td>
              <td class="text-right">${(r.aging_8_15 || 0).toLocaleString()}</td>
              <td class="text-right">${(r.aging_15_30 || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f43f5e; font-weight:600;">${(r.aging_gt_30 || 0).toLocaleString()}</td>
              ${actionBtn}
            </tr>
          `;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td><strong>UNSYNC TOTAL (EXCL. SBPDCL)</strong></td>
          ${isDivision ? '<td>-</td>' : ''}
          ${isVendor ? '<td>-</td>' : ''}
          <td class="text-right"><strong>${totalScope.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalClosed.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalOpen.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${avgClosureRate}%</strong></td>
          ${!isVendor ? `<td class="text-right"><strong>${totalActive.toLocaleString()}</strong></td><td class="text-right"><strong>${totalInactive.toLocaleString()}</strong></td>` : ''}
          <td class="text-right"><strong>${totalAging07.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAging815.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAging1530.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAgingGt30.toLocaleString()}</strong></td>
          ${(isCircle || isDivision || isVendor) ? '<td></td>' : ''}
        </tr>
      </tfoot>
    </table>
  `;
}

function renderMeterAvailTable(data) {
  const container = document.getElementById('meterAvailTableContainer');
  if (!container || !data) return;

  const type = state.activeMeterAvailType;
  const q = state.searchFilters.meter_available;

  const isCircle = (type === 'circle');
  const isDivision = (type === 'division');
  const isVendor = (type === 'vendor');

  let list = [];
  let dimKey = 'circle';
  let dimLabel = 'Circle Name';

  if (isCircle) {
    list = data.circles || [];
    dimKey = 'circle';
    dimLabel = 'Circle Name';
  } else if (isDivision) {
    list = data.divisions || [];
    dimKey = 'division';
    dimLabel = 'HigherOffice (Division)';
  } else if (isVendor) {
    list = data.vendors || [];
    dimKey = 'vendor';
    dimLabel = 'Agency / Vendor';
  } else if (type === 'aging') {
    list = data.aging || [];
    dimKey = 'aging_bucket';
    dimLabel = 'Aging Bucket';
  } else if (type === 'meter_type') {
    list = data.meter_types || [];
    dimKey = 'meter_type';
    dimLabel = 'Meter Type';
  } else if (type === 'phase') {
    list = data.phases || [];
    dimKey = 'phase';
    dimLabel = 'Phase Type';
  } else if (type === 'comm_type') {
    list = data.comm_types || [];
    dimKey = 'comm_type';
    dimLabel = 'Communication Type';
  }

  let rows = list.slice();
  if (q) {
    rows = rows.filter(r => Object.values(r).some(val => String(val).toLowerCase().includes(q)));
  }

  const titleEl = document.getElementById('meterAvailTableTitle');
  const countEl = document.getElementById('meterAvailTableRowCount');
  const totalMeters = (data.kpi && data.kpi.total) ? data.kpi.total : rows.reduce((a,c) => a + (c.total||0), 0);
  if (titleEl) titleEl.textContent = `${dimLabel} Wise Available Meter Interactive Summary`;
  if (countEl) countEl.textContent = `${rows.length} Rows (${totalMeters.toLocaleString()} Total Stock)`;

  const totalInstalled = rows.reduce((a,c) => a + (c.matched || 0), 0);
  const totalAvailable = rows.reduce((a,c) => a + (c.pending || 0), 0);
  const totalScope = rows.reduce((a,c) => a + (c.total || 0), 0);
  const totalActive = rows.reduce((a,c) => a + (c.active_count || 0), 0);
  const totalInactive = rows.reduce((a,c) => a + (c.inactive_count || 0), 0);
  const totalAging07 = rows.reduce((a,c) => a + (c.aging_0_7 || 0), 0);
  const totalAging815 = rows.reduce((a,c) => a + (c.aging_8_15 || 0), 0);
  const totalAging1530 = rows.reduce((a,c) => a + (c.aging_15_30 || 0), 0);
  const totalAgingGt30 = rows.reduce((a,c) => a + (c.aging_gt_30 || 0), 0);
  const avgInstRate = totalScope > 0 ? ((totalInstalled * 100) / totalScope).toFixed(2) : '0.00';

  container.innerHTML = `
    <table class="styled-table" id="tableMeterAvailDynamic">
      <thead>
        <tr>
          <th>${dimLabel}</th>
          ${isDivision ? '<th>Parent Circle</th>' : ''}
          ${isVendor ? '<th>Vendor Status</th>' : ''}
          <th class="text-right">Total Available Stock</th>
          <th class="text-right">Installed in Master</th>
          <th class="text-right">Available (Not Installed)</th>
          <th class="text-right">Installed Rate (%)</th>
          ${!isVendor ? '<th class="text-right">Active Vendor</th><th class="text-right">In Active</th>' : ''}
          <th class="text-right">0-7 Days</th>
          <th class="text-right">8-15 Days</th>
          <th class="text-right">15-30 Days</th>
          <th class="text-right">>30 Days (Critical)</th>
          ${(isCircle || isDivision || isVendor) ? '<th class="text-center" style="width: 125px;">Interactive Drill</th>' : ''}
        </tr>
      </thead>
      <tbody>
        ${rows.map(r => {
          let rowClick = '';
          let actionBtn = '';
          if (isCircle) {
            rowClick = `onclick="window.drilldownInventory('meter_available', 'circle', '${escapeAttr(r.circle)}')"` ;
            actionBtn = `<td class="text-center"><button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.drilldownInventory('meter_available', 'circle', '${escapeAttr(r.circle)}')"><i class="fa-solid fa-sitemap"></i> Divisions &rarr;</button></td>`;
          } else if (isDivision) {
            rowClick = `onclick="window.drilldownInventory('meter_available', 'division', '${escapeAttr(r.division)}', '${escapeAttr(r.circle)}')"` ;
            actionBtn = `<td class="text-center"><button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.drilldownInventory('meter_available', 'division', '${escapeAttr(r.division)}', '${escapeAttr(r.circle)}')"><i class="fa-solid fa-truck-field"></i> Agencies &rarr;</button></td>`;
          } else if (isVendor) {
            rowClick = `onclick="window.drilldownInventory('meter_available', 'vendor', '${escapeAttr(r.vendor)}')"` ;
            actionBtn = `<td class="text-center"><button type="button" class="btn-table-action" onclick="event.stopPropagation(); window.drilldownInventory('meter_available', 'vendor', '${escapeAttr(r.vendor)}')"><i class="fa-solid fa-list-check"></i> Meters &rarr;</button></td>`;
          }

          return `
            <tr class="${(isCircle || isDivision || isVendor) ? 'interactive-row' : ''}" ${rowClick}>
              <td>
                <strong style="color: ${isCircle ? '#10b981' : (isDivision ? '#8b5cf6' : '#0f172a')};">
                  ${isCircle ? '<i class="fa-solid fa-circle-dot" style="font-size:0.75rem;"></i> ' : (isDivision ? '<i class="fa-solid fa-building" style="font-size:0.75rem;"></i> ' : (isVendor ? '<i class="fa-solid fa-truck-field" style="font-size:0.75rem;"></i> ' : ''))}
                  ${r[dimKey] || 'UNKNOWN'}
                </strong>
                ${r[dimKey] === 'SBPDCL' ? '<span class="badge badge-indigo">SBPDCL</span>' : ''}
              </td>
              ${isDivision ? `<td><span class="badge badge-indigo">${r.circle || '--'}</span></td>` : ''}
              ${isVendor ? `<td><span class="badge ${(r.active_count > 0 || r.status_vendor === 'Active') ? 'badge-emerald' : 'badge-slate'}">${(r.active_count > 0 || r.status_vendor === 'Active') ? 'Active' : 'In Active'}</span></td>` : ''}
              <td class="text-right" style="color: var(--brand-cyan); font-weight:700;">${(r.total || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #10b981; font-weight:700;">${(r.matched || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f59e0b; font-weight:700;">${(r.pending || 0).toLocaleString()}</td>
              <td class="text-right"><span class="badge ${Number(r.matched_pct || 0) > 1 ? 'badge-emerald' : 'badge-amber'}">${Number(r.matched_pct || 0).toFixed(2)}%</span></td>
              ${!isVendor ? `<td class="text-right" style="color: #6366f1;">${(r.active_count || 0).toLocaleString()}</td><td class="text-right" style="color: var(--text-muted);">${(r.inactive_count || 0).toLocaleString()}</td>` : ''}
              <td class="text-right">${(r.aging_0_7 || 0).toLocaleString()}</td>
              <td class="text-right">${(r.aging_8_15 || 0).toLocaleString()}</td>
              <td class="text-right">${(r.aging_15_30 || 0).toLocaleString()}</td>
              <td class="text-right" style="color: #f43f5e; font-weight:600;">${(r.aging_gt_30 || 0).toLocaleString()}</td>
              ${actionBtn}
            </tr>
          `;
        }).join('')}
      </tbody>
      <tfoot>
        <tr class="table-total-row">
          <td><strong>METER AVAILABLE TOTAL (INCL. SBPDCL)</strong></td>
          ${isDivision ? '<td>-</td>' : ''}
          ${isVendor ? '<td>-</td>' : ''}
          <td class="text-right"><strong>${totalScope.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalInstalled.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAvailable.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${avgInstRate}%</strong></td>
          ${!isVendor ? `<td class="text-right"><strong>${totalActive.toLocaleString()}</strong></td><td class="text-right"><strong>${totalInactive.toLocaleString()}</strong></td>` : ''}
          <td class="text-right"><strong>${totalAging07.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAging815.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAging1530.toLocaleString()}</strong></td>
          <td class="text-right"><strong>${totalAgingGt30.toLocaleString()}</strong></td>
          ${(isCircle || isDivision || isVendor) ? '<td></td>' : ''}
        </tr>
      </tfoot>
    </table>
  `;
}

async function renderUnsyncMetersTable() {
  const container = document.getElementById('unsyncTableContainer');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 2.5rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading detailed Unsync meters from DuckDB...</div>';

  try {
    const params = new URLSearchParams({
      dashboard: 'unsync',
      type: 'meters',
      page: state.unsyncPage,
      limit: state.unsyncPageLimit,
      search: state.searchFilters.unsync || ''
    });
    if (state.unsyncFilters.circle !== 'ALL') params.append('circle', state.unsyncFilters.circle);
    if (state.unsyncFilters.division !== 'ALL') params.append('division', state.unsyncFilters.division);
    if (state.unsyncFilters.vendor !== 'ALL') params.append('vendor', state.unsyncFilters.vendor);
    if (state.unsyncFilters.status_vendor !== 'ALL') params.append('status_vendor', state.unsyncFilters.status_vendor);
    if (state.unsyncFilters.aging !== 'ALL') params.append('aging', state.unsyncFilters.aging);
    if (state.unsyncFilters.match_status !== 'ALL') params.append('match_status', state.unsyncFilters.match_status);
    if (state.unsyncFilters.comm_type !== 'ALL') params.append('comm_type', state.unsyncFilters.comm_type);
    if (state.unsyncFilters.meter_type !== 'ALL') params.append('meter_type', state.unsyncFilters.meter_type);
    if (state.unsyncFilters.phase !== 'ALL') params.append('phase', state.unsyncFilters.phase);

    const res = await fetch(`/api/inventory/table?${params.toString()}`);
    const json = await res.json();
    if (!json.success) {
      container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load meters: ${json.error}</div>`;
      return;
    }

    const rows = json.rows || [];
    const total = json.total_records || 0;
    const startIdx = (state.unsyncPage - 1) * state.unsyncPageLimit + 1;
    const endIdx = Math.min(state.unsyncPage * state.unsyncPageLimit, total);

    document.getElementById('unsyncTableTitle').textContent = 'Detailed Unsync Meters Record Ledger';
    document.getElementById('unsyncTableRowCount').textContent = `${total.toLocaleString()} Records Total`;

    const pageInfo = document.getElementById('unsyncPageInfo');
    if (pageInfo) pageInfo.textContent = total > 0 ? `Showing ${startIdx}-${endIdx} of ${total.toLocaleString()} Meters` : '0 meters';

    const btnPrev = document.getElementById('btnPrevUnsyncPage');
    const btnNext = document.getElementById('btnNextUnsyncPage');
    if (btnPrev) btnPrev.disabled = (state.unsyncPage <= 1);
    if (btnNext) btnNext.disabled = (endIdx >= total);

    if (rows.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No unsync meters match the selected filter criteria.</div>';
      return;
    }

    container.innerHTML = `
      <table class="styled-table" id="tableUnsyncMeters">
        <thead>
          <tr>
            <th>MSN / Meter No</th>
            <th>Circle</th>
            <th>HigherOffice (Division)</th>
            <th>Agency (Vendor)</th>
            <th>Status-Vendor</th>
            <th>Phase</th>
            <th>Comm Type</th>
            <th>Meter Type</th>
            <th class="text-right">Date Gap</th>
            <th>Aging Bucket</th>
            <th>Status</th>
            <th>Matched Installed Details</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong style="color: var(--brand-cyan); font-family: monospace;">${r.msn}</strong></td>
              <td><span class="badge badge-indigo">${r.circle}</span></td>
              <td>${r.division}</td>
              <td>${r.vendor}</td>
              <td><span class="badge ${r.status_vendor === 'Active' ? 'badge-emerald' : 'badge-slate'}">${r.status_vendor}</span></td>
              <td>${r.phase || '--'}</td>
              <td><span class="badge badge-cyan">${r.comm_type || 'GPRS'}</span></td>
              <td>${r.meter_type || 'Consumer'}</td>
              <td class="text-right font-mono">${r.date_gap}d</td>
              <td><span class="badge ${r.aging_bucket === '>30 days' ? 'badge-rose' : (r.aging_bucket === '0-7 days' ? 'badge-emerald' : 'badge-amber')}">${r.aging_bucket}</span></td>
              <td><span class="badge ${r.match_status === 'Closed' ? 'badge-emerald' : 'badge-amber'}"><i class="fa-solid ${r.match_status === 'Closed' ? 'fa-check' : 'fa-clock'}"></i> ${r.match_status}</span></td>
              <td style="font-size: 0.78rem;">
                ${r.consumer_number ? `<strong>${r.consumer_number}</strong><br><span style="color: var(--text-muted);">${r.consumer_name || ''} &bull; ${String(r.install_date || '').substring(0, 10)}</span>` : '<span style="color: var(--text-muted);">--</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Error rendering meters ledger: ${err.message}</div>`;
  }
}

async function renderMeterAvailMetersTable() {
  const container = document.getElementById('meterAvailTableContainer');
  if (!container) return;

  container.innerHTML = '<div style="text-align:center; padding: 2.5rem; color: var(--text-muted);"><i class="fa-solid fa-spinner fa-spin"></i> Loading detailed Available meters from DuckDB...</div>';

  try {
    const params = new URLSearchParams({
      dashboard: 'meter_available',
      type: 'meters',
      page: state.meterAvailPage,
      limit: state.meterAvailPageLimit,
      search: state.searchFilters.meter_available || ''
    });
    if (state.meterAvailFilters.circle !== 'ALL') params.append('circle', state.meterAvailFilters.circle);
    if (state.meterAvailFilters.division !== 'ALL') params.append('division', state.meterAvailFilters.division);
    if (state.meterAvailFilters.vendor !== 'ALL') params.append('vendor', state.meterAvailFilters.vendor);
    if (state.meterAvailFilters.status_vendor !== 'ALL') params.append('status_vendor', state.meterAvailFilters.status_vendor);
    if (state.meterAvailFilters.aging !== 'ALL') params.append('aging', state.meterAvailFilters.aging);
    if (state.meterAvailFilters.match_status !== 'ALL') params.append('match_status', state.meterAvailFilters.match_status);
    if (state.meterAvailFilters.comm_type !== 'ALL') params.append('comm_type', state.meterAvailFilters.comm_type);
    if (state.meterAvailFilters.meter_type !== 'ALL') params.append('meter_type', state.meterAvailFilters.meter_type);
    if (state.meterAvailFilters.phase !== 'ALL') params.append('phase', state.meterAvailFilters.phase);

    const res = await fetch(`/api/inventory/table?${params.toString()}`);
    const json = await res.json();
    if (!json.success) {
      container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Failed to load meters: ${json.error}</div>`;
      return;
    }

    const rows = json.rows || [];
    const total = json.total_records || 0;
    const startIdx = (state.meterAvailPage - 1) * state.meterAvailPageLimit + 1;
    const endIdx = Math.min(state.meterAvailPage * state.meterAvailPageLimit, total);

    document.getElementById('meterAvailTableTitle').textContent = 'Detailed Available Meters Stock Ledger';
    document.getElementById('meterAvailTableRowCount').textContent = `${total.toLocaleString()} Records Total`;

    const pageInfo = document.getElementById('meterAvailPageInfo');
    if (pageInfo) pageInfo.textContent = total > 0 ? `Showing ${startIdx}-${endIdx} of ${total.toLocaleString()} Meters` : '0 meters';

    const btnPrev = document.getElementById('btnPrevMeterAvailPage');
    const btnNext = document.getElementById('btnNextMeterAvailPage');
    if (btnPrev) btnPrev.disabled = (state.meterAvailPage <= 1);
    if (btnNext) btnNext.disabled = (endIdx >= total);

    if (rows.length === 0) {
      container.innerHTML = '<div style="text-align:center; padding: 2rem; color: var(--text-muted);">No available meters match the selected filter criteria.</div>';
      return;
    }

    container.innerHTML = `
      <table class="styled-table" id="tableMeterAvailMeters">
        <thead>
          <tr>
            <th>MSN / Meter No</th>
            <th>Circle</th>
            <th>HigherOffice (Division)</th>
            <th>Agency (Vendor)</th>
            <th>Status-Vendor</th>
            <th>Phase</th>
            <th>Comm Type</th>
            <th>Meter Type</th>
            <th class="text-right">Date Gap</th>
            <th>Aging Bucket</th>
            <th>Inventory Status</th>
            <th>Matched Installed Details</th>
          </tr>
        </thead>
        <tbody>
          ${rows.map(r => `
            <tr>
              <td><strong style="color: var(--brand-cyan); font-family: monospace;">${r.msn}</strong></td>
              <td><span class="badge ${r.circle === 'SBPDCL' ? 'badge-purple' : 'badge-indigo'}">${r.circle}</span></td>
              <td>${r.division}</td>
              <td>${r.vendor}</td>
              <td><span class="badge ${r.status_vendor === 'Active' ? 'badge-emerald' : 'badge-slate'}">${r.status_vendor}</span></td>
              <td>${r.phase || '--'}</td>
              <td><span class="badge badge-cyan">${r.comm_type || 'GPRS'}</span></td>
              <td>${r.meter_type || 'Consumer'}</td>
              <td class="text-right font-mono">${r.date_gap}d</td>
              <td><span class="badge ${r.aging_bucket === '>30 days' ? 'badge-rose' : (r.aging_bucket === '0-7 days' ? 'badge-emerald' : 'badge-amber')}">${r.aging_bucket}</span></td>
              <td><span class="badge ${r.match_status === 'Installed' ? 'badge-emerald' : 'badge-cyan'}"><i class="fa-solid ${r.match_status === 'Installed' ? 'fa-bolt' : 'fa-boxes-stacked'}"></i> ${r.match_status}</span></td>
              <td style="font-size: 0.78rem;">
                ${r.consumer_number ? `<strong>${r.consumer_number}</strong><br><span style="color: var(--text-muted);">${r.consumer_name || ''} &bull; ${String(r.install_date || '').substring(0, 10)}</span>` : '<span style="color: var(--text-muted);">--</span>'}
              </td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    `;
  } catch (err) {
    container.innerHTML = `<div style="color: #f43f5e; padding: 1rem;">Error rendering available meters ledger: ${err.message}</div>`;
  }
}

function renderUnsyncCharts(data) {
  if (!data) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  // 1. Aging Stacked Bar Chart
  const agingCanvas = document.getElementById('chartUnsyncAging');
  if (agingCanvas && data.aging) {
    if (state.charts.unsyncAging) state.charts.unsyncAging.destroy();
    const ctx = agingCanvas.getContext('2d');
    const buckets = data.aging;
    state.charts.unsyncAging = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: buckets.map(b => b.aging_bucket),
        datasets: [
          { label: 'Closed in Master', data: buckets.map(b => b.matched), backgroundColor: '#10b981', borderRadius: 4 },
          { label: 'Open Unsync', data: buckets.map(b => b.pending), backgroundColor: '#f43f5e', borderRadius: 4 }
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

  // 2. Top Divisions Bar Chart
  const divCanvas = document.getElementById('chartUnsyncDivisions');
  if (divCanvas && data.divisions) {
    if (state.charts.unsyncDivs) state.charts.unsyncDivs.destroy();
    const topDivs = (data.divisions || []).slice(0, 10);
    const ctx = divCanvas.getContext('2d');
    state.charts.unsyncDivs = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topDivs.map(d => d.division),
        datasets: [
          { label: 'Closed', data: topDivs.map(d => d.matched), backgroundColor: '#10b981' },
          { label: 'Open Unsync', data: topDivs.map(d => d.pending), backgroundColor: '#8b5cf6' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } },
          y: { stacked: true, ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
        },
        plugins: { legend: { position: 'top', labels: { color: textColor } } }
      }
    });
  }

  // 3. Circle Share Donut (Excludes SBPDCL)
  const circleCanvas = document.getElementById('chartUnsyncCircles');
  if (circleCanvas && data.circles) {
    if (state.charts.unsyncCircles) state.charts.unsyncCircles.destroy();
    const ctx = circleCanvas.getContext('2d');
    state.charts.unsyncCircles = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.circles.map(c => `${c.circle} (${c.total.toLocaleString()})`),
        datasets: [{
          data: data.circles.map(c => c.total),
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

  // 4. Vendor Breakdown Chart
  const vendorCanvas = document.getElementById('chartUnsyncVendors');
  if (vendorCanvas && data.vendors) {
    if (state.charts.unsyncVendors) state.charts.unsyncVendors.destroy();
    const topVendors = (data.vendors || []).slice(0, 8);
    const ctx = vendorCanvas.getContext('2d');
    state.charts.unsyncVendors = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topVendors.map(v => v.vendor),
        datasets: [
          { label: 'Closed', data: topVendors.map(v => v.matched), backgroundColor: '#10b981' },
          { label: 'Open Unsync', data: topVendors.map(v => v.pending), backgroundColor: '#f59e0b' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: textColor, maxRotation: 45 }, grid: { display: false } },
          y: { stacked: true, ticks: { color: textColor }, grid: { color: gridColor } }
        },
        plugins: { legend: { position: 'top', labels: { color: textColor } } }
      }
    });
  }
}

function renderMeterAvailCharts(data) {
  if (!data) return;
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  const textColor = isDark ? '#94a3b8' : '#475569';
  const gridColor = isDark ? 'rgba(255, 255, 255, 0.06)' : 'rgba(0, 0, 0, 0.06)';

  // 1. Available Aging Bar Chart
  const agingCanvas = document.getElementById('chartMeterAvailAging');
  if (agingCanvas && data.aging) {
    if (state.charts.meterAvailAging) state.charts.meterAvailAging.destroy();
    const ctx = agingCanvas.getContext('2d');
    state.charts.meterAvailAging = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: data.aging.map(b => b.aging_bucket),
        datasets: [{
          label: 'Available Stock',
          data: data.aging.map(b => b.pending),
          backgroundColor: '#0284c7',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { ticks: { color: textColor }, grid: { display: false } },
          y: { ticks: { color: textColor, callback: v => (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: gridColor } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // 2. Circle Stock Donut (Includes SBPDCL)
  const circleCanvas = document.getElementById('chartMeterAvailCircles');
  if (circleCanvas && data.circles) {
    if (state.charts.meterAvailCircles) state.charts.meterAvailCircles.destroy();
    const ctx = circleCanvas.getContext('2d');
    state.charts.meterAvailCircles = new Chart(ctx, {
      type: 'doughnut',
      data: {
        labels: data.circles.map(c => `${c.circle} (${c.total.toLocaleString()})`),
        datasets: [{
          data: data.circles.map(c => c.total),
          backgroundColor: [...PALETTES.circles, '#ec4899', '#6366f1', '#14b8a6'],
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

  // 3. Top Divisions Stock
  const divCanvas = document.getElementById('chartMeterAvailDivisions');
  if (divCanvas && data.divisions) {
    if (state.charts.meterAvailDivs) state.charts.meterAvailDivs.destroy();
    const topDivs = (data.divisions || []).slice(0, 10);
    const ctx = divCanvas.getContext('2d');
    state.charts.meterAvailDivs = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topDivs.map(d => d.division),
        datasets: [{
          label: 'Available Meters',
          data: topDivs.map(d => d.total),
          backgroundColor: '#8b5cf6',
          borderRadius: 4
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        indexAxis: 'y',
        scales: {
          x: { ticks: { color: textColor, callback: v => (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: gridColor } },
          y: { ticks: { color: textColor, font: { size: 11 } }, grid: { display: false } }
        },
        plugins: { legend: { display: false } }
      }
    });
  }

  // 4. Top Vendors Available Allocation
  const vendorCanvas = document.getElementById('chartMeterAvailVendors');
  if (vendorCanvas && data.vendors) {
    if (state.charts.meterAvailVendors) state.charts.meterAvailVendors.destroy();
    const topVendors = (data.vendors || []).slice(0, 8);
    const ctx = vendorCanvas.getContext('2d');
    state.charts.meterAvailVendors = new Chart(ctx, {
      type: 'bar',
      data: {
        labels: topVendors.map(v => v.vendor),
        datasets: [
          { label: 'Installed in Master', data: topVendors.map(v => v.matched), backgroundColor: '#0284c7' },
          { label: 'Available (Not Installed)', data: topVendors.map(v => v.pending), backgroundColor: '#10b981' }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { stacked: true, ticks: { color: textColor, maxRotation: 45 }, grid: { display: false } },
          y: { stacked: true, ticks: { color: textColor, callback: v => (v >= 1000 ? (v/1000).toFixed(0) + 'k' : v) }, grid: { color: gridColor } }
        },
        plugins: { legend: { position: 'top', labels: { color: textColor } } }
      }
    });
  }
}

function exportUnsyncCsv() {
  const params = new URLSearchParams({ dashboard: 'unsync' });
  if (state.unsyncFilters.circle !== 'ALL') params.append('circle', state.unsyncFilters.circle);
  if (state.unsyncFilters.division !== 'ALL') params.append('division', state.unsyncFilters.division);
  if (state.unsyncFilters.vendor !== 'ALL') params.append('vendor', state.unsyncFilters.vendor);
  if (state.unsyncFilters.status_vendor !== 'ALL') params.append('status_vendor', state.unsyncFilters.status_vendor);
  if (state.unsyncFilters.aging !== 'ALL') params.append('aging', state.unsyncFilters.aging);
  if (state.unsyncFilters.match_status !== 'ALL') params.append('match_status', state.unsyncFilters.match_status);
  if (state.unsyncFilters.comm_type !== 'ALL') params.append('comm_type', state.unsyncFilters.comm_type);
  if (state.unsyncFilters.meter_type !== 'ALL') params.append('meter_type', state.unsyncFilters.meter_type);
  if (state.unsyncFilters.phase !== 'ALL') params.append('phase', state.unsyncFilters.phase);
  window.location.href = `/api/inventory/export?${params.toString()}`;
}

function exportMeterAvailCsv() {
  const params = new URLSearchParams({ dashboard: 'meter_available' });
  if (state.meterAvailFilters.circle !== 'ALL') params.append('circle', state.meterAvailFilters.circle);
  if (state.meterAvailFilters.division !== 'ALL') params.append('division', state.meterAvailFilters.division);
  if (state.meterAvailFilters.vendor !== 'ALL') params.append('vendor', state.meterAvailFilters.vendor);
  if (state.meterAvailFilters.status_vendor !== 'ALL') params.append('status_vendor', state.meterAvailFilters.status_vendor);
  if (state.meterAvailFilters.aging !== 'ALL') params.append('aging', state.meterAvailFilters.aging);
  if (state.meterAvailFilters.match_status !== 'ALL') params.append('match_status', state.meterAvailFilters.match_status);
  if (state.meterAvailFilters.comm_type !== 'ALL') params.append('comm_type', state.meterAvailFilters.comm_type);
  if (state.meterAvailFilters.meter_type !== 'ALL') params.append('meter_type', state.meterAvailFilters.meter_type);
  if (state.meterAvailFilters.phase !== 'ALL') params.append('phase', state.meterAvailFilters.phase);
  window.location.href = `/api/inventory/export?${params.toString()}`;
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
      else if (state.activeTab === 'tabUnsync') { loadUnsyncFilters(); loadUnsyncDashboard(); }
      else if (state.activeTab === 'tabMeterAvailable') { loadMeterAvailFilters(); loadMeterAvailDashboard(); }
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
          else if (state.activeTab === 'tabUnsync') { loadUnsyncFilters(); loadUnsyncDashboard(); }
          else if (state.activeTab === 'tabMeterAvailable') { loadMeterAvailFilters(); loadMeterAvailDashboard(); }
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

  // 1. Daily Reports Sync Buttons (Header & Tab)
  const triggerDailySync = () => {
    startSyncFlow('/api/sync/daily', 'Daily Reports MDM Live Downloader', 'fa-solid fa-cloud-arrow-down', 'Daily Installation');
  };
  const btnSyncD = document.getElementById('btnSyncDaily');
  if (btnSyncD) btnSyncD.addEventListener('click', triggerDailySync);
  const btnSyncDTab = document.getElementById('btnSyncDailyTab');
  if (btnSyncDTab) btnSyncDTab.addEventListener('click', triggerDailySync);

  // 2. Cumulative Master DB Sync Buttons (Header & Tab)
  const triggerMasterSync = () => {
    startSyncFlow('/api/sync/master', 'Master Database MDM Live Downloader', 'fa-solid fa-database', 'Master Database');
  };
  const btnSyncM = document.getElementById('btnSyncMaster');
  if (btnSyncM) btnSyncM.addEventListener('click', triggerMasterSync);
  const btnSyncMTab = document.getElementById('btnSyncMasterTab');
  if (btnSyncMTab) btnSyncMTab.addEventListener('click', triggerMasterSync);

  // 3. ULA Metering Sync Buttons (Header & Tab)
  const triggerUlaSync = () => {
    startSyncFlow('/api/sync/ula', 'ULA Metering Reconciliation Live Engine', 'fa-solid fa-rotate', 'ULA Scope & Installs');
  };
  const btnSyncUlaH = document.getElementById('btnSyncUlaHeader');
  if (btnSyncUlaH) btnSyncUlaH.addEventListener('click', triggerUlaSync);
  const btnSyncUlaT = document.getElementById('btnSyncUlaTab');
  if (btnSyncUlaT) btnSyncUlaT.addEventListener('click', triggerUlaSync);

  // 4. Unsync & Meter Available Inventory Sync Buttons
  const triggerInventorySync = () => {
    startSyncFlow('/api/sync/inventory', 'Unsync & Meter Available Live Reconciliation', 'fa-solid fa-rotate', 'Unsync & Meter Available Inventory');
  };

  const btnSyncInvHeader = document.getElementById('btnSyncInventoryHeader');
  if (btnSyncInvHeader) btnSyncInvHeader.addEventListener('click', triggerInventorySync);

  const btnSyncUnsync = document.getElementById('btnSyncUnsync');
  if (btnSyncUnsync) btnSyncUnsync.addEventListener('click', triggerInventorySync);

  const btnSyncMeterAvail = document.getElementById('btnSyncMeterAvail');
  if (btnSyncMeterAvail) btnSyncMeterAvail.addEventListener('click', triggerInventorySync);
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

// --- BACKGROUND AUTO-REFRESH (Pulls fresh sync data every 60s without manual page reload) ---
let lastKnownDataTimestamp = null;
setInterval(async () => {
  // Avoid refreshing if user has the sync console modal open or document is hidden
  if (document.hidden) return;
  const syncModal = document.getElementById('syncModal');
  if (syncModal && !syncModal.classList.contains('hidden')) return;

  try {
    const res = await fetch('/api/summary');
    if (!res.ok) return;
    const json = await res.json();
    const currentTimestamp = json.report_download_time || json.daily_download_time;

    // Detect if fresh data arrived from an hourly sync
    if (lastKnownDataTimestamp && currentTimestamp && currentTimestamp !== lastKnownDataTimestamp) {
      console.log(`[Auto-Refresh] Fresh hourly sync detected (${currentTimestamp}). Updating dashboard view...`);
      updateOverallMetrics(json);
      if (state.activeTab === 'tabDaily') loadDailyTable();
      else if (state.activeTab === 'tabCumulative') loadCumulativeTable();
      else if (state.activeTab === 'tabUla') loadUlaTable();
      else if (state.activeTab === 'tabUnsync') { loadUnsyncFilters(); loadUnsyncDashboard(); }
      else if (state.activeTab === 'tabMeterAvailable') { loadMeterAvailFilters(); loadMeterAvailDashboard(); }
    }
    lastKnownDataTimestamp = currentTimestamp;
    updateOverallMetrics(json);
  } catch (err) {
    // Silent fail on background polling
  }
}, 60000);
