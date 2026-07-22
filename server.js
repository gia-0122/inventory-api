const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');

const app = express();

app.use(cors());
app.use(express.json());

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false }
});

// 1. Serve inline dashboard on root route (/)
app.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1.0" />
      <title>Floor Stock Inventory</title>
      <style>
        body { font-family: system-ui, sans-serif; background: #f4f6f9; padding: 40px; display: flex; justify-content: center; }
        .container { width: 100%; max-width: 800px; background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 12px rgba(0,0,0,0.08); }
        h1 { margin-top: 0; color: #1a202c; font-size: 22px; }
        table { width: 100%; border-collapse: collapse; margin-top: 20px; }
        th, td { padding: 12px 16px; text-align: left; border-bottom: 1px solid #e2e8f0; }
        th { background-color: #f7fafc; color: #4a5568; }
        .status-ok { background-color: #c6f6d5; color: #22543d; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
        .status-reorder { background-color: #fed7d7; color: #742a2a; padding: 4px 8px; border-radius: 4px; font-weight: bold; font-size: 12px; }
      </style>
    </head>
    <body>
      <div class="container">
        <h1>📦 Floor Stock Inventory Dashboard</h1>
        <table>
          <thead>
            <tr><th>Item ID</th><th>Description</th><th>Unit</th><th>Stock</th><th>Status</th></tr>
          </thead>
          <tbody id="inventory-table">
            <tr><td colspan="5">Loading live inventory data...</td></tr>
          </tbody>
        </table>
      </div>
      <script>
        async function fetchInventory() {
          try {
            const response = await fetch('/api/inventory/balance');
            const data = await response.json();
            const tableBody = document.getElementById('inventory-table');
            tableBody.innerHTML = '';
            data.forEach(item => {
              const isReorder = item.reorder_status === 'REORDER';
              const row = document.createElement('tr');
              row.innerHTML = \`
                <td><strong>\${item.item_id}</strong></td>
                <td>\${item.description}</td>
                <td>\${item.unit}</td>
                <td>\${item.current_stock}</td>
                <td><span class="\${isReorder ? 'status-reorder' : 'status-ok'}">\${item.reorder_status}</span></td>
              \`;
              tableBody.appendChild(row);
            });
          } catch (err) {
            document.getElementById('inventory-table').innerHTML = '<tr><td colspan="5" style="color:red;">Failed to load data.</td></tr>';
          }
        }
        fetchInventory();
      </script>
    </body>
    </html>
  `);
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
    res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});