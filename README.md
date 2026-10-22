# 🚀 Enterprise, Event-Driven Order Processing System

An asynchronous, distributed order life-cyles system built with **React 18**, **Node.js (Express)**, **Apache Kafka (KRaft)**, and **MySQL 8**. The application is fully containerized with Docker and orchestrated on Kubernetes.

This project demonstrates a production-grade event-driven architecture that moves away from synchronous CRUD bottlenecks in favor of CQRS-lite principles, decoupled ingestion, and deterministic state transitions.

---

## 🏛 Architecture & Design Patterns

Unlike standard CRUD applications where database transactions block HTTP responses, this system implements an event-driven CQRS-lite architecture:

[ React 18 Client Dashboard ]
│
▼  (Nginx Reverse Proxy: port 80 -> :5000)
[ Express API Gateway ]
│                │
│ (1) Write      ▼ (2) Dispatches Event
│     PENDING          to Kafka Partition
▼                      ▼
[ MySQL 8 ]        [ Apache Kafka (KRaft) ]
(appdb)                    │
▲                      ▼
│ (3) Idempotent State Updates & Audit Log
└──────────────[ Node.js Consumer Worker ]
│
▼ (4) On Deliberate Fault (Card Decline)
[ order-pipeline-dlq ]

Key Engineering Decisions
1. Non-Blocking O(1) Ingestion: The Express API Gateway persists an initial PENDING order, emits an event to the order-pipeline Kafka topic (using the order ID as the partition key), and immediately returns HTTP 202 Accepted.
2. Deterministic State Machine: A background worker group consumes partitions and sequentially transitions states (PENDING ➔ VALIDATING ➔ PAYMENT_PROCESSED ➔ FULFILLED).
3. Idempotent Consumers: State updates apply conditional SQL statements (WHERE id = ? AND status = ?), guaranteeing that duplicate Kafka message deliveries during rebalances or pod restarts never trigger double-processing.
4. Dead-Letter Queue (DLQ) & Fault Tolerance: Unrecoverable transactions (e.g., payment failure simulations) transition to FAILED and are routed to the order-pipeline-dlq topic for dlife cycler processing without blocking the main event stream.
5. Dual Data Model & Audit Ledger: High-speed operational queries read from the mutable orders table, while an append-only order_events table captures an immutable timeline of every lifecycle hop.

---

📦 Kubernetes Workloads
Service / Pod	K8s Type	Ports	Role / Function
client-service ClusterIP	90:90	
Nginx reverse proxy serving the React 18 production UI.
server-service	ClusterIP	5000:5000	Express REST API for high-throughput ingestion.
kafka-service	ClusterIP	9092:9092	Apache Kafka message broker (KRaft mode/ZooKeeper-less).
consumer	Deployment	—	Background worker executing state machine transitions.
mysql-service	ClusterIP	3306:3306	Relational datastore for orders and order_events.

---

🛠 Tech Stack

* Frontend: React 18, Vite, standard CSS.
* Backend: Node.js, Express, KafkaJS, mysql2.
* Database: MySQL 8.0.
* Messaging: Apache Kafka (KRaft mode).
* Infrastructure: Docker, Kubernetes (K8s), Nginx.

---

🚀 Local Deployment & Quick Start

Prerequisites
* Docker Desktop (with Kubernetes enabled) or Minikube
* kubectl CLI installed
* Node.js v20+ (for local testing/building)

1. Deploy the Infrastructure
   Apply the Kubernetes manifests to spin up the cluster resources:
# Apply all YAML manifests in the k8s directory
kubectl apply -f k8s/

# Monitor the pods until all read 1/1 Running
kubectl get pods -w

2. Access the Application
   Once all pods are running, open a network tunnel to the frontend client:
# Forward local port 9090 to the client Nginx service
kubectl port-forward 
svc/client-service 9090:90
Navigate to http://localhost:9090 
in your browser.

---

🧪 Testing the Pipeline (Usage)

1. Happy Path: Submit an order via the manual form. Watch the real-time UI reflect the state change as the Kafka consumer advances the order to FULFILLED.
2. Stress / Load Testing: Click ⚡ Simulate Burst (5x) to dispatch a rapid batch of orders.
3. Dead-Letter Queue (DLQ) Injection: Check the "Simulate payment failure" box before submitting. The background worker will intercept the failure, mark the order FAILED, save the failure reason, and route the payload to the DLQ topic.
4. Immutable Audit Trail: Click Audit on any order card to open the lifecycle ledger modal. This queries the order_events table to show the exact timestamped transitions (e.g., PENDING ➔ VALIDATING ➔ PAYMENT_PROCESSED).
5. Administrative Actions: Use the Edit, Cancel, and Delete buttons to test API-driven database updates and graceful lifecycle interruptions.

---

📝 License
This project is open-source and available under the MIT License. Developed by Lisa M. Gorewit-Decker