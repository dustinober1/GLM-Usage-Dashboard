import './styles.css';
import Chart from 'chart.js/auto';

const DATA_URL = '/data/usage-history.json';
const REFRESH_INTERVAL = 30000;

let usageChart = null;

const state = {
  data: null,
  loading: true,
  error: null
};

/**
 * Format large numbers for display
 */
function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

/**
 * Calculate forecasting (simple linear projection)
 */
function calculateForecast(entries, limitObj) {
  if (entries.length < 2) return null;
  const first = entries[0];
  const last = entries[entries.length - 1];
  const timeDiff = new Date(last.timestamp) - new Date(first.timestamp);
  const usageDiff = last.tokensUsed - first.tokensUsed;

  if (timeDiff <= 0) return null;

  const usagePerHour = (usageDiff / timeDiff) * 3600000;
  return {
    usagePerHour,
    tokensRemaining: limitObj.max - limitObj.current,
    hoursRemaining: (limitObj.max - limitObj.current) / usagePerHour
  };
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
function renderQuotaCard(id, title, limitObj) {
  const container = document.getElementById(id);
  if (!container) return;

  const percent = limitObj.percentage;
  const statusClass = percent >= 80 ? 'danger' : (percent >= 50 ? 'warning' : '');

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
    </div>
  `;
}

/**
 * Update Chart
 */
function updateCharts(entries) {
  const ctx = document.getElementById('usageChart');
  if (!ctx) return;

  const labels = entries.map(e => {
    const d = new Date(e.timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  });

  const tokenData = entries.map(e => e.tokensUsed / 1000000);
  const callData = entries.map(e => e.modelCalls);

  if (usageChart) {
    usageChart.data.labels = labels;
    usageChart.data.datasets[0].data = tokenData;
    usageChart.data.datasets[1].data = callData;
    usageChart.update('none');
  } else {
    usageChart = new Chart(ctx, {
      type: 'line',
      data: {
        labels,
        datasets: [
          {
            label: 'Tokens (Millions)',
            data: tokenData,
            borderColor: '#00d4ff',
            backgroundColor: 'rgba(0, 212, 255, 0.1)',
            fill: true,
            tension: 0.4,
            yAxisID: 'y'
          },
          {
            label: 'Model Calls',
            data: callData,
            borderColor: '#00ff88',
            backgroundColor: 'rgba(0, 255, 136, 0.1)',
            fill: true,
            tension: 0.4,
            yAxisID: 'y1'
          }
        ]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: { display: false }
        },
        scales: {
          x: { display: true, grid: { display: false }, ticks: { color: '#6c757d' } },
          y: {
            position: 'left',
            grid: { color: 'rgba(255,255,255,0.05)' },
            ticks: { color: '#00d4ff' }
          },
          y1: {
            position: 'right',
            grid: { display: false },
            ticks: { color: '#00ff88' }
          }
        }
      }
    });
  }
}

/**
 * Main Load Function
 */
async function fetchData() {
  try {
    const res = await fetch(DATA_URL + '?t=' + Date.now());
    if (!res.ok) throw new Error('Data not available. Run collection first.');
    const data = await res.json();
    state.data = data;
    state.loading = false;
    render();
  } catch (err) {
    state.error = err.message;
    state.loading = false;
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

  const { entries, quotaLimits, lastUpdated } = state.data;
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
          <button class="btn btn-primary" id="refreshBtn">Sync Now</button>
        </div>
      </header>

      <div class="metrics-grid">
        <div id="m-tokens"></div>
        <div id="m-calls"></div>
        <div id="m-mcp"></div>
      </div>

      <div class="quota-section">
        <div id="q-tokens"></div>
        <div id="q-time"></div>
      </div>

      <div class="card">
        <div class="quota-header">
           <div class="quota-title">Resource Utilization History</div>
        </div>
        <div class="chart-container">
          <canvas id="usageChart"></canvas>
        </div>
      </div>
    </div>
  `;

  // Attach event listeners
  document.getElementById('refreshBtn').onclick = fetchData;
  document.getElementById('exportBtn').onclick = exportCSV;

  // Render sub-components
  renderMetricCard('m-tokens', 'Compute Tokens', formatNumber(latest.tokensUsed), 'tokens', tokenTrend);
  renderMetricCard('m-calls', 'API Manifestations', formatNumber(latest.modelCalls), 'calls');
  renderMetricCard('m-mcp', 'MCP Tool Navigations', latest.mcpCalls, 'calls');

  renderQuotaCard('q-tokens', 'Neural Token Capacity', quotaLimits.tokenQuota);
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
