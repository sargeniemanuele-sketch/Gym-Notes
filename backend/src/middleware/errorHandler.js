"use strict";

// eslint-disable-next-line no-unused-vars
function errorHandler(err, req, res, next) {
  console.error(err.stack ?? err.message);

  const status = err.status ?? err.statusCode ?? 500;
  const message = status < 500 ? err.message : "Errore interno del server";

  res.status(status).json({ error: message });
}

module.exports = errorHandler;
