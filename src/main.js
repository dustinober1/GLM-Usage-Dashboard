import './styles.css';
import Chart from 'chart.js/auto';

const DATA_URL = '/data/usage-history.json';
const REFRESH_INTERVAL = 30000;
const MIN_REFRESH_DELAY = 800; // Show "Syncing..." for at least 800ms

let tokenChart = null;
let callsChart = null;

const state = {
  data: null,
  loading: true,
  error: null,
  refreshing: false,
  timeRange: localStorage.getItem('timeRange') || '24h'
};

const timeRanges = [
  { value: '1h', label: '1 Hour', entries: 12 },
  { value: '6h', label: '6 Hours', entries: 72 },
  { value: '12h', label: '12 Hours', entries: 144 },
  { value: '24h', label: '24 Hours', entries: 288 },
  { value: '7d', label: '7 Days', entries: 2016 },
  { value: '30d', label: '30 Days', entries: 8640 }
];

/**
 * Format large numbers for display
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

/**
 * Calculate Usage Rates
 */
function calculateRates(entries) {
  if (entries.length < 2) return null;

  const latest = entries[entries.length - 1];
  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);
  const hourlyEntries = entries.filter(e => new Date(e.timestamp) >= oneHourAgo);

  if (hourlyEntries.length < 2) return null;

  const first = hourlyEntries[0];
  const tokensPerHour = latest.tokensUsed - first.tokensUsed;
  const callsPerHour = latest.modelCalls - first.modelCalls;
  // Prevent division by zero
  const avgTokensPerCall = callsPerHour > 0 ? tokensPerHour / callsPerHour : 0;

  return {
    tokensPerHour,
    callsPerHour,
    avgTokensPerCall
  };
}

/**
 * Render Rate Cards
 */
function renderRateCards(rates) {
  const container = document.getElementById('rates-grid');
  if (!container || !rates) return;

  container.innerHTML = `
    <div class="card">
      <div class="metric-label">Tokens/Hour</div>
      <div class="metric-value" style="font-size: 2rem">${formatNumber(rates.tokensPerHour)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Calls/Hour</div>
      <div class="metric-value" style="font-size: 2rem">${formatNumber(rates.callsPerHour)}</div>
    </div>
    <div class="card">
      <div class="metric-label">Avg Tokens/Call</div>
      <div class="metric-value" style="font-size: 2rem">${rates.avgTokensPerCall.toLocaleString(undefined, { maximumFractionDigits: 0 })}</div>
    </div>
  `;
}

/**
 * Render Metric Card
 */
function renderMetricCard(id, label, value, unit = '', trend = null) {
  const container = document.getElementById(id);
  if (!container) return;

  container.innerHTML = `
    <div class="card animate-fade-in">
      <div class="metric-label">
        <span>${label}</span>
      </div>
      <div class="metric-value">${value}<span style="font-size: 1rem; color: var(--text-dim); margin-left: 4px;">${unit}</span></div>
      ${trend ? `<div class="metric-trend ${trend > 0 ? 'trend-up' : 'trend-down'}">
        ${trend > 0 ? '↑' : '↓'} ${Math.abs(trend)}% vs start of period
      </div>` : ''}
    </div>
  `;
}

/**
 * Render Quota Card
 */
function renderQuotaCard(id, title, limitObj, prediction = null) {
  const container = document.getElementById(id);
  if (!container) return;

  const percent = limitObj.percentage;
  const statusClass = percent >= 80 ? 'danger' : (percent >= 50 ? 'warning' : '');

  const predictionHTML = prediction ? `
    <div class="quota-prediction ${prediction.hoursUntilExhausted < 24 ? 'warning' : ''}">
      ⏰ Exhaustion in ${prediction.hoursUntilExhausted}h
    </div>
  ` : '';

  container.innerHTML = `
    <div class="card animate-fade-in">
      <div class="quota-header">
        <div class="quota-title">${title}</div>
        <div class="quota-percent">${percent}%</div>
      </div>
      <div class="progress-container">
        <div class="progress-bar ${statusClass}" style="width: ${percent}%"></div>
      </div>
      <div class="quota-footer">
        <div>Used: <span>${formatNumber(limitObj.current)}</span></div>
        <div>Limit: <span>${formatNumber(limitObj.max)}</span></div>
      </div>
      ${predictionHTML}
    </div>
  `;
}

/**
 * Update Charts
 */
function updateCharts(entries) {
  const tokenCtx = document.getElementById('tokenChart');
  const callsCtx = document.getElementById('callsChart');
  if (!tokenCtx || !callsCtx) return;

  const labels = entries.map(e => {
    const d = new Date(e.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const tokenData = entries.map(e => e.tokensUsed / 1000000);
  const callData = entries.map(e => e.modelCalls);

  // Token Chart
  if (tokenChart) {
    tokenChart.data.labels = labels;
    tokenChart.data.datasets[0].data = tokenData;
    tokenChart.update('none');
  } else {
    tokenChart = new Chart(tokenCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'Tokens (Millions)',
          data: tokenData,
          borderColor: '#00d4ff',
          backgroundColor: 'rgba(0, 212, 255, 0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: true, grid: { display: false }, ticks: { color: '#6c757d', maxTicksLimit: 8 } },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#00d4ff' }
          }
        }
      }
    });
  }

  // Calls Chart
  if (callsChart) {
    callsChart.data.labels = labels;
    callsChart.data.datasets[0].data = callData;
    callsChart.update('none');
  } else {
    callsChart = new Chart(callsCtx, {
      type: 'line',
      data: {
        labels,
        datasets: [{
          label: 'API Calls',
          data: callData,
          borderColor: '#00ff88',
          backgroundColor: 'rgba(0, 255, 136, 0.15)',
          fill: true,
          tension: 0.4,
          pointRadius: 2,
          pointHoverRadius: 5
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: true, grid: { display: false }, ticks: { color: '#6c757d', maxTicksLimit: 8 } },
          y: {
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#00ff88' }
          }
        }
      }
    });
  }
}

/**
 * Update just the refresh button state without rebuilding DOM
 */
function updateRefreshButton(refreshing) {
  const btn = document.getElementById('refreshBtn');
  if (btn) {
    btn.textContent = refreshing ? 'Syncing...' : 'Sync Now';
    btn.disabled = refreshing;
  }
}

/**
 * Main Load Function
 */
async function fetchData(isManualRefresh = false) {
  const startTime = Date.now();

  if (isManualRefresh) {
    state.refreshing = true;
    updateRefreshButton(true); // Only update button, don't rebuild DOM
  }

  try {
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('Data not available. Run collection first.');
    const data = await res.json();

    // Ensure minimum display time for loading state
    if (isManualRefresh) {
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_REFRESH_DELAY) {
        await new Promise(r => setTimeout(r, MIN_REFRESH_DELAY - elapsed));
      }
    }

    state.data = data;
    state.loading = false;
    state.refreshing = false;
    tokenChart = null;
    callsChart = null;
    render();
  } catch (err) {
    console.error('Fetch error', err);
    state.error = err.message;
    state.loading = false;
    state.refreshing = false;
    updateRefreshButton(false); // Reset button on error
    render();
  }
}

/**
 * Main Render Loop
 */
function render() {
  const root = document.getElementById('app');
  if (state.loading) {
    root.innerHTML = '<div class="loading">Initializing Dashboard...</div>';
    return;
  }

  if (state.error) {
    root.innerHTML = `<div class="status-message">${state.error}</div>`;
    return;
  }

  const { entries: allEntries, quotaLimits, lastUpdated, quotaPrediction } = state.data;

  // Filter entries based on time range
  const rangeConfig = timeRanges.find(r => r.value === state.timeRange) || timeRanges[3];
  const entries = allEntries.slice(-rangeConfig.entries);

  const latest = entries[entries.length - 1];
  const first = entries[0];

  // Calculate trends
  const tokenTrend = first ? Math.round(((latest.tokensUsed - first.tokensUsed) / (first.tokensUsed || 1)) * 100) : 0;

  // Stale data warning
  const signalDate = new Date(lastUpdated);
  const isStale = (Date.now() - signalDate.getTime()) > 600000; // 10 minutes

  root.innerHTML = `
    <div class="app-container">
      <header>
        <div class="title-section">
          <h1>GLM Intelligence</h1>
          <div class="last-updated" style="color: ${isStale ? 'var(--danger)' : 'var(--text-dim)'}">
            ${isStale ? '⚠️ ' : ''}Last signal: ${signalDate.toLocaleString()}
          </div>
        </div>
        <div class="header-actions">
          <button class="btn" id="exportBtn">Export Data</button>
          <div class="time-range-selector">
            <select id="timeRangeSelect" class="time-range-select">
              ${timeRanges.map(r => `<option value="${r.value}" ${r.value === state.timeRange ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
          </div>
          <button class="btn btn-primary" id="refreshBtn" ${state.refreshing ? 'disabled' : ''}>
            ${state.refreshing ? 'Syncing...' : 'Sync Now'}
          </button>
        </div>
      </header>

      <div class="metrics-grid">
        <div id="m-tokens"></div>
        <div id="m-calls"></div>
        <div id="m-mcp"></div>
      </div>

      <div class="rates-section" style="margin-bottom: 40px;">
        <h3 style="margin-bottom: 16px; color: var(--text-secondary); font-size: 0.875rem; text-transform: uppercase; letter-spacing: 0.1em; font-weight: 700;">Usage Rates (Last Hour)</h3>
        <div id="rates-grid" class="metrics-grid"></div>
      </div>

      <div class="quota-section">
        <div id="q-tokens"></div>
        <div id="q-time"></div>
      </div>

      <div class="charts-row">
        <div class="card chart-card">
          <div class="quota-header">
            <div class="quota-title">Token Usage (Millions)</div>
          </div>
          <div class="chart-container">
            <canvas id="tokenChart"></canvas>
          </div>
        </div>
        <div class="card chart-card">
          <div class="quota-header">
            <div class="quota-title">API Calls</div>
          </div>
          <div class="chart-container">
            <canvas id="callsChart"></canvas>
          </div>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  const refreshBtn = document.getElementById('refreshBtn');
  const exportBtn = document.getElementById('exportBtn');
  const timeRangeSelect = document.getElementById('timeRangeSelect');

  if (refreshBtn) refreshBtn.onclick = () => fetchData(true);
  if (exportBtn) exportBtn.onclick = exportCSV;
  if (timeRangeSelect) {
    timeRangeSelect.onchange = (e) => {
      state.timeRange = e.target.value;
      localStorage.setItem('timeRange', state.timeRange);
      render();
    };
  }

  // Render sub-components
  renderMetricCard('m-tokens', 'Compute Tokens', formatNumber(latest.tokensUsed), 'tokens', tokenTrend);
  renderMetricCard('m-calls', 'API Manifestations', formatNumber(latest.modelCalls), 'calls');
  renderMetricCard('m-mcp', 'MCP Tool Navigations', latest.mcpCalls, 'calls');

  const rates = calculateRates(entries);
  renderRateCards(rates);

  renderQuotaCard('q-tokens', 'Neural Token Capacity', quotaLimits.tokenQuota, quotaPrediction);
  renderQuotaCard('q-time', 'Temporal Access Quota', quotaLimits.timeQuota);

  updateCharts(entries);
}

/**
 * Export CSV
 */
function exportCSV() {
  const { entries } = state.data;
  const headers = ['Timestamp', 'Model Calls', 'Tokens Used', 'MCP Calls'];
  const rows = entries.map(e => [e.timestamp, e.modelCalls, e.tokensUsed, e.mcpCalls]);

  let csvContent = "data:text/csv;charset=utf-8,"
    + headers.join(",") + "\n"
    + rows.map(r => r.join(",")).join("\n");

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `glm_usage_${new Date().toISOString().split('T')[0]}.csv`);
  document.body.appendChild(link);
  link.click();
}

// Initial Kickoff
fetchData();
setInterval(fetchData, REFRESH_INTERVAL);
