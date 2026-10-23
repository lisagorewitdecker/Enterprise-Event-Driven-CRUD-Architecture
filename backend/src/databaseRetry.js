const transientDatabaseErrorCodes = new Set([
  "ECONNREFUSED",
  "ECONNRESET",
  "ER_CON_COUNT_ERROR",
  "ER_LOCK_DEADLOCK",
  "ER_LOCK_WAIT_TIMEOUT",
  "ER_SERVER_SHUTDOWN",
  "ETIMEDOUT",
  "EPIPE",
  "PROTOCOL_CONNECTION_LOST",
  "PROTOCOL_ENQUEUE_AFTER_FATAL_ERROR",
]);

const sleep = (milliseconds) => new Promise((resolve) => setTimeout(resolve, milliseconds));

async function retryTransientDatabaseError(operation, wait = sleep) {
  let delay = 250;

  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (!transientDatabaseErrorCodes.has(error.code)) throw error;

      console.warn(`Transient MySQL error (${error.code}); retrying in ${delay}ms`);
      await wait(delay);
      delay = Math.min(delay * 2, 5000);
    }
  }
}

module.exports = { retryTransientDatabaseError };
