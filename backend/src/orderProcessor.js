const { randomUUID } = require("node:crypto");
const { transitionOrder } = require("./domain/orderLifecycle");

const TOPIC = process.env.KAFKA_TOPIC || "order-events";

async function applyOrderEvent(pool, event) {
  const connection = await pool.getConnection();

  try {
    await connection.beginTransaction();
    const [duplicates] = await connection.execute(
      "SELECT event_id FROM order_events WHERE event_id = ?",
      [event.eventId],
    );

    if (duplicates.length) {
      await connection.commit();
      return;
    }

    let currentStatus = null;
    if (event.type !== "order.submitted") {
      const [orders] = await connection.execute(
        "SELECT status FROM orders WHERE id = ? FOR UPDATE",
        [event.orderId],
      );
      if (!orders.length) throw new Error(`Order ${event.orderId} does not exist`);
      currentStatus = orders[0].status;
    }

    const transition = transitionOrder(currentStatus, event.type);
    if (event.type === "order.submitted") {
      const order = event.order;
      await connection.execute(
        `INSERT INTO orders (id, customer_name, items, total, status)
         VALUES (?, ?, ?, ?, ?)`,
        [event.orderId, order.customerName, JSON.stringify(order.items), order.total, transition.status],
      );
    } else {
      await connection.execute("UPDATE orders SET status = ? WHERE id = ?", [
        transition.status,
        event.orderId,
      ]);
    }

    await connection.execute(
      "INSERT INTO order_events (event_id, order_id, event_type, payload) VALUES (?, ?, ?, ?)",
      [event.eventId, event.orderId, event.type, JSON.stringify(event)],
    );

    if (transition.nextEventType) {
      const nextEvent = {
        eventId: randomUUID(),
        orderId: event.orderId,
        type: transition.nextEventType,
        occurredAt: new Date().toISOString(),
      };
      await connection.execute(
        "INSERT INTO order_outbox (event_id, order_id, payload) VALUES (?, ?, ?)",
        [nextEvent.eventId, nextEvent.orderId, JSON.stringify(nextEvent)],
      );
    }

    await connection.commit();
  } catch (error) {
    await connection.rollback();
    throw error;
  } finally {
    connection.release();
  }
}

async function publishOutbox(pool, producer) {
  const [rows] = await pool.execute(
    "SELECT event_id, order_id, payload FROM order_outbox WHERE published_at IS NULL ORDER BY created_at LIMIT 50",
  );

  for (const row of rows) {
    const event = typeof row.payload === "string" ? JSON.parse(row.payload) : row.payload;
    await producer.send({
      topic: TOPIC,
      acks: -1,
      messages: [{ key: row.order_id, value: JSON.stringify(event) }],
    });
    await pool.execute("UPDATE order_outbox SET published_at = CURRENT_TIMESTAMP WHERE event_id = ?", [
      row.event_id,
    ]);
  }
}

function startOutboxPublisher(pool, producer) {
  let running = true;
  const task = (async () => {
    while (running) {
      try {
        await publishOutbox(pool, producer);
      } catch (error) {
        console.error("Outbox publish failed:", error.message);
      }
      await new Promise((resolve) => setTimeout(resolve, 500));
    }
  })();

  return async () => {
    running = false;
    await task;
  };
}

module.exports = { TOPIC, applyOrderEvent, publishOutbox, startOutboxPublisher };
