const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const path = require('path');

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. Serve the dashboard page at the root URL (/)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});

// 2. Health check route
app.get("/api/health", (req, res) => {
  res.json({ status: "ok", message: "Inventory API is running" });
});

// 3. Inventory balance API route
app.get("/api/inventory/balance", async (req, res) => {
  try {
    const query = `
      SELECT 
        i.item_id,
        i.description,
        i.unit,
        i.par_level,
        COALESCE(SUM(CASE WHEN t.type = 'IN' THEN t.quantity ELSE 0 END), 0) -
        COALESCE(SUM(CASE WHEN t.type = 'OUT' THEN t.quantity ELSE 0 END), 0) AS current_stock,
        CASE 
          WHEN (COALESCE(SUM(CASE WHEN t.type = 'IN' THEN t.quantity ELSE 0 END), 0) -
                COALESCE(SUM(CASE WHEN t.type = 'OUT' THEN t.quantity ELSE 0 END), 0)) <= i.par_level 
          THEN 'REORDER'
          ELSE 'OK'
        END AS reorder_status
      FROM items i
      LEFT JOIN transactions t ON i.item_id = t.item_id
      GROUP BY i.item_id, i.description, i.unit, i.par_level;
    `;
    const result = await pool.query(query);
    res.json(result.rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: "Database query failed" });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});