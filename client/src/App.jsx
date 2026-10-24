import React, { useState, useEffect, useCallback, useRef } from 'react';

export default function App() {
  const [orders, setOrders] = useState([]);
  const [isConnected, setIsConnected] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [editingOrder, setEditingOrder] = useState(null);
  const [timeline, setTimeline] = useState([]);
  const [loadingTimeline, setLoadingTimeline] = useState(false);
  const ordersRequestGeneration = useRef(0);

  const [formData, setFormData] = useState({
    customer_name: '',
    item_name: '',
    quantity: 1,
    total_amount: '',
    simulate_failure: false,
  });

  const fetchOrders = useCallback(async () => {
    const requestGeneration = ++ordersRequestGeneration.current;
    setIsRefreshing(true);
    try {
      const res = await fetch('/api/orders');
      if (res.ok) {
        const data = await res.json();
        if (requestGeneration === ordersRequestGeneration.current) {
          setOrders(Array.isArray(data) ? data : []);
          setIsConnected(true);
        }
      } else if (requestGeneration === ordersRequestGeneration.current) {
        setIsConnected(false);
      }
    } catch (err) {
      console.error('API connection failed:', err);
      if (requestGeneration === ordersRequestGeneration.current) {
        setIsConnected(false);
      }
    } finally {
      if (requestGeneration === ordersRequestGeneration.current) {
        setIsRefreshing(false);
      }
    }
  }, []);

  const invalidateOrdersRequests = () => {
    ordersRequestGeneration.current += 1;
    setIsRefreshing(false);
  };

  useEffect(() => {
    fetchOrders();
    const interval = setInterval(fetchOrders, 3000);
    return () => clearInterval(interval);
  }, [fetchOrders]);

  const handleCreate = async (e) => {
    e.preventDefault();
    try {
      const res = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...formData,
          simulate_failure: Boolean(formData.simulate_failure),
        }),
      });
      if (res.ok) {
        invalidateOrdersRequests();
        setFormData({ customer_name: '', item_name: '', quantity: 1, total_amount: '', simulate_failure: false });
        fetchOrders();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Create failed: ${data.error || res.statusText}`);
      }
    } catch (err) {
      alert(`Network error: ${err.message}`);
    }
  };

  const handleCancelOrder = async (id, orderNumber) => {
    if (!window.confirm(`Cancel order ${orderNumber}?`)) return;
    try {
      const res = await fetch(`/api/orders/${id}/cancel`, { method: 'POST' });
      if (res.ok) {
        invalidateOrdersRequests();
        fetchOrders();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Cancel failed: ${data.error || res.statusText}`);
      }
    } catch (err) {
      alert(`Network error: ${err.message}`);
    }
  };

  const handleUpdate = async (e) => {
    e.preventDefault();
    if (!editingOrder) return;
    try {
      const res = await fetch(`/api/orders/${editingOrder.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editingOrder),
      });
      if (res.ok) {
        invalidateOrdersRequests();
        setEditingOrder(null);
        fetchOrders();
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Update failed: ${data.error || res.statusText}`);
      }
    } catch (err) {
      alert(`Network error during update: ${err.message}`);
    }
  };

  const handleDelete = async (id, orderNumber) => {
    if (!window.confirm(`Delete order ${orderNumber}? This will also clear its audit events.`)) return;
    try {
      const res = await fetch(`/api/orders/${id}`, { method: 'DELETE' });
      if (res.ok) {
        invalidateOrdersRequests();
        setOrders((prev) => prev.filter((o) => o.id !== id));
      } else {
        const data = await res.json().catch(() => ({}));
        alert(`Delete failed: ${data.error || res.statusText}`);
      }
    } catch (err) {
      alert(`Network error during delete: ${err.message}`);
    }
  };

  const simulateBurst = async () => {
    const items = [
      { item: 'Kubernetes Cluster Node (c6i.2xlarge)', amount: 149.99 },
      { item: 'Enterprise Kafka Partition Pack', amount: 299.00 },
      { item: 'MySQL Aurora Replication Instance', amount: 89.50 },
      { item: 'Ingress TLS Wildcard Certificate', amount: 45.00 },
      { item: 'Prometheus Monitoring Metrics Node', amount: 110.00 },
    ];

    for (let i = 0; i < items.length; i++) {
      try {
        const res = await fetch('/api/orders', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            customer_name: `DevOps Engineer #${Math.floor(100 + Math.random() * 900)}`,
            item_name: items[i].item,
            quantity: 1,
            total_amount: items[i].amount,
            simulate_failure: i === 2,
          }),
        });
        if (res.ok) {
          invalidateOrdersRequests();
        }
      } catch (err) {
        console.error('Burst error:', err);
      }
    }
    fetchOrders();
  };

  const openAuditTrail = async (order) => {
    setSelectedOrder(order);
    setLoadingTimeline(true);
    try {
      const res = await fetch(`/api/orders/${order.id}/events`);
      if (res.ok) {
        const events = await res.json();
        setTimeline(Array.isArray(events) ? events : []);
      }
    } catch (err) {
      console.error('Audit trail error:', err);
    } finally {
      setLoadingTimeline(false);
    }
  };
// Calculate metrics
  const totalOrders = orders.length;
  const fulfilledOrders = orders.filter(o => o.status === 'FULFILLED').length;
  const pendingOrders = orders.filter(o => ['PENDING', 'VALIDATING', 'PAYMENT_PROCESSED'].includes(o.status)).length;
  const failedOrders = orders.filter(o => o.status === 'FAILED').length;
  const totalRevenue = orders
      .filter(o => o.status === 'FULFILLED')
      .reduce((sum, order) => sum + parseFloat(order.total_amount || 0), 0)
      .toFixed(2);

  return (
      <div style={{ maxWidth: '960px', margin: '30px auto', fontFamily: 'system-ui, -apple-system, sans-serif', padding: '0 20px', color: '#1f2937' }}>
        <header style={{ borderBottom: '2px solid #e5e7eb', paddingBottom: '16px', marginBottom: '24px', display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <h1 style={{ margin: 0, fontSize: '28px', fontWeight: '700', color: '#111827' }}>Enterprise Event Driven CRUD Architecture</h1>
              <span style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '6px',
                padding: '4px 12px',
                borderRadius: '9999px',
                fontSize: '12px',
                fontWeight: '700',
                backgroundColor: isConnected ? '#dcfce7' : '#fee2e2',
                color: isConnected ? '#15803d' : '#b91c1c',
              }}>
                <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: isConnected ? '#22c55e' : '#ef4444' }} />
                {isConnected ? 'Connected' : 'Disconnected'}
              </span>
            </div>
            <h2 style={{ margin: '6px 0 0 0', fontSize: '20px', fontWeight: '500', color: '#4b5563' }}>Order Processing Dashboard</h2>
            <p style={{ margin: '6px 0 0 0', color: '#6b7280', fontSize: '14px' }}>React 18 • Express API Gateway • Apache Kafka • MySQL 8 • Kubernetes</p>
          </div>
          <div style={{ display: 'flex', gap: '10px', marginTop: '4px' }}>
            <button
                type="button"
                onClick={simulateBurst}
                style={{ background: '#4f46e5', color: '#fff', border: 'none', padding: '9px 16px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
              ⚡ Simulate Burst (5x)
            </button>
            <button
                type="button"
                onClick={fetchOrders}
                disabled={isRefreshing}
                style={{ background: '#f3f4f6', color: '#374151', border: '1px solid #d1d5db', padding: '9px 16px', borderRadius: '6px', fontWeight: '600', cursor: isRefreshing ? 'wait' : 'pointer' }}>
              {isRefreshing ? '🔄 Refreshing...' : '🔄 Refresh'}
            </button>
          </div>
        </header>
        {/* Metrics Dashboard */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px', marginBottom: '28px' }}>
          <div style={{ background: '#f9fafb', padding: '16px', borderRadius: '8px', border: '1px solid #e5e7eb', borderLeft: '4px solid #6b7280' }}>
            <div style={{ fontSize: '13px', color: '#6b7280', fontWeight: '700', textTransform: 'uppercase' }}>Total Orders</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#111827', marginTop: '4px' }}>{totalOrders}</div>
          </div>
          <div style={{ background: '#eff6ff', padding: '16px', borderRadius: '8px', border: '1px solid #bfdbfe', borderLeft: '4px solid #3b82f6' }}>
            <div style={{ fontSize: '13px', color: '#1e40af', fontWeight: '700', textTransform: 'uppercase' }}>In Progress</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#1e3a8a', marginTop: '4px' }}>{pendingOrders}</div>
          </div>
          <div style={{ background: '#ecfdf5', padding: '16px', borderRadius: '8px', border: '1px solid #a7f3d0', borderLeft: '4px solid #10b981' }}>
            <div style={{ fontSize: '13px', color: '#065f46', fontWeight: '700', textTransform: 'uppercase' }}>Fulfilled / Revenue</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#064e3b', marginTop: '4px' }}>
              {fulfilledOrders} <span style={{ fontSize: '16px', fontWeight: '500', opacity: 0.8 }}>(${totalRevenue})</span>
            </div>
          </div>
          <div style={{ background: '#fef2f2', padding: '16px', borderRadius: '8px', border: '1px solid #fecaca', borderLeft: '4px solid #ef4444' }}>
            <div style={{ fontSize: '13px', color: '#991b1b', fontWeight: '700', textTransform: 'uppercase' }}>Failed</div>
            <div style={{ fontSize: '24px', fontWeight: '700', color: '#7f1d1d', marginTop: '4px' }}>{failedOrders}</div>
          </div>
        </div>
        {/* Manual Submission Form */}
        <form onSubmit={handleCreate} style={{ background: '#fff', border: '1px solid #e5e7eb', borderRadius: '8px', padding: '20px', marginBottom: '28px', boxShadow: '0 1px 3px rgba(0,0,0,0.05)' }}>
          <h3 style={{ margin: '0 0 14px 0', fontSize: '16px' }}>Submit New Order</h3>
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 2fr 1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <input
                placeholder="Customer name *"
                required
                value={formData.customer_name}
                onChange={(e) => setFormData({ ...formData, customer_name: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
                placeholder="Item name *"
                required
                value={formData.item_name}
                onChange={(e) => setFormData({ ...formData, item_name: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
                type="number"
                min="1"
                placeholder="Qty"
                required
                value={formData.quantity}
                onChange={(e) => setFormData({ ...formData, quantity: parseInt(e.target.value, 10) || 1 })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
            <input
                type="number"
                step="0.01"
                placeholder="Amount $"
                required
                value={formData.total_amount}
                onChange={(e) => setFormData({ ...formData, total_amount: e.target.value })}
                style={{ padding: '8px 12px', border: '1px solid #d1d5db', borderRadius: '6px' }}
            />
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <label style={{ fontSize: '14px', color: '#4b5563', display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer' }}>
              <input
                  type="checkbox"
                  checked={formData.simulate_failure}
                  onChange={(e) => setFormData({ ...formData, simulate_failure: e.target.checked })}
              />
              <strong>Simulate payment failure (Trigger Dead-Letter Queue)</strong>
            </label>
            <button type="submit" style={{ background: '#111827', color: '#fff', border: 'none', padding: '8px 18px', borderRadius: '6px', fontWeight: '600', cursor: 'pointer' }}>
              Create Order
            </button>
          </div>
        </form>

        {/* Orders List */}
        <main style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {orders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: '40px', color: '#9ca3af', border: '1px dashed #d1d5db', borderRadius: '8px' }}>
                No orders found. Click <strong>⚡ Simulate Burst</strong> or submit an order above.
              </div>
          ) : (
              orders.map((order) => {
                let badgeBg = '#f3f4f6';
                let badgeColor = '#6b7280';
                if (order.status === 'FULFILLED') { badgeBg = '#d1fae5'; badgeColor = '#047857'; }
                else if (order.status === 'FAILED') { badgeBg = '#fee2e2'; badgeColor = '#b91c1c'; }
                else if (order.status === 'CANCELLED') { badgeBg = '#f3f4f6'; badgeColor = '#6b7280'; }
                else if (['VALIDATING', 'PAYMENT_PROCESSED'].includes(order.status)) { badgeBg = '#dbeafe'; badgeColor = '#1d4ed8'; }

                const canCancel = !['FULFILLED', 'FAILED', 'CANCELLED'].includes(order.status);

                return (
                    <div key={order.id} style={{ border: '1px solid #e5e7eb', borderRadius: '8px', padding: '16px', background: '#fff', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                          <span style={{ fontWeight: '700', fontSize: '16px' }}>{order.order_number}</span>
                          <span style={{ background: badgeBg, color: badgeColor, padding: '2px 8px', borderRadius: '9999px', fontSize: '12px', fontWeight: '700' }}>
                      {order.status}
                    </span>
                        </div>
                        <div style={{ fontSize: '14px', color: '#374151' }}>
                          <strong>{order.customer_name}</strong> ordered <strong>{order.quantity}x {order.item_name}</strong> (${parseFloat(order.total_amount).toFixed(2)})
                        </div>
                        {order.failure_reason && (
                            <div style={{ fontSize: '13px', color: '#dc2626', marginTop: '4px' }}>
                              Reason: {order.failure_reason}
                            </div>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '8px' }}>
                        <button
                            type="button"
                            onClick={() => openAuditTrail(order)}
                            style={{ background: '#f9fafb', border: '1px solid #d1d5db', color: '#374151', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                          Audit
                        </button>
                        {canCancel && (
                            <button
                                type="button"
                                onClick={() => handleCancelOrder(order.id, order.order_number)}
                                style={{ background: '#fff', border: '1px solid #fca5a5', color: '#dc2626', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                              Cancel
                            </button>
                        )}
                        <button
                            type="button"
                            onClick={() => setEditingOrder(order)}
                            style={{ background: '#f9fafb', border: '1px solid #d1d5db', color: '#2563eb', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                          Edit
                        </button>
                        <button
                            type="button"
                            onClick={() => handleDelete(order.id, order.order_number)}
                            style={{ background: '#fef2f2', border: '1px solid #fecaca', color: '#dc2626', padding: '6px 12px', borderRadius: '6px', fontSize: '13px', cursor: 'pointer' }}>
                          Delete
                        </button>
                      </div>
                    </div>
                );
              })
          )}
        </main>

        {/* Edit/Update Modal */}
        {editingOrder && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: '#fff', borderRadius: '10px', maxWidth: '480px', width: '90%', padding: '24px' }}>
                <h3 style={{ marginTop: 0 }}>Update Order: {editingOrder.order_number}</h3>
                <form onSubmit={handleUpdate} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Customer Name</label>
                    <input
                        value={editingOrder.customer_name}
                        onChange={(e) => setEditingOrder({ ...editingOrder, customer_name: e.target.value })}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Item Name</label>
                    <input
                        value={editingOrder.item_name}
                        onChange={(e) => setEditingOrder({ ...editingOrder, item_name: e.target.value })}
                        style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                    />
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Quantity</label>
                      <input
                          type="number"
                          value={editingOrder.quantity}
                          onChange={(e) => setEditingOrder({ ...editingOrder, quantity: parseInt(e.target.value, 10) || 1 })}
                          style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}
                      />
                    </div>
                    <div>
                      <label style={{ display: 'block', fontSize: '13px', marginBottom: '4px' }}>Status</label>
                      <select
                          value={editingOrder.status}
                          onChange={(e) => setEditingOrder({ ...editingOrder, status: e.target.value })}
                          style={{ width: '100%', padding: '8px', border: '1px solid #d1d5db', borderRadius: '6px' }}>
                        <option value="PENDING">PENDING</option>
                        <option value="VALIDATING">VALIDATING</option>
                        <option value="PAYMENT_PROCESSED">PAYMENT_PROCESSED</option>
                        <option value="FULFILLED">FULFILLED</option>
                        <option value="FAILED">FAILED</option>
                        <option value="CANCELLED">CANCELLED</option>
                      </select>
                    </div>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '16px' }}>
                    <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setEditingOrder(null);
                        }}
                        style={{ background: '#f3f4f6', border: '1px solid #d1d5db', padding: '8px 14px', borderRadius: '6px', cursor: 'pointer' }}>
                      Cancel
                    </button>
                    <button type="submit" style={{ background: '#2563eb', color: '#fff', border: 'none', padding: '8px 16px', borderRadius: '6px', cursor: 'pointer', fontWeight: '600' }}>
                      Save Changes
                    </button>
                  </div>
                </form>
              </div>
            </div>
        )}

        {/* Audit Modal */}
        {selectedOrder && (
            <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
              <div style={{ background: '#fff', borderRadius: '10px', maxWidth: '520px', width: '90%', maxHeight: '80vh', overflowY: 'auto', padding: '24px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #e5e7eb', paddingBottom: '12px', marginBottom: '16px' }}>
                  <div>
                    <h3 style={{ margin: 0, fontSize: '18px' }}>Lifecycle Ledger</h3>
                    <small style={{ color: '#6b7280' }}>{selectedOrder.order_number}</small>
                  </div>
                  <button
                      type="button"
                      onClick={(e) => {
                        e.preventDefault();
                        e.stopPropagation();
                        setSelectedOrder(null);
                      }}
                      style={{ background: 'transparent', border: 'none', fontSize: '20px', cursor: 'pointer', color: '#9ca3af' }}>
                    ✕
                  </button>
                </div>

                {loadingTimeline ? (
                    <p style={{ textAlign: 'center', color: '#6b7280' }}>Loading events...</p>
                ) : timeline.length === 0 ? (
                    <p style={{ textAlign: 'center', color: '#6b7280' }}>No transition events recorded.</p>
                ) : (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', borderLeft: '2px solid #e5e7eb', marginLeft: '12px', paddingLeft: '16px' }}>
                      {timeline.map((event) => (
                          <div key={event.id} style={{ position: 'relative' }}>
                            <div style={{
                              position: 'absolute',
                              left: '-22px',
                              top: '4px',
                              width: '10px',
                              height: '10px',
                              borderRadius: '50%',
                              background: event.to_status === 'FAILED' ? '#ef4444' : event.to_status === 'CANCELLED' ? '#9ca3af' : event.to_status === 'FULFILLED' ? '#10b981' : '#3b82f6'
                            }} />
                            <div style={{ fontWeight: '600', fontSize: '14px' }}>
                              {event.from_status ? `${event.from_status} ➔ ` : ''}{event.to_status}
                            </div>
                            <div style={{ fontSize: '13px', color: '#4b5563', margin: '2px 0' }}>{event.event_note}</div>
                            <div style={{ fontSize: '11px', color: '#9ca3af' }}>{new Date(event.created_at).toLocaleString()}</div>
                          </div>
                      ))}
                    </div>
                )}
              </div>
            </div>
        )}
      </div>
  );
}