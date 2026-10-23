# Asynchronous Order Lifecycle

A small CQRS-lite reference application: an Express command/query API accepts orders into Kafka, a consumer advances each order through deterministic lifecycle events, and MySQL stores the read model and event audit. The React 18 dashboard polls the read model for live status updates.

## Run locally with Docker

Docker Compose starts Kafka in single-node KRaft mode, MySQL 8, the API, and the React dashboard:

```sh
docker compose up --build
```

Open [http://localhost:8080](http://localhost:8080). The Compose database credentials are for local development only; use managed secrets and secure Kafka/MySQL configuration outside a local sandbox.

Order creation returns `202 Accepted` as soon as the event is written to Kafka. The Kafka consumer updates the MySQL read model and transactionally records the next lifecycle event in an outbox. The outbox publisher emits those events back to Kafka, and event IDs make consumer retries idempotent.

```text
PENDING → CONFIRMED → PROCESSING → SHIPPED → DELIVERED
```

Transitions are defined in `backend/src/domain/orderLifecycle.js`. Events are keyed by order ID so all events for an order use the same Kafka partition. Orders and their event history are stored in MySQL.

## API

| Method | Path | Behavior |
| --- | --- | --- |
| `POST` | `/api/orders` | Validate and queue an order; returns `202` with its ID |
| `GET` | `/api/orders` | Read the latest 100 orders from the MySQL projection |
| `GET` | `/api/orders/:id` | Read one order by ID |
| `GET` | `/api/health` | Liveness endpoint |

Example request:

```json
{
  "customerName": "Ada Lovelace",
  "items": [{ "name": "Notebook", "quantity": 2, "unitPrice": 8.5 }]
}
```

## Development

Requires Node.js 24 and npm:

```sh
npm install
npm test
npm run build
npm run dev:backend
npm run dev:frontend
```

The API expects MySQL and Kafka at `MYSQL_HOST` and `KAFKA_BROKERS`; defaults target local services. To run the complete UI/API/dependency stack, use Docker Compose.

## Kubernetes

Build and load the images into your cluster, then apply the single-node reference manifests:

```sh
docker build -f backend/Dockerfile -t order-api:local .
docker build -f frontend/Dockerfile -t order-dashboard:local .
kubectl apply -f k8s/order-platform.yaml
```

Load both images into your cluster before applying the manifests (for example, use `kind load docker-image` with kind). The frontend is exposed through NodePort `30080`. Replace both database passwords in the example Kubernetes Secret before use. The single-replica Kafka and MySQL StatefulSets are for demonstration, not a highly available production deployment.
