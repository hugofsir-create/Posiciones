import express from "express";
import { createServer as createViteServer } from "vite";
import Database from "better-sqlite3";
import path from "path";

import fs from "fs";

import { fileURLToPath } from "url";
import { dirname } from "path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const dbPath = path.resolve(__dirname, "stock.db");
if (!fs.existsSync(dbPath)) {
  fs.writeFileSync(dbPath, "");
}

const db = new Database(dbPath);
db.pragma('journal_mode = WAL');
db.pragma('synchronous = NORMAL');

console.log(`Base de datos conectada en: ${dbPath}`);

// Initialize database
db.exec(`
  CREATE TABLE IF NOT EXISTS stock_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    kilos REAL NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS fortnightly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT NOT NULL,
    period TEXT NOT NULL,
    total_kilos REAL NOT NULL,
    avg_kilos REAL NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(month, period)
  );

  CREATE TABLE IF NOT EXISTS pallet_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    positions INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS weekly_pallet_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    week_start TEXT NOT NULL,
    week_end TEXT NOT NULL,
    total_positions INTEGER NOT NULL,
    avg_positions REAL NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(week_start, week_end)
  );

  CREATE TABLE IF NOT EXISTS cepas_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT UNIQUE,
    positions INTEGER NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );

  CREATE TABLE IF NOT EXISTS cepas_monthly_reports (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    month TEXT UNIQUE,
    total_positions INTEGER NOT NULL,
    avg_positions REAL NOT NULL,
    data_json TEXT NOT NULL,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP
  );
`);

  // Schema migration for cepas_records (month -> date)
  try {
    const tableInfo = db.prepare("PRAGMA table_info(cepas_records)").all() as any[];
    const hasMonth = tableInfo.some(col => col.name === 'month');
    const hasDate = tableInfo.some(col => col.name === 'date');
    
    if (hasMonth && !hasDate) {
      console.log("Migrating cepas_records: month -> date");
      db.exec("ALTER TABLE cepas_records RENAME COLUMN month TO date");
    }
  } catch (e) {
    console.error("Migration error:", e);
  }

const recordCount = db.prepare("SELECT COUNT(*) as count FROM stock_records").get() as { count: number };
console.log(`Registros encontrados en el inicio: ${recordCount.count}`);

// Graceful shutdown
process.on('SIGINT', () => {
  db.close();
  process.exit(0);
});

process.on('SIGTERM', () => {
  db.close();
  process.exit(0);
});

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // API Routes - Stock Records
  app.get("/api/records", (req, res) => {
    try {
      const records = db.prepare("SELECT * FROM stock_records ORDER BY date DESC").all();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch records" });
    }
  });

  app.post("/api/records", (req, res) => {
    const { date, kilos } = req.body;
    if (!date || kilos === undefined || kilos === null || isNaN(Number(kilos))) {
      return res.status(400).json({ error: "Fecha y kilos válidos son requeridos" });
    }

    try {
      const upsert = db.prepare(`
        INSERT INTO stock_records (date, kilos)
        VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET kilos = excluded.kilos
      `);
      upsert.run(date, Number(kilos));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Database error:", error);
      res.status(500).json({ error: `Error de base de datos: ${error.message || 'Desconocido'}` });
    }
  });

  app.delete("/api/records/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM stock_records WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete record" });
    }
  });

  // Pallet Records (Bodegas Bianchi)
  app.get("/api/pallets", (req, res) => {
    try {
      const records = db.prepare("SELECT * FROM pallet_records ORDER BY date DESC").all();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pallet records" });
    }
  });

  app.post("/api/pallets", (req, res) => {
    const { date, positions } = req.body;
    if (!date || positions === undefined || positions === null || isNaN(Number(positions))) {
      return res.status(400).json({ error: "Fecha y posiciones válidas son requeridas" });
    }

    try {
      const upsert = db.prepare(`
        INSERT INTO pallet_records (date, positions)
        VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET positions = excluded.positions
      `);
      upsert.run(date, Number(positions));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Database error:", error);
      res.status(500).json({ error: `Error de base de datos: ${error.message || 'Desconocido'}` });
    }
  });

  app.delete("/api/pallets/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM pallet_records WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete pallet record" });
    }
  });

  // Fortnightly Reports Routes
  app.get("/api/reports", (req, res) => {
    try {
      const reports = db.prepare("SELECT * FROM fortnightly_reports ORDER BY month DESC, period DESC").all();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch reports" });
    }
  });

  app.post("/api/reports", (req, res) => {
    const { month, period, total_kilos, avg_kilos, data_json } = req.body;
    try {
      const upsert = db.prepare(`
        INSERT INTO fortnightly_reports (month, period, total_kilos, avg_kilos, data_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(month, period) DO UPDATE SET 
          total_kilos = excluded.total_kilos,
          avg_kilos = excluded.avg_kilos,
          data_json = excluded.data_json
      `);
      upsert.run(month, period, total_kilos, avg_kilos, JSON.stringify(data_json));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save report" });
    }
  });

  app.delete("/api/reports/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM fortnightly_reports WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete report" });
    }
  });

  // Weekly Pallet Reports
  app.get("/api/pallet-reports", (req, res) => {
    try {
      const reports = db.prepare("SELECT * FROM weekly_pallet_reports ORDER BY week_end DESC").all();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch pallet reports" });
    }
  });

  app.post("/api/pallet-reports", (req, res) => {
    const { week_start, week_end, total_positions, avg_positions, data_json } = req.body;
    try {
      const upsert = db.prepare(`
        INSERT INTO weekly_pallet_reports (week_start, week_end, total_positions, avg_positions, data_json)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(week_start, week_end) DO UPDATE SET 
          total_positions = excluded.total_positions,
          avg_positions = excluded.avg_positions,
          data_json = excluded.data_json
      `);
      upsert.run(week_start, week_end, total_positions, avg_positions, JSON.stringify(data_json));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save pallet report" });
    }
  });

  app.delete("/api/pallet-reports/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM weekly_pallet_reports WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete pallet report" });
    }
  });

  // Cepas Records (Daily)
  app.get("/api/cepas", (req, res) => {
    try {
      const records = db.prepare("SELECT * FROM cepas_records ORDER BY date DESC").all();
      res.json(records);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cepas records" });
    }
  });

  app.post("/api/cepas", (req, res) => {
    const { date, positions } = req.body;
    if (!date || positions === undefined || positions === null || isNaN(Number(positions))) {
      return res.status(400).json({ error: "Fecha y posiciones válidas son requeridas" });
    }

    try {
      const upsert = db.prepare(`
        INSERT INTO cepas_records (date, positions)
        VALUES (?, ?)
        ON CONFLICT(date) DO UPDATE SET positions = excluded.positions
      `);
      upsert.run(date, Number(positions));
      res.json({ success: true });
    } catch (error: any) {
      console.error("Database error:", error);
      res.status(500).json({ error: `Error de base de datos: ${error.message || 'Desconocido'}` });
    }
  });

  app.delete("/api/cepas/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM cepas_records WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete cepas record" });
    }
  });

  // Cepas Monthly Reports
  app.get("/api/cepas-reports", (req, res) => {
    try {
      const reports = db.prepare("SELECT * FROM cepas_monthly_reports ORDER BY month DESC").all();
      res.json(reports);
    } catch (error) {
      res.status(500).json({ error: "Failed to fetch cepas reports" });
    }
  });

  app.post("/api/cepas-reports", (req, res) => {
    const { month, total_positions, avg_positions, data_json } = req.body;
    try {
      const upsert = db.prepare(`
        INSERT INTO cepas_monthly_reports (month, total_positions, avg_positions, data_json)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(month) DO UPDATE SET 
          total_positions = excluded.total_positions,
          avg_positions = excluded.avg_positions,
          data_json = excluded.data_json
      `);
      upsert.run(month, total_positions, avg_positions, JSON.stringify(data_json));
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to save cepas report" });
    }
  });

  app.delete("/api/cepas-reports/:id", (req, res) => {
    try {
      db.prepare("DELETE FROM cepas_monthly_reports WHERE id = ?").run(req.params.id);
      res.json({ success: true });
    } catch (error) {
      res.status(500).json({ error: "Failed to delete cepas report" });
    }
  });

  // Vite middleware for development
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.join(process.cwd(), "dist")));
    app.get("*", (req, res) => {
      res.sendFile(path.join(process.cwd(), "dist", "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${PORT}`);
  });
}

startServer();
