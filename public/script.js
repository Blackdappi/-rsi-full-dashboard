let priceChart, rsiChart, sparkChart;
let tradesData = [];

// Mock RSI data generator
function generateRsiData(count = 50) {
  const data = [];
  const labels = [];
  for (let i = 0; i < count; i++) {
    const value = 50 + 25 * Math.sin(i / 3.5) + 10 * Math.sin(i / 1.2);
    data.push(Math.max(0, Math.min(100, Math.round(value * 100) / 100)));
    labels.push(`T-${count - i}`);
  }
  return { labels, data };
}

async function updateDashboard() {
  try {
    // Fetch all data in parallel
    const [statsRes, monRes, sparkRes, healthRes, trendRes, tradesRes] = await Promise.all([
      fetch('/api/stats'),
      fetch('/api/monitor'),
      fetch('/api/sparkline'),
      fetch('/api/health'),
      fetch('/api/trend'),
      fetch('/api/trades')
    ]);

    const stats = await statsRes.json();
    const mon = await monRes.json();
    const spark = await sparkRes.json();
    const health = await healthRes.json();
    const trend = await trendRes.json();
    tradesData = await tradesRes.json();

    // Update scalars
    document.getElementById('pnlValue').textContent = '$' + (stats.total_pnl || 0).toFixed(2);
    document.getElementById('pnl').textContent = '$' + (stats.total_pnl || 0).toFixed(2);
    const pnlEl = document.getElementById('pnl');
    const pnlHeaderEl = document.getElementById('pnlHeader');
    pnlEl.className = pnlEl.className.replace(/positive|negative/g, '');
    pnlHeaderEl.className = pnlHeaderEl.className.replace(/positive|negative/g, '');
    if (stats.total_pnl > 0) {
      pnlEl.classList.add('positive');
      pnlHeaderEl.classList.add('positive');
      document.getElementById('pnlChange').textContent = '+' + (stats.total_pnl / 100).toFixed(1) + '%'; // mock
      document.getElementById('pnlChange').className = 'change positive';
    } else {
      pnlEl.classList.add('negative');
      pnlHeaderEl.classList.add('negative');
      document.getElementById('pnlChange').textContent = (stats.total_pnl / 100).toFixed(1) + '%';
      document.getElementById('pnlChange').className = 'change negative';
    }

    document.getElementById('winrate').textContent = (stats.winrate || 0).toFixed(1) + '%';
    document.getElementById('losses').textContent = '$' + Math.abs(stats.total_losses || 0).toFixed(2);
    document.getElementById('trades').textContent = stats.total_trades || 0;

    document.getElementById('currentPrice').textContent = (mon.current_price || 0).toLocaleString();
    document.getElementById('currentRsi').textContent = mon.current_rsi || '-';
    const sigEl = document.getElementById('signal');
    sigEl.textContent = mon.signal || 'HOLD';
    sigEl.className = 'signal ' + (mon.signal || 'HOLD');

    document.getElementById('health').innerHTML = `Status: ${health.status}<br>Uptime: ${Math.floor(health.uptime / 60).toFixed(0)}m`;

    const trendEl = document.getElementById('trend');
    trendEl.innerHTML = `${trend.trend}<br><small>${trend.change}</small>`;
    trendEl.style.color = trend.trend === 'Bullish' ? '#00FF88' : '#FF4444';

    // Sparkline
    const sparkCtx = document.getElementById('sparkChart').getContext('2d');
    if (sparkChart) sparkChart.destroy();
    sparkChart = new Chart(sparkCtx, {
      type: 'line',
      data: {
        labels: spark.labels.slice(-20),
        datasets: [{
          data: spark.data.slice(-20),
          borderColor: '#DAA520',
          backgroundColor: 'rgba(218,165,32,0.2)',
          tension: 0.4,
          fill: true,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: { x: { display: false }, y: { display: false } },
        plugins: { legend: { display: false } }
      }
    });

    // Price Chart (using spark equity as proxy)
    const priceCtx = document.getElementById('priceChart').getContext('2d');
    if (priceChart) priceChart.destroy();
    priceChart = new Chart(priceCtx, {
      type: 'line',
      data: {
        labels: spark.labels,
        datasets: [{
          label: 'Equity Curve',
          data: spark.data,
          borderColor: '#00FF88',
          backgroundColor: 'rgba(0,255,136,0.1)',
          tension: 0.3,
          fill: true,
          pointRadius: 2,
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: { beginAtZero: false }
        },
        plugins: { legend: { display: true, labels: { color: '#e5e5e5' } } }
      }
    });

    // RSI Chart (mock + current)
    const rsiData = generateRsiData(50);
    rsiData.data[rsiData.data.length - 1] = parseFloat(mon.current_rsi) || 50;
    const rsiCtx = document.getElementById('rsiChart').getContext('2d');
    if (rsiChart) rsiChart.destroy();
    rsiChart = new Chart(rsiCtx, {
      type: 'line',
      data: {
        labels: rsiData.labels,
        datasets: [{
          label: 'RSI',
          data: rsiData.data,
          borderColor: '#9370DB',
          backgroundColor: 'rgba(147,112,219,0.1)',
          tension: 0.4,
          fill: true,
          pointRadius: 3,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          y: {
            min: 0,
            max: 100,
            grid: { color: '#333' },
            ticks: { color: '#aaa' }
          },
          x: { grid: { display: false }, ticks: { color: '#aaa' } }
        },
        plugins: {
          legend: { display: true, labels: { color: '#e5e5e5' } },
          annotation: {
            annotations: {
              low: { type: 'line', yMin: 30, yMax: 30, borderColor: '#FF4444', borderWidth: 2, label: { content: 'Oversold', enabled: true } },
              high: { type: 'line', yMin: 70, yMax: 70, borderColor: '#00FF88', borderWidth: 2, label: { content: 'Overbought', enabled: true } }
            }
          }
        }
      }
    });

    // Trades table
    const tbody = document.getElementById('tradesBody');
    tbody.innerHTML = '';
    tradesData.slice(0, 10).forEach(trade => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td>${trade.id}</td>
        <td>${new Date(trade.timestamp).toLocaleString()}</td>
        <td>${trade.rsi}</td>
        <td class="signal ${trade.signal}">${trade.signal}</td>
        <td>$${trade.entry_price}</td>
        <td>$${trade.exit_price}</td>
        <td class="pnl ${trade.pnl > 0 ? 'positive' : 'negative'}">$${trade.pnl.toFixed(4)}</td>
      `;
    });

  } catch (e) {
    console.error('Dashboard update error:', e);
  }
}

// Init
updateDashboard();
setInterval(updateDashboard, 30000);

// Responsive resize for charts
window.addEventListener('resize', () => {
  if (priceChart) priceChart.resize();
  if (rsiChart) rsiChart.resize();
  if (sparkChart) sparkChart.resize();
});