const express = require('express');
const cors = require('cors');
const { rateLimit } = require('express-rate-limit');
const mysql = require('mysql2/promise');
const { Kafka, Partitioners } = require('kafkajs');

const app = express();
app.set('trust proxy', 1);
app.use(cors());
app.use(express.json());
app.use('/api', rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
}));

const PORT = process.env.PORT || 5000;

const pool = mysql.createPool({
  host: process.env.MYSQL_HOST || 'mysql-service',
  user: process.env.MYSQL_USER || 'root',
  password: process.env.MYSQL_PASSWORD || 'rootpassword',
  database: process.env.MYSQL_DATABASE || 'appdb',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

const kafka = new Kafka({
  clientId: 'order-api-gateway',
  brokers: [process.env.KAFKA_BROKER || 'kafka-service:9092'],
});

const producer = kafka.producer({
  createPartitioner: Partitioners.DefaultPartitioner,
});

let kafkaConnected = false;

async function initKafka() {
  try {
    await producer.connect();
    kafkaConnected = true;
    console.log('Kafka Producer connected.');
  } catch (err) {
    console.warn('Kafka connection failed:', err.message);
  }
}
initKafka();

app.get(['/healthz', '/api/healthz'], (req, res) => {
  res.status(200).json({ status: 'UP', kafka: kafkaConnected });
});

app.get('/api/orders', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM orders ORDER BY id DESC');
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders', async (req, res) => {
  const { customer_name, item_name, quantity, total_amount, simulate_failure } = req.body;
  const orderNumber = `ORD-${Date.now().toString(36).toUpperCase()}`;

  try {
    const [result] = await pool.query(
        'INSERT INTO orders (order_number, customer_name, item_name, quantity, total_amount, status) VALUES (?, ?, ?, ?, ?, ?)',
        [orderNumber, customer_name, item_name, quantity, total_amount, 'PENDING']
    );

    const orderId = result.insertId;

    await pool.query(
        'INSERT INTO order_events (order_id, from_status, to_status, event_note) VALUES (?, NULL, ?, ?)',
        [orderId, 'PENDING', 'Order submitted']
    );

    if (producer) {
      await producer.send({
        topic: 'order-pipeline',
        messages: [{
          key: String(orderId),
          value: JSON.stringify({
            order_id: orderId,
            order_number: orderNumber,
            customer_name,
            item_name,
            quantity,
            total_amount,
            simulate_failure: Boolean(simulate_failure),
          }),
        }],
      }).catch((err) => console.warn('Kafka send failed:', err.message));
    }

    res.status(201).json({ id: orderId, order_number: orderNumber, status: 'PENDING' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.post('/api/orders/:id/cancel', async (req, res) => {
  const { id } = req.params;
  try {
    const [rows] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
    if (rows.length === 0) return res.status(404).json({ error: 'Order not found' });

    const currentStatus = rows[0].status;
    if (['FULFILLED', 'FAILED', 'CANCELLED'].includes(currentStatus)) {
      return res.status(400).json({ error: `Cannot cancel order in ${currentStatus} status` });
    }

    const [cancelResult] = await pool.query('UPDATE orders SET status = "CANCELLED", failure_reason = "Cancelled by user" WHERE id = ? AND status = ?', [id, currentStatus]);
    if (cancelResult.affectedRows === 0) return res.status(409).json({ error: 'Order status changed; refresh before cancelling' });
    await pool.query('INSERT INTO order_events (order_id, from_status, to_status, event_note) VALUES (?, ?, "CANCELLED", "Order cancelled by user")', [id, currentStatus]);

    res.json({ message: 'Order cancelled', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.put('/api/orders/:id', async (req, res) => {
  const { id } = req.params;
  const { customer_name, item_name, quantity, total_amount, status } = req.body;

  try {
    const [existing] = await pool.query('SELECT status FROM orders WHERE id = ?', [id]);
    if (existing.length === 0) return res.status(404).json({ error: 'Order not found' });
    const fromStatus = existing[0].status;

    await pool.query(
        `UPDATE orders SET customer_name = COALESCE(?, customer_name), item_name = COALESCE(?, item_name), quantity = COALESCE(?, quantity), total_amount = COALESCE(?, total_amount), status = COALESCE(?, status) WHERE id = ?`,
        [customer_name, item_name, quantity, total_amount, status, id]
    );

    await pool.query(
        'INSERT INTO order_events (order_id, from_status, to_status, event_note) VALUES (?, ?, ?, ?)',
        [id, fromStatus, status || fromStatus, 'Order details updated']
    );

    res.json({ message: 'Order updated successfully', id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/orders/:id/events', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM order_events WHERE order_id = ? ORDER BY created_at ASC', [req.params.id]);
    res.json(rows);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.delete('/api/orders/:id', async (req, res) => {
  try {
    await pool.query('DELETE FROM order_events WHERE order_id = ?', [req.params.id]);
    await pool.query('DELETE FROM orders WHERE id = ?', [req.params.id]);
    res.json({ message: 'Order deleted' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.listen(PORT, '0.0.0.0', () => {
  console.log(`Server listening on port ${PORT}`);
});

process.on('SIGTERM', async () => {
  if (producer) await producer.disconnect();
  if (pool) await pool.end();
  process.exit(0);
});
