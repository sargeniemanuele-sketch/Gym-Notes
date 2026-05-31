"use strict";

function createRateLimit({ limit, windowMs, message }) {
  const hits = new Map();

  return function rateLimit(req, res, next) {
    const key = `${req.ip}:${req.originalUrl}`;
    const now = Date.now();
    const current = hits.get(key);

    if (!current || current.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      return next();
    }

    current.count += 1;

    if (current.count > limit) {
      return res.status(429).json({ error: message ?? "Troppe richieste. Riprova tra poco." });
    }

    next();
  };
}

module.exports = { createRateLimit };
