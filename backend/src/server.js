const express = require("express");
const { Kafka, logLevel } = require("kafkajs");
const { randomUUID } = require("node:crypto");
const { pool, initializeDatabase } = require("./db");
const { createOrderReadLimit } = require("./orderReadLimit");
const { TOPIC, applyOrderEvent, startOutboxPublisher } = require("./orderProcessor");

const app = express();
app.set("trust proxy", 1);
const orderReadLimit = createOrderReadLimit();
const kafka = new Kafka({
  clientId: "order-api",
  brokers: (process.env.KAFKA_BROKERS || "localhost:9092").split(","),
  logLevel: logLevel.ERROR,
});
const producer = kafka.producer({ idempotent: true });
const consumer = kafka.consumer({ groupId: "order-projection" });

app.use(express.json({ limit: "64kb" }));

async function waitForTopic() {
  const admin = kafka.admin();
  let lastError;
  let connected = false;

  for (let attempt = 0; attempt < 30; attempt += 1) {
    try {
      if (!connected) {
        await admin.connect();
        connected = true;
      }
      await admin.createTopics({
        topics: [{ topic: TOPIC, numPartitions: 3, replicationFactor: 1 }],
        waitForLeaders: true,
      });
      const metadata = await admin.fetchTopicMetadata({ topics: [TOPIC] });
      const partitions = metadata.topics[0]?.partitions || [];
      if (partitions.length && partitions.every((partition) => partition.leader >= 0)) {
        await admin.disconnect();
        return;
      }
      throw new Error(`Kafka topic ${TOPIC} has no active partition leaders`);
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }

  throw lastError;
}

app.get("/api/health", (_request, response) => response.json({ status: "ok" }));

app.get("/api/orders", orderReadLimit, async (_request, response, next) => {
  try {
    const [orders] = await pool.execute(
      "SELECT id, customer_name AS customerName, items, total, status, created_at AS createdAt, updated_at AS updatedAt FROM orders ORDER BY created_at DESC LIMIT 100",
    );
    response.json(orders);
  } catch (error) {
    next(error);
  }
});

app.get("/api/orders/:id", orderReadLimit, async (request, response, next) => {
  try {
    const [orders] = await pool.execute(
      "SELECT id, customer_name AS customerName, items, total, status, created_at AS createdAt, updated_at AS updatedAt FROM orders WHERE id = ?",
      [request.params.id],
    );
    if (!orders.length) return response.status(404).json({ error: "Order not found" });
    response.json(orders[0]);
  } catch (error) {
    next(error);
  }
});

app.post("/api/orders", async (request, response, next) => {
  try {
    const { customerName, items } = request.body || {};
    if (
      typeof customerName !== "string" ||
      !customerName.trim() ||
      customerName.trim().length > 120 ||
      !Array.isArray(items) ||
      !items.length ||
      items.length > 20
    ) {
      return response.status(400).json({ error: "Provide a customer name and 1 to 20 items" });
    }
    for (const item of items) {
      if (
        !item ||
        typeof item !== "object" ||
        typeof item.name !== "string" ||
        !item.name.trim() ||
        item.name.trim().length > 120 ||
        !Number.isInteger(item.quantity) ||
        item.quantity < 1 ||
        item.quantity > 100 ||
        !Number.isFinite(item.unitPrice) ||
        item.unitPrice < 0
      ) {
        return response.status(400).json({ error: "Each item needs a name, quantity, and nonnegative unit price" });
      }
    }

    const orderItems = items.map((item) => ({
      name: item.name.trim(),
      quantity: item.quantity,
      unitPrice: Math.round(item.unitPrice * 100) / 100,
    }));
    const total = Math.round(
      orderItems.reduce((sum, item) => sum + item.quantity * item.unitPrice, 0) * 100,
    ) / 100;
    if (total > 99_999_999.99) {
      return response.status(400).json({ error: "Order total exceeds the supported limit" });
    }
    const orderId = randomUUID();
    const event = {
      eventId: randomUUID(),
      orderId,
      type: "order.submitted",
      occurredAt: new Date().toISOString(),
      order: { customerName: customerName.trim(), items: orderItems, total },
    };

    await producer.send({
      topic: TOPIC,
      acks: -1,
      messages: [{ key: orderId, value: JSON.stringify(event) }],
    });
    response.status(202).json({ orderId, status: "PENDING" });
  } catch (error) {
    next(error);
  }
});

app.use((error, _request, response, _next) => {
  console.error(error);
  const status = Number.isInteger(error.status) && error.status >= 400 && error.status < 500
    ? error.status
    : 500;
  response.status(status).json({ error: status === 400 ? "Invalid request" : "Internal server error" });
});

async function start() {
  await initializeDatabase();
  await waitForTopic();
  await producer.connect();
  await consumer.connect();
  await consumer.subscribe({ topic: TOPIC, fromBeginning: true });
  await consumer.run({
    eachMessage: async ({ message }) => {
      const event = JSON.parse(message.value.toString());
      await applyOrderEvent(pool, event);
    },
  });
  const stopOutbox = startOutboxPublisher(pool, producer);
  const server = app.listen(Number(process.env.PORT || 3000), "0.0.0.0", () => {
    console.log(`Order API listening on port ${process.env.PORT || 3000}`);
  });

  async function shutdown() {
    await new Promise((resolve, reject) => {
      server.close((error) => error ? reject(error) : resolve());
    });
    await stopOutbox();
    await consumer.disconnect();
    await producer.disconnect();
    await pool.end();
  }
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

start().catch((error) => {
  console.error("Unable to start order API:", error);
  process.exit(1);
});
