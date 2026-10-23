const TRANSITIONS = {
  "order.submitted": { from: null, to: "PENDING", next: "order.confirmed" },
  "order.confirmed": { from: "PENDING", to: "CONFIRMED", next: "order.processing" },
  "order.processing": { from: "CONFIRMED", to: "PROCESSING", next: "order.shipped" },
  "order.shipped": { from: "PROCESSING", to: "SHIPPED", next: "order.delivered" },
  "order.delivered": { from: "SHIPPED", to: "DELIVERED", next: null },
};

function transitionOrder(currentStatus, eventType) {
  const transition = TRANSITIONS[eventType];

  if (!transition || transition.from !== currentStatus) {
    throw new Error(`Invalid order transition: ${currentStatus ?? "NEW"} -> ${eventType}`);
  }

  return { status: transition.to, nextEventType: transition.next };
}

module.exports = { transitionOrder };
