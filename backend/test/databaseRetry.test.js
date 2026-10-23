const assert = require("node:assert/strict");
const test = require("node:test");
const { retryTransientDatabaseError } = require("../src/databaseRetry");

test("transient database errors are retried with capped backoff", async () => {
  const delays = [];
  let attempts = 0;
  const result = await retryTransientDatabaseError(async () => {
    attempts += 1;
    if (attempts < 9) {
      const error = new Error("Database unavailable");
      error.code = "ECONNRESET";
      throw error;
    }
    return "processed";
  }, async (delay) => delays.push(delay));

  assert.equal(result, "processed");
  assert.equal(attempts, 9);
  assert.deepEqual(delays, [250, 500, 1000, 2000, 4000, 5000, 5000, 5000]);
});

test("non-transient database errors are not retried", async () => {
  const error = new Error("Invalid SQL");
  error.code = "ER_PARSE_ERROR";
  let attempts = 0;

  await assert.rejects(
    retryTransientDatabaseError(async () => {
      attempts += 1;
      throw error;
    }, async () => {
      assert.fail("wait should not be called");
    }),
    error,
  );
  assert.equal(attempts, 1);
});
