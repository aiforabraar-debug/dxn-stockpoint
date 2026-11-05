const express = require('express');
const sqlite3 = require('sqlite3').verbose();
const cors = require('cors');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());
app.use(cors());

// Request logger
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

const DB_PATH = process.env.DB_PATH || './dxn_stockpoint.db';
const db = new sqlite3.Database(DB_PATH, (err) => {
  if (err) console.error('DB connection error:', err.message);
  else console.log('Connected to SQLite database at', DB_PATH);
});

// ── Initialize Tables ────────────────────────────────────────────────────────
db.serialize(() => {
  db.run('PRAGMA foreign_keys = ON');

  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id           INTEGER PRIMARY KEY AUTOINCREMENT,
      sku          TEXT UNIQUE NOT NULL,
      name         TEXT NOT NULL,
      category     TEXT NOT NULL,
      retail_price REAL NOT NULL DEFAULT 0,
      member_price REAL NOT NULL DEFAULT 0,
      pv_points    REAL NOT NULL DEFAULT 0,
      stock_qty    INTEGER NOT NULL DEFAULT 0,
      created_at   DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id             INTEGER PRIMARY KEY AUTOINCREMENT,
      order_number   TEXT UNIQUE NOT NULL,
      customer_name  TEXT NOT NULL,
      total_amount   REAL NOT NULL DEFAULT 0,
      total_pv       REAL NOT NULL DEFAULT 0,
      status         TEXT NOT NULL DEFAULT 'CONFIRMED',
      is_member      INTEGER NOT NULL DEFAULT 0,
      created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id         INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id   INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      quantity   INTEGER NOT NULL,
      unit_price REAL NOT NULL,
      unit_pv    REAL NOT NULL,
      FOREIGN KEY (order_id)   REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);
});

// ── Helper ───────────────────────────────────────────────────────────────────
const run = (sql, params = []) =>
  new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });

const get = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row)))
  );

const all = (sql, params = []) =>
  new Promise((resolve, reject) =>
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows)))
  );

// ── Health Check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// ── Products ─────────────────────────────────────────────────────────────────

// GET /api/v1/products
app.get('/api/v1/products', async (req, res) => {
  try {
    const products = await all('SELECT * FROM products ORDER BY category, name');
    res.json({ success: true, products });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/products — add new product
app.post('/api/v1/products', async (req, res) => {
  const { sku, name, category, retail_price, member_price, pv_points, stock_qty } = req.body;
  if (!sku || !name || !category) {
    return res.status(400).json({ success: false, message: 'sku, name, and category are required' });
  }
  try {
    await run(
      'INSERT INTO products (sku, name, category, retail_price, member_price, pv_points, stock_qty) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [sku, name, category, retail_price || 0, member_price || 0, pv_points || 0, stock_qty || 0]
    );
    res.status(201).json({ success: true, message: 'Product added successfully' });
  } catch (err) {
    if (err.message.includes('UNIQUE')) {
      return res.status(409).json({ success: false, message: 'SKU already exists' });
    }
    res.status(500).json({ success: false, error: err.message });
  }
});

// PUT /api/v1/products/:id — edit product
app.put('/api/v1/products/:id', async (req, res) => {
  const { id } = req.params;
  const { name, category, retail_price, member_price, pv_points, stock_qty } = req.body;
  try {
    const result = await run(
      'UPDATE products SET name=?, category=?, retail_price=?, member_price=?, pv_points=?, stock_qty=? WHERE id=?',
      [name, category, retail_price, member_price, pv_points, stock_qty, id]
    );
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Product updated' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/stock/update
app.post('/api/v1/stock/update', async (req, res) => {
  const { productId, newQuantity } = req.body;
  try {
    const result = await run('UPDATE products SET stock_qty = ? WHERE id = ?', [newQuantity, productId]);
    if (result.changes === 0) return res.status(404).json({ success: false, message: 'Product not found' });
    res.json({ success: true, message: 'Stock updated successfully' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Orders ────────────────────────────────────────────────────────────────────

// GET /api/v1/orders
app.get('/api/v1/orders', async (req, res) => {
  try {
    const orders = await all('SELECT * FROM orders ORDER BY created_at DESC LIMIT 100');
    res.json({ success: true, orders });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// GET /api/v1/orders/:id
app.get('/api/v1/orders/:id', async (req, res) => {
  try {
    const order = await get('SELECT * FROM orders WHERE id = ?', [req.params.id]);
    if (!order) return res.status(404).json({ success: false, message: 'Order not found' });
    const items = await all(
      `SELECT oi.*, p.name AS product_name, p.sku
       FROM order_items oi
       JOIN products p ON p.id = oi.product_id
       WHERE oi.order_id = ?`,
      [req.params.id]
    );
    res.json({ success: true, order: { ...order, items } });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// POST /api/v1/orders
app.post('/api/v1/orders', async (req, res) => {
  const { customerName, items, isMember } = req.body;
  if (!customerName || !items || !items.length) {
    return res.status(400).json({ success: false, message: 'customerName and items are required' });
  }

  try {
    let totalAmount = 0;
    let totalPV = 0;
    const resolvedItems = [];

    for (const item of items) {
      const product = await get('SELECT * FROM products WHERE id = ?', [item.productId]);
      if (!product) {
        return res.status(404).json({ success: false, message: `Product ${item.productId} not found` });
      }
      if (product.stock_qty < item.quantity) {
        return res.status(409).json({
          success: false,
          message: `Insufficient stock for "${product.name}" (available: ${product.stock_qty})`
        });
      }
      const price = isMember ? product.member_price : product.retail_price;
      totalAmount += price * item.quantity;
      totalPV += product.pv_points * item.quantity;
      resolvedItems.push({ ...item, price, pv: product.pv_points });
    }

    const orderNum = `DXN-${Date.now()}`;
    const orderResult = await run(
      'INSERT INTO orders (order_number, customer_name, total_amount, total_pv, status, is_member) VALUES (?, ?, ?, ?, ?, ?)',
      [orderNum, customerName, totalAmount, totalPV, 'CONFIRMED', isMember ? 1 : 0]
    );
    const orderId = orderResult.lastID;

    for (const item of resolvedItems) {
      await run(
        'INSERT INTO order_items (order_id, product_id, quantity, unit_price, unit_pv) VALUES (?, ?, ?, ?, ?)',
        [orderId, item.productId, item.quantity, item.price, item.pv]
      );
      await run('UPDATE products SET stock_qty = stock_qty - ? WHERE id = ?', [item.quantity, item.productId]);
    }

    res.status(201).json({ success: true, orderNumber: orderNum, totalAmount, totalPV });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Dashboard ─────────────────────────────────────────────────────────────────
app.get('/api/v1/dashboard', async (req, res) => {
  try {
    const totals = await get(
      "SELECT COUNT(*) as totalOrders, SUM(total_amount) as totalRevenue, SUM(total_pv) as totalPV FROM orders WHERE status != 'CANCELLED'"
    );
    const lowStock = await all('SELECT * FROM products WHERE stock_qty < 5 ORDER BY stock_qty ASC');
    res.json({
      success: true,
      data: {
        totalOrders: totals.totalOrders || 0,
        totalRevenue: totals.totalRevenue || 0,
        totalPV: totals.totalPV || 0,
        lowStockProducts: lowStock
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// ── Start Server ──────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 DXN Stockpoint API running at http://localhost:${PORT}`);
  console.log(`📊 Dashboard : http://localhost:${PORT}/api/v1/dashboard`);
  console.log(`❤️  Health   : http://localhost:${PORT}/health\n`);
});

