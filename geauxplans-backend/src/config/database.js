/**
 * Database Configuration
 * Using sql.js (WebAssembly-based SQLite)
 * Works on Windows without Visual Studio build tools
 */

const initSqlJs = require('sql.js');
const fs = require('fs');
const path = require('path');

// Always use absolute path relative to this file's location
const dbPath = path.join(__dirname, '../../database.sqlite');

let db = null;
let SQL = null;

/**
 * Initialize SQL.js and load/create database
 */
async function initializeSqlJs() {
  if (db) return db;

  SQL = await initSqlJs();

  // Try to load existing database file
  try {
    if (fs.existsSync(dbPath)) {
      const fileBuffer = fs.readFileSync(dbPath);
      db = new SQL.Database(fileBuffer);
      console.log('📦 Loaded existing database');
    } else {
      db = new SQL.Database();
      console.log('📦 Created new database');
    }
  } catch (error) {
    console.log('📦 Creating new database (load error):', error.message);
    db = new SQL.Database();
  }

  return db;
}

/**
 * Save database to file
 */
function saveDatabase() {
  if (!db) return;
  try {
    const data = db.export();
    const buffer = Buffer.from(data);
    fs.writeFileSync(dbPath, buffer);
  } catch (error) {
    console.error('Error saving database:', error);
  }
}

/**
 * Database wrapper to provide better-sqlite3-like API
 */
const dbWrapper = {
  prepare: (sql) => ({
    run: (...params) => {
      if (!db) throw new Error('Database not initialized');
      db.run(sql, params);
      saveDatabase();
      return {
        lastInsertRowid: db.exec('SELECT last_insert_rowid()')[0]?.values[0]?.[0] || 0,
        changes: db.getRowsModified(),
      };
    },
    get: (...params) => {
      if (!db) throw new Error('Database not initialized');
      const stmt = db.prepare(sql);
      stmt.bind(params);
      if (stmt.step()) {
        const columns = stmt.getColumnNames();
        const values = stmt.get();
        stmt.free();
        const row = {};
        columns.forEach((col, i) => {
          row[col] = values[i];
        });
        return row;
      }
      stmt.free();
      return undefined;
    },
    all: (...params) => {
      if (!db) throw new Error('Database not initialized');
      const stmt = db.prepare(sql);
      stmt.bind(params);
      const results = [];
      const columns = stmt.getColumnNames();
      while (stmt.step()) {
        const values = stmt.get();
        const row = {};
        columns.forEach((col, i) => {
          row[col] = values[i];
        });
        results.push(row);
      }
      stmt.free();
      return results;
    },
  }),
  exec: (sql) => {
    if (!db) throw new Error('Database not initialized');
    db.run(sql);
    saveDatabase();
  },
  pragma: (pragma) => {
    if (!db) return;
    db.run(`PRAGMA ${pragma}`);
  },
};

/**
 * Initialize database tables
 */
async function initializeDatabase() {
  await initializeSqlJs();
  console.log('📦 Initializing database schema...');

  // Enable foreign keys
  db.run('PRAGMA foreign_keys = ON');

  // Users table
  db.run(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password TEXT NOT NULL,
      first_name TEXT,
      last_name TEXT,
      display_name TEXT,
      role TEXT DEFAULT 'customer',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Products table
  db.run(`
    CREATE TABLE IF NOT EXISTS products (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      slug TEXT UNIQUE NOT NULL,
      price REAL NOT NULL,
      regular_price REAL,
      sale_price REAL,
      description TEXT,
      short_description TEXT,
      type TEXT DEFAULT 'simple',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Orders table
  db.run(`
    CREATE TABLE IF NOT EXISTS orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      order_number TEXT UNIQUE NOT NULL,
      status TEXT DEFAULT 'pending',
      subtotal REAL NOT NULL,
      tax REAL DEFAULT 0,
      total REAL NOT NULL,
      billing_address TEXT,
      shipping_address TEXT,
      payment_method TEXT,
      stripe_session_id TEXT,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Add stripe_session_id column if it doesn't exist (migration)
  try {
    db.run(`ALTER TABLE orders ADD COLUMN stripe_session_id TEXT`);
  } catch (e) {
    // Column already exists
  }

  // Order items table
  db.run(`
    CREATE TABLE IF NOT EXISTS order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      order_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variation_id INTEGER,
      name TEXT NOT NULL,
      quantity INTEGER DEFAULT 1,
      price REAL NOT NULL,
      total REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Estate plans table
  db.run(`
    CREATE TABLE IF NOT EXISTS estate_plans (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_id INTEGER,
      name TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      purchase_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      completed_date DATETIME,
      knackly_token TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Plan documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS plan_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      plan_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      file_path TEXT,
      download_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (plan_id) REFERENCES estate_plans(id) ON DELETE CASCADE
    )
  `);

  // Business entities table
  db.run(`
    CREATE TABLE IF NOT EXISTS business_entities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      order_id INTEGER,
      name TEXT NOT NULL,
      type TEXT DEFAULT 'llc',
      status TEXT DEFAULT 'pending',
      state TEXT DEFAULT 'LA',
      registered_agent TEXT,
      formation_date DATETIME,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (order_id) REFERENCES orders(id)
    )
  `);

  // Business documents table
  db.run(`
    CREATE TABLE IF NOT EXISTS business_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      entity_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      type TEXT,
      file_path TEXT,
      download_url TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (entity_id) REFERENCES business_entities(id) ON DELETE CASCADE
    )
  `);

  // Cart table (for persistent carts)
  db.run(`
    CREATE TABLE IF NOT EXISTS carts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER,
      session_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Cart items table
  db.run(`
    CREATE TABLE IF NOT EXISTS cart_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      cart_id INTEGER NOT NULL,
      product_id INTEGER NOT NULL,
      variation_id INTEGER,
      quantity INTEGER DEFAULT 1,
      FOREIGN KEY (cart_id) REFERENCES carts(id) ON DELETE CASCADE,
      FOREIGN KEY (product_id) REFERENCES products(id)
    )
  `);

  // Legal Edge Plan subscriptions
  db.run(`
    CREATE TABLE IF NOT EXISTS subscriptions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      plan_type TEXT DEFAULT 'legal-edge',
      status TEXT DEFAULT 'active',
      price REAL DEFAULT 29.00,
      start_date DATETIME DEFAULT CURRENT_TIMESTAMP,
      next_billing_date DATETIME,
      cancelled_at DATETIME,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // User addresses
  db.run(`
    CREATE TABLE IF NOT EXISTS addresses (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      type TEXT DEFAULT 'billing',
      first_name TEXT,
      last_name TEXT,
      company TEXT,
      address1 TEXT,
      address2 TEXT,
      city TEXT,
      state TEXT DEFAULT 'LA',
      postcode TEXT,
      country TEXT DEFAULT 'US',
      phone TEXT,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  // Downloads/files available to users
  db.run(`
    CREATE TABLE IF NOT EXISTS downloads (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      name TEXT NOT NULL,
      file_url TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  saveDatabase();
  console.log('✅ Database schema initialized successfully');
}

module.exports = {
  db: dbWrapper,
  initializeDatabase,
  saveDatabase,
};
