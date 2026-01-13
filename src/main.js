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
 * Theme Management
 */
function initTheme() {
  const savedTheme = localStorage.getItem('theme') || 'dark';
  document.documentElement.setAttribute('data-theme', savedTheme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const newTheme = current === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', newTheme);
  localStorage.setItem('theme', newTheme);

  const themeBtn = document.getElementById('themeToggle');
  if (themeBtn) {
    themeBtn.textContent = newTheme === 'dark' ? '☀️' : '🌙';
  }
}

/**
 * Close any open modal
 */
function closeModal() {
  const modal = document.querySelector('.modal');
  if (modal) modal.remove();
}

/**
 * Show Help Modal with Keyboard Shortcuts
 */
function showHelpModal() {
  closeModal();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Keyboard Shortcuts</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="shortcut-list">
          <div class="shortcut-item"><kbd>R</kbd> <span>Refresh data</span></div>
          <div class="shortcut-item"><kbd>E</kbd> <span>Export CSV</span></div>
          <div class="shortcut-item"><kbd>S</kbd> <span>Settings</span></div>
          <div class="shortcut-item"><kbd>T</kbd> <span>Toggle theme</span></div>
          <div class="shortcut-item"><kbd>H</kbd> or <kbd>?</kbd> <span>Show help</span></div>
          <div class="shortcut-item"><kbd>Esc</kbd> <span>Close modal</span></div>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);
  modal.querySelector('.close-modal').onclick = () => modal.remove();
  modal.onclick = (e) => { if (e.target === modal) modal.remove(); };
}

/**
 * Initialize Keyboard Shortcuts
 */
function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Don't trigger if user is typing in an input
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA' || e.target.tagName === 'SELECT') {
      return;
    }

    switch (e.key.toLowerCase()) {
      case 'r':
        e.preventDefault();
        fetchData(true);
        showToast('Refreshing data...', 'info');
        break;
      case 'e':
        e.preventDefault();
        if (state.data) {
          exportCSV();
          showToast('Data exported', 'success');
        }
        break;
      case 's':
        e.preventDefault();
        openSettingsModal();
        break;
      case 't':
        e.preventDefault();
        toggleTheme();
        break;
      case 'h':
        e.preventDefault();
        showHelpModal();
        break;
      case '?':
        e.preventDefault();
        showHelpModal();
        break;
      case 'escape':
        closeModal();
        break;
    }
  });
}

/**
 * Render Skeleton Loading Screen
 */
function renderSkeleton() {
  return `
    <div class="app-container">
      <div class="header-skeleton">
        <div class="skeleton skeleton-text" style="width: 200px; height: 32px;"></div>
        <div class="skeleton skeleton-text" style="width: 150px;"></div>
      </div>
      
      <div class="metrics-grid">
        ${[1, 2, 3].map(() => `
          <div class="card">
            <div class="skeleton skeleton-text" style="width: 100px; margin-bottom: 16px;"></div>
            <div class="skeleton skeleton-metric"></div>
          </div>
        `).join('')}
      </div>
      
      <div class="quota-section">
        ${[1, 2].map(() => `
          <div class="card">
            <div class="skeleton skeleton-text" style="width: 150px; margin-bottom: 20px;"></div>
            <div class="skeleton" style="height: 12px; margin-bottom: 16px;"></div>
            <div class="skeleton skeleton-text" style="width: 50%;"></div>
          </div>
        `).join('')}
      </div>
      
      <div class="charts-row">
        ${[1, 2].map(() => `
          <div class="card">
            <div class="skeleton skeleton-text" style="width: 150px; margin-bottom: 20px;"></div>
            <div class="skeleton skeleton-chart"></div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

/**
 * Format large numbers for display
 */
export function formatNumber(num) {
  if (num >= 1000000) return (num / 1000000).toFixed(2) + 'M';
  if (num >= 1000) return (num / 1000).toFixed(1) + 'K';
  return num.toLocaleString();
}

/**
 * Calculate Usage Rates
 */
export function calculateRates(entries) {
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
export function renderRateCards(rates) {
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
export function renderMetricCard(id, label, value, unit = '', trend = null) {
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
export function renderQuotaCard(id, title, limitObj, prediction = null) {
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
export function updateCharts(entries) {
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
 * Fetch Data from API
 */
export async function fetchData(isManualRefresh = false) {
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

  // Show skeleton during initial load
  if (state.loading && !state.data) {
    root.innerHTML = renderSkeleton();
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

  // Get current profile from localStorage (set by CLI when collecting data)
  const currentProfile = localStorage.getItem('currentProfile') || 'default';
  const showProfileBadge = currentProfile !== 'default';

  root.innerHTML = `
    <div class="app-container">
      <header>
        <div class="title-section">
          <h1>GLM Intelligence</h1>
          <div class="header-subtitle">
            ${showProfileBadge ? `<span class="profile-indicator">👤 ${currentProfile}</span>` : ''}
            <div class="last-updated" style="color: ${isStale ? 'var(--danger)' : 'var(--text-dim)'}">
              ${isStale ? '⚠️ ' : ''}Last signal: ${signalDate.toLocaleString()}
            </div>
          </div>
        </div>
        <div class="header-actions">
          <button class="btn" id="exportBtn">Export Data</button>
          <div class="time-range-selector">
            <select id="timeRangeSelect" class="time-range-select">
              ${timeRanges.map(r => `<option value="${r.value}" ${r.value === state.timeRange ? 'selected' : ''}>${r.label}</option>`).join('')}
            </select>
          </div>
          <button class="btn" id="settingsBtn" title="Settings">⚙️</button>
          <button class="btn theme-toggle" id="themeToggle" title="Toggle theme">${(localStorage.getItem('theme') || 'dark') === 'dark' ? '☀️' : '🌙'}</button>
          <button class="btn" id="helpBtn" title="Keyboard shortcuts">?</button>
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

      <div class="tool-section">
        <h3>MCP Tool Breakdown</h3>
        <div id="tool-breakdown"></div>
      </div>
    </div>
  `;

  // Attach event listeners
  const refreshBtn = document.getElementById('refreshBtn');
  const exportBtn = document.getElementById('exportBtn');
  const timeRangeSelect = document.getElementById('timeRangeSelect');

  const settingsBtn = document.getElementById('settingsBtn');
  if (refreshBtn) refreshBtn.onclick = () => fetchData(true);
  if (exportBtn) exportBtn.onclick = exportCSV;
  if (settingsBtn) settingsBtn.onclick = openSettingsModal;
  if (timeRangeSelect) {
    timeRangeSelect.onchange = (e) => {
      state.timeRange = e.target.value;
      localStorage.setItem('timeRange', state.timeRange);
      render();
    };
  }

  // Theme and help buttons
  const themeToggleBtn = document.getElementById('themeToggle');
  const helpBtn = document.getElementById('helpBtn');
  if (themeToggleBtn) themeToggleBtn.onclick = toggleTheme;
  if (helpBtn) helpBtn.onclick = showHelpModal;

  // Render sub-components
  renderMetricCard('m-tokens', 'Compute Tokens', formatNumber(latest.tokensUsed), 'tokens', tokenTrend);
  renderMetricCard('m-calls', 'API Manifestations', formatNumber(latest.modelCalls), 'calls');
  renderMetricCard('m-mcp', 'MCP Tool Navigations', latest.mcpCalls, 'calls');

  const rates = calculateRates(entries);
  renderRateCards(rates);

  renderQuotaCard('q-tokens', 'Neural Token Capacity', quotaLimits.tokenQuota, quotaPrediction);
  renderQuotaCard('q-time', 'Temporal Access Quota', quotaLimits.timeQuota);

  // MCP Tool Breakdown
  const latestEntry = entries[entries.length - 1];
  renderToolBreakdown(latestEntry?.mcpToolBreakdown || null);

  updateCharts(entries);

  // Check for quota alerts
  if (quotaLimits?.tokenQuota) {
    checkQuotaAlerts(quotaLimits.tokenQuota);
  }
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

/**
 * Settings Modal
 */
export function openSettingsModal() {
  // Remove any existing modal
  const existingModal = document.querySelector('.modal');
  if (existingModal) existingModal.remove();

  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.innerHTML = `
    <div class="modal-content">
      <div class="modal-header">
        <h2>Settings</h2>
        <button class="close-modal">&times;</button>
      </div>
      <div class="modal-body">
        <div class="setting-group">
          <label>Alert Thresholds</label>
          <div class="setting-row">
            <label>Warning level:</label>
            <select id="warningThreshold">
              <option value="50">50%</option>
              <option value="60">60%</option>
              <option value="70">70%</option>
            </select>
          </div>
          <div class="setting-row">
            <label>Critical level:</label>
            <select id="criticalThreshold">
              <option value="80">80%</option>
              <option value="90">90%</option>
            </select>
          </div>
        </div>
        <div class="setting-group">
          <label>Refresh Interval</label>
          <div class="setting-row">
            <label>Auto-refresh every:</label>
            <select id="refreshInterval">
              <option value="15000">15 seconds</option>
              <option value="30000">30 seconds</option>
              <option value="60000">1 minute</option>
              <option value="300000">5 minutes</option>
            </select>
          </div>
        </div>
        <div class="setting-group">
          <label>Notifications</label>
          <div class="setting-row">
            <label>Browser notifications:</label>
            <select id="notificationsEnabled">
              <option value="true">Enabled</option>
              <option value="false">Disabled</option>
            </select>
          </div>
        </div>
      </div>
      <div class="modal-footer">
        <button class="btn" id="cancelSettings">Cancel</button>
        <button class="btn btn-primary" id="saveSettings">Save</button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  // Load current settings
  document.getElementById('warningThreshold').value = localStorage.getItem('warningThreshold') || '50';
  document.getElementById('criticalThreshold').value = localStorage.getItem('criticalThreshold') || '80';
  document.getElementById('refreshInterval').value = localStorage.getItem('refreshInterval') || '30000';
  document.getElementById('notificationsEnabled').value = localStorage.getItem('notificationsEnabled') || 'true';

  // Event handlers
  const closeModal = () => modal.remove();
  modal.querySelector('.close-modal').onclick = closeModal;
  document.getElementById('cancelSettings').onclick = closeModal;
  modal.onclick = (e) => { if (e.target === modal) closeModal(); };

  document.getElementById('saveSettings').onclick = () => {
    localStorage.setItem('warningThreshold', document.getElementById('warningThreshold').value);
    localStorage.setItem('criticalThreshold', document.getElementById('criticalThreshold').value);
    localStorage.setItem('refreshInterval', document.getElementById('refreshInterval').value);
    localStorage.setItem('notificationsEnabled', document.getElementById('notificationsEnabled').value);
    closeModal();
    // Show confirmation toast
    showToast('Settings saved successfully!', 'success');
  };
}

/**
 * Show Toast Notification
 */
export function showToast(message, type = 'info') {
  const existingToast = document.querySelector('.notification-toast');
  if (existingToast) existingToast.remove();

  const toast = document.createElement('div');
  toast.className = `notification-toast ${type}`;
  toast.textContent = message;
  document.body.appendChild(toast);

  setTimeout(() => toast.remove(), 3000);
}

/**
 * Check Quota Alerts and Send Notifications
 */
export function checkQuotaAlerts(quotaData) {
  const notificationsEnabled = localStorage.getItem('notificationsEnabled') !== 'false';
  if (!notificationsEnabled) return;

  const warningThreshold = parseInt(localStorage.getItem('warningThreshold') || '50');
  const criticalThreshold = parseInt(localStorage.getItem('criticalThreshold') || '80');
  const lastAlertTime = parseInt(localStorage.getItem('lastAlertTime') || '0');
  const alertCooldown = 60 * 60 * 1000; // 1 hour between alerts
  const now = Date.now();

  if (now - lastAlertTime < alertCooldown) return;

  const percent = quotaData.percentage;

  if (percent >= criticalThreshold) {
    sendNotification('Critical Alert', `Token quota at ${percent}% - Approaching limit!`);
    localStorage.setItem('lastAlertTime', now.toString());
  } else if (percent >= warningThreshold) {
    sendNotification('Warning', `Token quota at ${percent}% - Monitor usage`);
    localStorage.setItem('lastAlertTime', now.toString());
  }
}

/**
 * Send Browser Notification
 */
export function sendNotification(title, message) {
  if (!('Notification' in window)) return;

  if (Notification.permission === 'granted') {
    new Notification(`GLM ${title}`, { body: message });
  } else if (Notification.permission !== 'denied') {
    Notification.requestPermission().then(permission => {
      if (permission === 'granted') {
        new Notification(`GLM ${title}`, { body: message });
      }
    });
  }
}

/**
 * Request Notification Permissions
 */
export function requestNotificationPermission() {
  if ('Notification' in window && Notification.permission === 'default') {
    Notification.requestPermission();
  }
}

/**
 * Render Tool Breakdown
 */
export function renderToolBreakdown(breakdown) {
  const container = document.getElementById('tool-breakdown');
  if (!container || !breakdown || Object.keys(breakdown).length === 0) {
    if (container) {
      container.innerHTML = `<div class="card"><p style="color: var(--text-dim); text-align: center; padding: 20px;">No MCP tool data available</p></div>`;
    }
    return;
  }

  const sortedTools = Object.entries(breakdown)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 10);

  const total = sortedTools.reduce((sum, [, count]) => sum + count, 0);

  container.innerHTML = `
    <div class="card">
      <div class="quota-header">
        <div class="quota-title">MCP Tool Usage</div>
      </div>
      <div class="tool-list">
        ${sortedTools.map(([tool, count]) => `
          <div class="tool-item">
            <div class="tool-name">${tool}</div>
            <div class="tool-count">${count} calls (${((count / total) * 100).toFixed(1)}%)</div>
            <div class="tool-bar">
              <div class="tool-bar-fill" style="width: ${(count / total * 100).toFixed(1)}%"></div>
            </div>
          </div>
        `).join('')}
      </div>
    </div>
  `;
}

// Initial Kickoff
if (!import.meta.env.TEST) {
  // Initialize theme and keyboard shortcuts
  initTheme();
  initKeyboardShortcuts();

  fetchData();
  // Use configured refresh interval
  const refreshInterval = parseInt(localStorage.getItem('refreshInterval') || '30000');
  setInterval(fetchData, refreshInterval);
  // Request notification permission on load
  requestNotificationPermission();
}
