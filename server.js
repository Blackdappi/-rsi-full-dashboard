const express = require('express');
const Database = require('better-sqlite3');
const path = require('path');
const cors = require('cors');

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.static('public'));

const dbPath = path.join(__dirname, 'trades.db');
const db = new Database(dbPath);

db.exec(`CREATE TABLE IF NOT EXISTS trades (
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

const countStmt = db.prepare("SELECT COUNT(*) as cnt FROM trades");
const row = countStmt.get();
if (row && row.cnt === 0) {
  generateSimTrades();
}

function generateSimTrades() {
  const count = 1000;
  const insertStmt = db.prepare(`INSERT INTO trades (rsi, signal, entry_price, exit_price, pnl, is_win) VALUES (?, ?, ?, ?, ?, ?)`);
  const tx = db.transaction(() => {
    for(let i = 0; i < count; i++) {
      const rsi = Math.random() < 0.5 ? (25 + Math.random() * 10) : (70 + Math.random() * 10);
      const signal = rsi < 35 ? 'BUY' : 'SELL';
      const entry_price = 45000 + Math.random() * 10000;
      const change_pct = (Math.random() - 0.4) * 0.06;
      const exit_price = entry_price * (1 + change_pct);
      const pnl = signal === 'BUY' ? (exit_price - entry_price) : (entry_price - exit_price);
      const is_win = pnl > 0 ? 1 : 0;
      insertStmt.run(rsi.toFixed(2)*1, signal, entry_price, exit_price, parseFloat(pnl.toFixed(4)), is_win);
    }
  });
  tx();
  console.log(`Generated ${count} simulated trades.`);
}

// API endpoints
app.get('/api/stats', (req, res) => {
  try {
    const statsStmt = db.prepare(`
      SELECT 
        COUNT(*) as total_trades,
        COALESCE(SUM(pnl), 0) as total_pnl,
        COALESCE(AVG(is_win)*100, 0) as winrate,
        COALESCE(SUM(CASE WHEN pnl < 0 THEN pnl ELSE 0 END), 0) as total_losses,
        COUNT(CASE WHEN pnl < 0 THEN 1 END) as num_losses
      FROM trades
    `);
    const stats = statsStmt.get();
    res.json(stats);
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/trades', (req, res) => {
  try {
    const tradesStmt = db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT 10');
    const rows = tradesStmt.all();
    res.json(rows);
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/monitor', (req, res) => {
  try {
    const monitorStmt = db.prepare('SELECT * FROM trades ORDER BY id DESC LIMIT 1');
    const row = monitorStmt.get();
    res.json({
      current_rsi: row ? parseFloat(row.rsi).toFixed(2) : '50',
      current_price: row ? parseFloat(((parseFloat(row.entry_price) + parseFloat(row.exit_price))/2).toFixed(2)) : 50000,
      signal: row ? row.signal : 'HOLD',
      status: 'Running'
    });
  } catch(err) {
    res.status(500).json({error: err.message});
  }
});

app.get('/api/sparkline', (req, res) => {
  try {
    const sparkStmt = db.prepare(`
      SELECT 
        id,
        COALESCE(SUM(pnl) OVER (ORDER BY id ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW), 0) as equity
      FROM trades 
      ORDER BY id ASC
    `);
    const rows = sparkStmt.all();
    const recent = rows.slice(-20);
    res.json({
      labels: recent.map(r => `#${r.id}`),
      data: recent.map(r => parseFloat(r.equity.toFixed(2)))
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
    const trendStmt = db.prepare('SELECT pnl FROM trades ORDER BY id DESC LIMIT 5');
    const rows = trendStmt.all();
    if (rows.length === 0) {
      res.json({trend: 'Neutral', change: '0%'});
      return;
    }
    const avg = rows.reduce((sum, r) => sum + parseFloat(r.pnl), 0) / rows.length;
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