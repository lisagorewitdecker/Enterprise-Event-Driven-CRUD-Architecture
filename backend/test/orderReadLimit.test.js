const assert = require("node:assert/strict");
const express = require("express");
const test = require("node:test");
const { createOrderReadLimit } = require("../src/orderReadLimit");

test("order read limiter rejects requests after the configured limit", async () => {
  const app = express();
  app.get("/orders", createOrderReadLimit({ limit: 2 }), (_request, response) => {
    response.sendStatus(200);
  });
  const server = app.listen(0);

  try {
    await new Promise((resolve) => server.once("listening", resolve));
    const url = `http://127.0.0.1:${server.address().port}/orders`;
    const responses = [];
    for (let index = 0; index < 3; index += 1) {
      responses.push(await fetch(url));
    }

    assert.deepEqual(responses.map((response) => response.status), [200, 200, 429]);
    assert.ok(responses[2].headers.has("ratelimit"));
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
});
