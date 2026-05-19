"use strict";

const jwt = require("jsonwebtoken");
const User = require("../models/User");
const { jwtSecret } = require("../config/env");

async function authMiddleware(req, res, next) {
  const header = req.headers.authorization;

  if (!header || !header.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Token mancante" });
  }

  const token = header.slice(7);

  try {
    const payload = jwt.verify(token, jwtSecret);
    const user = await User.findById(payload.sub).select("-passwordHash");

    if (!user) {
      return res.status(401).json({ error: "Utente non trovato" });
    }

    req.user = user;
    next();
  } catch {
    return res.status(401).json({ error: "Token non valido" });
  }
}

module.exports = authMiddleware;
