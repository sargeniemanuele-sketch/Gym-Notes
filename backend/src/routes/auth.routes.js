"use strict";

const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { createRateLimit } = require("../middleware/rateLimit");
const { jwtSecret, jwtExpiresIn } = require("../config/env");
const { validateEmailPasswordBody } = require("../utils/authValidation");

const router = Router();
const authRateLimit = createRateLimit({
  limit: 20,
  windowMs: 15 * 60 * 1000,
  message: "Troppi tentativi. Riprova tra qualche minuto."
});

function generateToken(userId) {
  return jwt.sign({ sub: userId.toString() }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function safeUser(user) {
  return { id: user._id, email: user.email };
}

router.post("/register", authRateLimit, async (req, res, next) => {
  try {
    const validated = validateEmailPasswordBody(req.body);

    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    if (validated.password.length < 8) {
      return res.status(400).json({ error: "La password deve avere almeno 8 caratteri" });
    }

    const existing = await User.findOne({ email: validated.email });
    if (existing) {
      return res.status(409).json({ error: "Email già registrata" });
    }

    const passwordHash = await bcrypt.hash(validated.password, 12);
    const user = await User.create({ email: validated.email, passwordHash });
    const token = generateToken(user._id);

    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ error: "Email già registrata" });
    }

    next(err);
  }
});

router.post("/login", authRateLimit, async (req, res, next) => {
  try {
    const validated = validateEmailPasswordBody(req.body);

    if (validated.error) {
      return res.status(400).json({ error: validated.error });
    }

    const user = await User.findOne({ email: validated.email });

    if (!user) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    const match = await bcrypt.compare(validated.password, user.passwordHash);
    if (!match) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    const token = generateToken(user._id);
    res.json({ token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.get("/me", authMiddleware, (req, res) => {
  res.json({ user: safeUser(req.user) });
});

module.exports = router;
