const express = require('express');
const fs = require('fs');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

const tradesFile = path.join(__dirname, 'trades.json');
let trades = [];

function loadTrades() {
  if (fs.existsSync(tradesFile)) {
    try {
      trades = JSON.parse(fs.readFileSync(tradesFile, 'utf8'));
      console.log(`Loaded ${trades.length} trades from JSON.`);
    } catch(e) {
      console.error('Error loading trades.json:', e.message);
      trades = [];
    }
  } else {
    console.log('No trades.json found.');
  }
}

function saveTrades() {
  try {
    fs.writeFileSync(tradesFile, JSON.stringify(trades, null, 2));
    console.log('Saved trades to JSON.');
  } catch(e) {
    console.error('Error saving trades:', e.message);
  }
}

function generateSimTrades() {
  console.log('Generating simulated trades...');
  trades = [];
  const count = 1000;
  for(let i = 0; i < count; i++) {
    const rsi = Math.random() < 0.5 ? (25 + Math.random() * 10) : (70 + Math.random() * 10);
    const signal = rsi < 35 ? 'BUY' : 'SELL';
    const entry_price = 45000 + Math.random() * 10000;
    const change_pct = (Math.random() - 0.4) * 0.06;
    const exit_price = entry_price * (1 + change_pct);
    const pnl = signal === 'BUY' ? (exit_price - entry_price) : (entry_price - exit_price);
    const is_win = pnl > 0 ? 1 : 0;
    trades.push({
      id: i + 1,
      timestamp: new Date(Date.now() - (count - i - 1) * 3600000).toISOString(),
      symbol: 'BTCUSDT',
      rsi: parseFloat(rsi.toFixed(2)),
      signal,
      entry_price: parseFloat(entry_price.toFixed(2)),
      exit_price: parseFloat(exit_price.toFixed(2)),
      pnl: parseFloat(pnl.toFixed(4)),
      is_win
    });
  }
  saveTrades();
  console.log(`Generated ${count} simulated trades.`);
}

// Load and check
loadTrades();
if (trades.length === 0) {
  generateSimTrades();
}

// API endpoints
app.get('/api/stats', (req, res) => {
  try {
    const total_trades = trades.length;
    if (total_trades === 0) {
      return res.json({total_trades: 0, total_pnl: 0, winrate: 0, total_losses: 0, num_losses: 0});
    }
    const total_pnl = trades.reduce((sum, t) => sum + t.pnl, 0);
    const wins = trades.reduce((sum, t) => sum + t.is_win, 0);
    const winrate = parseFloat((wins / total_trades * 100).toFixed(2));
    const total_losses = trades.reduce((sum, t) => sum + (t.pnl < 0 ? t.pnl : 0), 0);
    const num_losses = trades.filter(t => t.pnl < 0).length;
    res.json({total_trades, total_pnl, winrate, total_losses, num_losses});
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/trades', (req, res) => {
  try {
    const recentTrades = trades.slice(-10).reverse();
    res.json(recentTrades);
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/monitor', (req, res) => {
  try {
    const last = trades[trades.length - 1];
    if (!last) {
      return res.json({
        current_rsi: '50',
        current_price: '50000',
        signal: 'HOLD',
        status: 'Running'
      });
    }
    const current_price = parseFloat(((last.entry_price + last.exit_price) / 2).toFixed(2));
    res.json({
      current_rsi: last.rsi.toFixed(2),
      current_price,
      signal: last.signal,
      status: 'Running'
    });
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/sparkline', (req, res) => {
  try {
    const equityCurve = trades.reduce((curve, trade, index) => {
      const prev = index === 0 ? 0 : curve[index - 1];
      curve.push(prev + trade.pnl);
      return curve;
    }, []);
    const recentTrades = trades.slice(-20);
    const recentEquity = equityCurve.slice(-20);
    res.json({
      labels: recentTrades.map(r => `#${r.id}`),
      data: recentEquity.map(e => parseFloat(e.toFixed(2)))
    });
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/health', (req, res) => {
  res.json({status: 'healthy', uptime: process.uptime(), last_update: new Date().toISOString()});
});

app.get('/api/trend', (req, res) => {
  try {
    const recentPnls = trades.slice(-5).map(t => t.pnl);
    if (recentPnls.length === 0) {
      return res.json({trend: 'Neutral', change: '0%'});
    }
    const avg = recentPnls.reduce((sum, p) => sum + p, 0) / recentPnls.length;
    const trend = avg > 0 ? 'Bullish' : 'Bearish';
    const change = (avg * 5).toFixed(2) + '%';
    res.json({trend, change});
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`RSI Dashboard running on port ${PORT}`);
});
