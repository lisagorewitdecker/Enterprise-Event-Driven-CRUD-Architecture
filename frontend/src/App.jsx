import { useCallback, useEffect, useRef, useState } from "react";

const currency = new Intl.NumberFormat(undefined, { style: "currency", currency: "USD" });

export default function App() {
  const [orders, setOrders] = useState([]);
  const [customerName, setCustomerName] = useState("");
  const [itemName, setItemName] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [unitPrice, setUnitPrice] = useState("");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const ordersRequestSequence = useRef(0);

  const refreshOrders = useCallback(async (showUnavailable = false) => {
    const requestSequence = ++ordersRequestSequence.current;
    try {
      const response = await fetch("/api/orders");
      if (!response.ok) throw new Error("Could not load orders");
      const data = await response.json();
      if (requestSequence === ordersRequestSequence.current) {
        setOrders(data);
        setMessage((current) =>
          current === "The order service is unavailable. Retrying…" ? "" : current,
        );
      }
    } catch (error) {
      if (showUnavailable && requestSequence === ordersRequestSequence.current) {
        setMessage("The order service is unavailable. Retrying…");
      }
      throw error;
    }
  }, []);

  useEffect(() => {
    const refresh = () => refreshOrders(true).catch(() => {});
    refresh();
    const interval = window.setInterval(refresh, 1500);
    return () => {
      ordersRequestSequence.current += 1;
      window.clearInterval(interval);
    };
  }, [refreshOrders]);

  async function submitOrder(event) {
    event.preventDefault();
    setSubmitting(true);
    setMessage("");
    try {
      const response = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          customerName,
          items: [{ name: itemName, quantity: Number(quantity), unitPrice: Number(unitPrice) }],
        }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Order could not be submitted");
      setMessage(`Order ${result.orderId} accepted for asynchronous processing.`);
      setCustomerName("");
      setItemName("");
      setQuantity(1);
      setUnitPrice("");
      await refreshOrders().catch(() => {
        // A read failure does not invalidate the accepted order; polling will retry.
      });
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <main className="page">
      <header className="topbar">
        <div>
          <p className="eyebrow">EVENT-DRIVEN OPERATIONS</p>
          <h1>Order lifecycle</h1>
        </div>
        <span className="live-indicator"><span /> Live updates</span>
      </header>

      <section className="summary" aria-label="Order summary">
        <div>
          <span className="summary-label">Tracked orders</span>
          <strong>{orders.length}</strong>
        </div>
        <p>Orders progress asynchronously from pending to delivered.</p>
      </section>

      <section className="content">
        <form className="order-form" onSubmit={submitOrder}>
          <div className="section-heading">
            <div>
              <p className="eyebrow">NEW REQUEST</p>
              <h2>Create an order</h2>
            </div>
          </div>
          <label>
            Customer
            <input
              value={customerName}
              onChange={(event) => setCustomerName(event.target.value)}
              maxLength={120}
              required
              placeholder="Customer name"
            />
          </label>
          <label>
            Item
            <input
              value={itemName}
              onChange={(event) => setItemName(event.target.value)}
              maxLength={120}
              required
              placeholder="What are they ordering?"
            />
          </label>
          <div className="form-row">
            <label>
              Quantity
              <input
                type="number"
                min="1"
                max="100"
                value={quantity}
                onChange={(event) => setQuantity(event.target.value)}
                required
              />
            </label>
            <label>
              Unit price
              <input
                type="number"
                min="0"
                step="0.01"
                value={unitPrice}
                onChange={(event) => setUnitPrice(event.target.value)}
                required
                placeholder="0.00"
              />
            </label>
          </div>
          <button type="submit" disabled={submitting}>
            {submitting ? "Submitting…" : "Submit order"}
          </button>
          <p className="form-note">Submission is queued; order status updates as events are processed.</p>
          {message && <p className="message" role="status">{message}</p>}
        </form>

        <section className="orders-panel" aria-labelledby="orders-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">READ MODEL</p>
              <h2 id="orders-heading">Recent orders</h2>
            </div>
            <span className="order-count">{orders.length} shown</span>
          </div>
          {orders.length === 0 ? (
            <div className="empty-state">
              <span className="empty-icon">↗</span>
              <h3>No orders yet</h3>
              <p>Submit an order to start its event-driven journey.</p>
            </div>
          ) : (
            <div className="order-list">
              {orders.map((order) => (
                <article className="order-card" key={order.id}>
                  <div className="order-topline">
                    <div>
                      <h3>{order.customerName}</h3>
                      <span className="order-id">{order.id}</span>
                    </div>
                    <span className={`status status-${order.status.toLowerCase()}`}>{order.status}</span>
                  </div>
                  <div className="order-bottomline">
                    <span>{order.items.map((item) => `${item.quantity} × ${item.name}`).join(", ")}</span>
                    <strong>{currency.format(Number(order.total))}</strong>
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      </section>
      <footer>Command ingestion · Kafka events · MySQL read model</footer>
    </main>
  );
}
