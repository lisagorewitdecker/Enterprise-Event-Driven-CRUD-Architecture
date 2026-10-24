# Enterprise Event-Driven CRUD Architecture Order Processing Dashboard
## An enterprise-grade, scalable order processing pipeline demonstrating event-driven microservices, state machine transitions, and real-time dashboard updates. Built with React, Node.js, Apache Kafka, MySQL, and Kubernetes.

### 🚀 Overview
This project simulates a high-throughput e-commerce order processing system. Instead of synchronous, blocking API calls, it utilizes an Event-Driven Architecture (EDA). The Express.js API Gateway handles immediate CRUD operations and database persistence, while delegating heavy business logic (like payment processing and fulfillment) to an asynchronous Apache Kafka background worker.

### 🏗️ Architecture & 
Data Flow Client (React 18): Provides a real-time dashboard with metric cards, order creation forms, and an audit ledger.

API Gateway (Express.js): Receives HTTP requests, saves the initial PENDING state to MySQL, and publishes an OrderSubmitted event to Kafka.

Message Broker (Apache Kafka): Acts as the central nervous system, decoupling the web API from background processing.

Consumer Worker (Node.js): Subscribes to the Kafka topic, processes the business logic, and updates the database to FULFILLED or FAILED.

Database (MySQL 8): Maintains the source of truth for current order states and an append-only order_events table for the audit trail.

Orchestration (Kubernetes): Manages the deployment, scaling, and networking of all microservices via internal services and an Nginx ingress/proxy.

### 🛠️ Tech Stack
Frontend: React 18, Vite, CSS Flexbox/Grid

Backend: Node.js, Express.js, KafkaJS

Database: MySQL 8

Message Broker: Apache Kafka & Zookeeper

Infrastructure: Kubernetes, Docker, Nginx

### ✨ Key Features
Event-Driven State Machine: Orders transition automatically from PENDING ➔ VALIDATING ➔ PAYMENT_PROCESSED ➔ FULFILLED.

Real-Time Metrics: Color-coded aggregate cards for Total Orders, In Progress, Fulfilled/Revenue, and Failed orders.

Audit Ledger: Every state transition is recorded in an immutable event log, viewable via the UI.

Burst Simulation: A 1-click generator to blast the API with multiple concurrent orders to observe Kafka queueing and processing.

Failure Handling: Built-in simulation for dead-letter queues and failed payment processing.

Full CRUD: Create new orders, Read live statuses, Update details, and Delete/Cancel orders safely.

### 🚦 Getting Started
Prerequisites
Docker Desktop or Docker (with Kubernetes enabled) or Minikube

kubectl CLI installed

### Deployment
Clone the repository:

### Bash
git clone https://github.com/lisagorewitdecker/Enterprise-Event-Driven-CRUD-Architecture.git
cd Enterprise-Event-Driven-CRUD-Architecture
Build the application images using the tags referenced by the manifests. The client build creates the `dist` directory required by `client/Dockerfile`:

### Bash
cd client
npm ci
npm run build
cd ..
docker build -t my-app/server:v13 ./server
docker build -t my-app/consumer:v14 ./consumer
docker build -t client:latest ./client

For Minikube, load the images into its image cache:

### Bash
minikube image load my-app/server:v13
minikube image load my-app/consumer:v14
minikube image load client:latest

Docker Desktop Kubernetes can use images built by Docker directly. For another cluster, push these tags to a registry accessible to the cluster and update the image references in the corresponding manifests.

Create the database credential directly in the cluster before deploying. This command generates a random password; do not commit generated credentials to the repository.

### Bash
kubectl create secret generic app-secrets \
  --from-literal=mysql-root-password="$(openssl rand -base64 32)"

Deploy the numbered manifests, which are the supported set for this application. Do not apply `k8s/order-platform.yaml` with them:

### Bash
kubectl apply -f k8s/01-mysql.yaml \
  -f k8s/02-kafka.yaml \
  -f k8s/03-server.yaml \
  -f k8s/04-consumer.yaml \
  -f k8s/05-client.yaml

Verify Pods are Running:

### Bash
kubectl rollout status deployment/mysql
kubectl get pods
Wait for MySQL, Zookeeper, Kafka, Server, Consumer, and Client to show Running.

Initialize the schema from `database/schema.sql` on a fresh database before using the application:

### Bash
kubectl exec -i deployment/mysql -- sh -c 'mysql -uroot -p"$MYSQL_ROOT_PASSWORD" appdb' < database/schema.sql

## Access the Application:
Port-forward the client service to your local machine:

### Bash
kubectl port-forward svc/client-service 9090:80
Open your browser and navigate to http://localhost:9090

## 🧪 Usage Instructions
Submit an Order: Use the manual submission form to create a single order.

Simulate Load: Click ⚡ Simulate Burst (5x) to push a batch of orders and watch the Kafka consumer process them asynchronously.

View Audit Trail: Click the Audit button on any order to see its lifecycle ledger and timestamped state transitions.

Test Failures: Check the "Simulate payment failure" box when creating an order to watch it route to the FAILED state.
