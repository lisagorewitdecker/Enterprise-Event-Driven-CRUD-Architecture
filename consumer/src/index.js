const { Kafka, Partitioners } = require('kafkajs');
const mysql = require('mysql2/promise');

// 1. Database Connection Pool
const pool = mysql.createPool({
    host: process.env.MYSQL_HOST || 'mysql-service',
    user: process.env.MYSQL_USER || 'root',
    password: process.env.MYSQL_PASSWORD || 'rootpassword',
    database: process.env.MYSQL_DATABASE || 'appdb',
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
});

// 2. Kafka Client Configuration
const kafka = new Kafka({
    clientId: 'order-consumer-worker',
    brokers: [process.env.KAFKA_BROKER || 'kafka-service:9092'],
    retry: {
        initialRetryTime: 300,
        retries: 10,
    },
});

const consumer = kafka.consumer({ groupId: 'order-processing-group' });
const producer = kafka.producer({
    createPartitioner: Partitioners.DefaultPartitioner,
});

// Sleep helper for simulated processing stages
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function transitionOrder(orderId, fromStatus, toStatus, eventNote, failureReason = null) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();
        const [result] = failureReason
            ? await connection.query(
                'UPDATE orders SET status = ?, failure_reason = ? WHERE id = ? AND status = ?',
                [toStatus, failureReason, orderId, fromStatus]
            )
            : await connection.query(
                'UPDATE orders SET status = ? WHERE id = ? AND status = ?',
                [toStatus, orderId, fromStatus]
            );

        if (result.affectedRows > 0) {
            await connection.query(
                'INSERT INTO order_events (order_id, from_status, to_status, event_note) VALUES (?, ?, ?, ?)',
                [orderId, fromStatus, toStatus, eventNote]
            );
        }

        await connection.commit();
        return result.affectedRows > 0;
    } catch (err) {
        await connection.rollback();
        throw err;
    } finally {
        connection.release();
    }
}

// Helper: Ensure MySQL connectivity with retry logic
async function waitForDatabase() {
    let retries = 10;
    while (retries > 0) {
        try {
            const conn = await pool.getConnection();
            console.log('MySQL connected successfully.');
            conn.release();
            return;
        } catch (err) {
            console.warn(`MySQL not ready yet (${err.message}). Retrying in 3s...`);
            retries--;
            await sleep(3000);
        }
    }
    throw new Error('Could not connect to MySQL after multiple attempts.');
}

// 3. State Machine Event Processor
async function processOrder(order) {
    const orderId = order.order_id || order.id;
    const orderNumber = order.order_number;

    console.log(`\n--- [INCOMING] Processing ${orderNumber} (ID: ${orderId}) ---`);

    // Stage 1: VALIDATING
    console.log(`[STAGE 1] Validating inventory & parameters for ${orderNumber}`);
    const validationTransitioned = await transitionOrder(
        orderId,
        'PENDING',
        'VALIDATING',
        'Inventory verified in primary distribution center'
    );
    if (validationTransitioned) await sleep(1500);

    // Check Fault Injection / Simulate Failure flag
    if (order.simulate_failure) {
        console.warn(`[DLQ TRIGGER] Simulating payment decline for ${orderNumber}`);
        const failureReason = 'Payment Gateway Declined: Card issuer reported insufficient liquidity';

        const failureTransitioned = await transitionOrder(
            orderId,
            'VALIDATING',
            'FAILED',
            failureReason,
            failureReason
        );
        if (!failureTransitioned) {
            const [rows] = await pool.query('SELECT status FROM orders WHERE id = ?', [orderId]);
            if (rows.length === 0 || rows[0].status !== 'FAILED') return;
        }

        // Route message to Dead-Letter Queue (DLQ)
        await producer.send({
            topic: 'order-pipeline-dlq',
            messages: [{
                key: String(orderId),
                value: JSON.stringify({
                    ...order,
                    failed_at: new Date().toISOString(),
                    error: failureReason,
                }),
            }],
        });
        console.log(`[DLQ] Order ${orderNumber} routed to order-pipeline-dlq topic.`);
        return;
    }

    // Stage 2: PAYMENT_PROCESSED
    console.log(`[STAGE 2] Capturing payment ledger for ${orderNumber}`);
    const paymentTransitioned = await transitionOrder(
        orderId,
        'VALIDATING',
        'PAYMENT_PROCESSED',
        'Payment settled via payment gateway'
    );
    if (paymentTransitioned) await sleep(1500);

    // Stage 3: FULFILLED
    console.log(`[STAGE 3] Dispatching fulfillment for ${orderNumber}`);
    const fulfillmentTransitioned = await transitionOrder(
        orderId,
        'PAYMENT_PROCESSED',
        'FULFILLED',
        'Airbill printed and order staged for carrier dispatch'
    );
    if (fulfillmentTransitioned) {
        console.log(`[COMPLETED] Order ${orderNumber} successfully fulfilled.\n`);
    }
}

// 4. Main Entrypoint Function
async function startConsumer() {
    try {
        await waitForDatabase();

        await consumer.connect();
        await producer.connect();
        console.log('Kafka Consumer and DLQ Producer connected.');

        await consumer.subscribe({ topic: 'order-pipeline', fromBeginning: true });
        console.log('Subscribed to order-pipeline topic. Waiting for events...');

        await consumer.run({
            eachMessage: async ({ topic, partition, message }) => {
                try {
                    const raw = message.value.toString();
                    const order = JSON.parse(raw);
                    await processOrder(order);
                } catch (err) {
                    console.error(`Error processing message at partition ${partition}:`, err);
                    throw err;
                }
            },
        });
    } catch (err) {
        console.error('Fatal consumer error:', err);
        process.exit(1);
    }
}

// Graceful Termination
async function shutdown() {
    console.log('\nShutting down consumer cleanly...');
    try {
        await consumer.disconnect();
        await producer.disconnect();
        await pool.end();
        console.log('Consumer worker disconnected.');
        process.exit(0);
    } catch (err) {
        console.error('Error during shutdown:', err);
        process.exit(1);
    }
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Execute the async runner
startConsumer();
