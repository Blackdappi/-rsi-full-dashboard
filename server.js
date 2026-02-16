const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

const dbPath = path.join(__dirname, 'trades.db');
const db = new sqlite3.Database(dbPath);

db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS trades (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
    symbol TEXT DEFAULT 'BTCUSDT',
    rsi REAL,
    signal TEXT,
    entry_price REAL,
    exit_price REAL,
    pnl REAL,
    is_win INTEGER DEFAULT 0
  )`);
});

db.get("SELECT COUNT(*) as cnt FROM trades", (err, row) => {
  if (row && row.cnt === 0) {
    generateSimTrades();
  }
});

function generateSimTrades() {
  const count = 1000;
  for(let i = 0; i < count; i++) {
    const rsi = Math.random() < 0.5 ? (25 + Math.random() * 10) : (70 + Math.random() * 10);
    const signal = rsi < 35 ? 'BUY' : 'SELL';
    const entry_price = 45000 + Math.random() * 10000;
    const change_pct = (Math.random() - 0.4) * 0.06;
    const exit_price = entry_price * (1 + change_pct);
    const pnl = signal === 'BUY' ? (exit_price - entry_price) : (entry_price - exit_price);
    const is_win = pnl > 0 ? 1 : 0;
    db.run(`INSERT INTO trades (rsi, signal, entry_price, exit_price, pnl, is_win) VALUES (?, ?, ?, ?, ?, ?)`,
      [rsi.toFixed(2), signal, entry_price, exit_price, parseFloat(pnl.toFixed(4)), is_win],
      (err) => { if (err) console.log(err); }
    );
  }
  console.log(`Generated ${count} simulated trades.`);
}

// API endpoints
app.get('/api/stats', (req, res) => {
  db.get(`
    SELECT 
      COUNT(*) as total_trades,
      COALESCE(SUM(pnl), 0) as total_pnl,
      COALESCE(AVG(is_win)*100, 0) as winrate,
      COALESCE(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 0) as total_losses,
      COUNT(CASE WHEN pnl < 0 THEN 1 END) as num_losses
    FROM trades
  `, (err, stats) => {
    if (err) {
      res.status(500).json({error: err.message});
    } else {
      res.json(stats);
    }
  });
});

app.get('/api/trades', (req, res) => {
  db.all('SELECT * FROM trades ORDER BY id DESC LIMIT 10', (err, rows) => {
    res.json(rows || []);
  });
});

app.get('/api/monitor', (req, res) => {
  db.get('SELECT * FROM trades ORDER BY id DESC LIMIT 1', (err, row) => {
    res.json({
      current_rsi: row ? parseFloat(row.rsi).toFixed(2) : 50,
      current_price: row ? parseFloat(((parseFloat(row.entry_price) + parseFloat(row.exit_price))/2).toFixed(2)) : 50000,
      signal: row ? row.signal : 'HOLD',
      status: 'Running'
    });
  });
});

app.get('/api/sparkline', (req, res) => {
  db.all(`
    SELECT 
      id,
      COALESCE(SUM(pnl) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0) as equity
    FROM trades 
    ORDER BY id ASC
  `, (err, rows) => {
    if (err) {
      res.status(500).json({error: err.message});
    } else {
      const recent = rows.slice(-20);
      res.json({
        labels: recent.map(r => `#${r.id}`),
        data: recent.map(r => parseFloat(r.equity.toFixed(2)))
      });
    }
  });
});

app.get('/api/health', (req, res) => {
  res.json({status: 'healthy', uptime: process.uptime(), last_update: new Date().toISOString()});
});

app.get('/api/trend', (req, res) => {
  db.all('SELECT pnl FROM trades ORDER BY id DESC LIMIT 5', (err, rows) => {
    if (rows.length === 0) {
      res.json({trend: 'Neutral', change: '0%'});
    } else {
      const avg = rows.reduce((sum, r) => sum + parseFloat(r.pnl), 0) / rows.length;
      const trend = avg > 0 ? 'Bullish' : 'Bearish';
      const change = (avg * 5).toFixed(2) + '%';
      res.json({trend, change});
    }
  });
});

app.listen(PORT, () => {
  console.log(`RSI Dashboard running on port ${PORT}`);
});