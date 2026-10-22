const mysql = require("mysql2/promise");

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || "localhost",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "orders",
  password: process.env.MYSQL_PASSWORD || "orderpassword",
  database: process.env.MYSQL_DATABASE || "orders",
  waitForConnections: true,
  connectionLimit: 10,
  decimalNumbers: true,
});

async function initializeDatabase() {
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS orders (
      id CHAR(36) PRIMARY KEY,
      customer_name VARCHAR(120) NOT NULL,
      items JSON NOT NULL,
      total DECIMAL(10, 2) NOT NULL,
      status ENUM('PENDING', 'CONFIRMED', 'PROCESSING', 'SHIPPED', 'DELIVERED') NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX orders_created_at_idx (created_at)
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS order_events (
      event_id CHAR(36) PRIMARY KEY,
      order_id CHAR(36) NOT NULL,
      event_type VARCHAR(40) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX order_events_order_id_idx (order_id, created_at)
    )
  `);
  await pool.execute(`
    CREATE TABLE IF NOT EXISTS order_outbox (
      event_id CHAR(36) PRIMARY KEY,
      order_id CHAR(36) NOT NULL,
      payload JSON NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      published_at TIMESTAMP NULL,
      INDEX order_outbox_pending_idx (published_at, created_at)
    )
  `);
}

module.exports = { pool, initializeDatabase };
