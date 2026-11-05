const sqlite3 = require('sqlite3').verbose();

const DB_PATH = process.env.DB_PATH || './dxn_stockpoint.db';
const db = new sqlite3.Database(DB_PATH);

const products = [
  { sku: 'DXN-LZC-3IN1-20', name: 'Lingzhi Coffee 3-in-1', category: 'Coffee', retail_price: 45.00, member_price: 35.00, pv_points: 24.0, stock_qty: 120 },
  { sku: 'DXN-LZC-2IN1-20', name: 'Lingzhi Coffee 2-in-1', category: 'Coffee', retail_price: 42.00, member_price: 33.00, pv_points: 22.0, stock_qty: 80 },
  { sku: 'DXN-ZHI-MOCHA-20', name: 'Zhi Mocha', category: 'Coffee', retail_price: 50.00, member_price: 40.00, pv_points: 26.0, stock_qty: 60 },
  { sku: 'DXN-LZC-LITE-20', name: 'Lingzhi Coffee Lite', category: 'Coffee', retail_price: 40.00, member_price: 31.00, pv_points: 20.0, stock_qty: 55 },
  { sku: 'DXN-RGGL-90', name: 'RG/GL Capsules (90s)', category: 'Supplements', retail_price: 220.00, member_price: 170.00, pv_points: 115.0, stock_qty: 40 },
  { sku: 'DXN-MORINZHI-500', name: 'Morinzhi (500ml)', category: 'Supplements', retail_price: 90.00, member_price: 70.00, pv_points: 46.0, stock_qty: 30 },
  { sku: 'DXN-SPIRULINA-120', name: 'Spirulina Tablets (120s)', category: 'Supplements', retail_price: 75.00, member_price: 58.00, pv_points: 38.0, stock_qty: 50 },
  { sku: 'DXN-ANDRO-90', name: 'Andrographis Paniculata (90s)', category: 'Supplements', retail_price: 65.00, member_price: 50.00, pv_points: 33.0, stock_qty: 35 },
  { sku: 'DXN-LZC-TEA-25', name: 'Lingzhi Black Tea', category: 'Coffee', retail_price: 38.00, member_price: 29.00, pv_points: 19.0, stock_qty: 3 },
  { sku: 'DXN-TOOTHPASTE-120', name: 'Ganozhi Toothpaste (120g)', category: 'Personal Care', retail_price: 28.00, member_price: 22.00, pv_points: 14.0, stock_qty: 75 },
  { sku: 'DXN-SOAP-GANO', name: 'Ganozhi Soap', category: 'Personal Care', retail_price: 18.00, member_price: 14.00, pv_points: 9.0, stock_qty: 2 },
  { sku: 'DXN-SHAMPOO-GANO', name: 'Ganozhi Shampoo (200ml)', category: 'Personal Care', retail_price: 35.00, member_price: 27.00, pv_points: 17.0, stock_qty: 25 },
];

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
  `, (err) => {
    if (err) { console.error('Table error:', err.message); return; }

    const stmt = db.prepare(
      'INSERT OR IGNORE INTO products (sku, name, category, retail_price, member_price, pv_points, stock_qty) VALUES (?, ?, ?, ?, ?, ?, ?)'
    );

    products.forEach(p => {
      stmt.run(p.sku, p.name, p.category, p.retail_price, p.member_price, p.pv_points, p.stock_qty, (err) => {
        if (err) console.error(`  ✗ ${p.name}: ${err.message}`);
        else console.log(`  ✓ Seeded: ${p.name}`);
      });
    });

    stmt.finalize(() => {
      console.log('\n✅ Seed complete! Database ready.');
      db.close();
    });
  });
});

