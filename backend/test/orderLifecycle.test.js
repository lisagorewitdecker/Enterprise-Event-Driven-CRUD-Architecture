const test = require("node:test");
const assert = require("node:assert/strict");
const { transitionOrder } = require("../src/domain/orderLifecycle");

test("order lifecycle advances through the defined states", () => {
  const events = [
    ["order.submitted", null, "PENDING"],
    ["order.confirmed", "PENDING", "CONFIRMED"],
    ["order.processing", "CONFIRMED", "PROCESSING"],
    ["order.shipped", "PROCESSING", "SHIPPED"],
    ["order.delivered", "SHIPPED", "DELIVERED"],
  ];

  for (const [eventType, currentStatus, status] of events) {
    assert.equal(transitionOrder(currentStatus, eventType).status, status);
  }
});

test("completed orders and out-of-order events cannot transition", () => {
  assert.throws(() => transitionOrder("DELIVERED", "order.processing"), /Invalid order transition/);
  assert.throws(() => transitionOrder("PENDING", "order.shipped"), /Invalid order transition/);
  assert.throws(() => transitionOrder(null, "order.delivered"), /Invalid order transition/);
});

test("each nonterminal state has one deterministic next event", () => {
  assert.equal(transitionOrder(null, "order.submitted").nextEventType, "order.confirmed");
  assert.equal(transitionOrder("SHIPPED", "order.delivered").nextEventType, null);
});
