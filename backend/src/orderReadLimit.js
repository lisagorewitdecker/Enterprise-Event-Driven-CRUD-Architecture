const { rateLimit } = require("express-rate-limit");

function createOrderReadLimit(options = {}) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: 120,
    standardHeaders: "draft-8",
    legacyHeaders: false,
    message: { error: "Too many order read requests; try again later" },
    ...options,
  });
}

module.exports = { createOrderReadLimit };
