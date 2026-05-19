"use strict";

const { Router } = require("express");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const User = require("../models/User");
const authMiddleware = require("../middleware/auth");
const { jwtSecret, jwtExpiresIn } = require("../config/env");

const router = Router();

function generateToken(userId) {
  return jwt.sign({ sub: userId.toString() }, jwtSecret, {
    expiresIn: jwtExpiresIn,
  });
}

function safeUser(user) {
  return { id: user._id, email: user.email };
}

router.post("/register", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || typeof email !== "string") {
      return res.status(400).json({ error: "Email obbligatoria" });
    }

    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password obbligatoria" });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: "La password deve avere almeno 8 caratteri" });
    }

    const normalizedEmail = email.toLowerCase().trim();

    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      return res.status(409).json({ error: "Email già registrata" });
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({ email: normalizedEmail, passwordHash });
    const token = generateToken(user._id);

    res.status(201).json({ token, user: safeUser(user) });
  } catch (err) {
    next(err);
  }
});

router.post("/login", async (req, res, next) => {
  try {
    const { email, password } = req.body ?? {};

    if (!email || !password) {
      return res.status(400).json({ error: "Email e password obbligatorie" });
    }

    const normalizedEmail = email.toLowerCase().trim();
    const user = await User.findOne({ email: normalizedEmail });

    if (!user) {
      return res.status(401).json({ error: "Credenziali non valide" });
    }

    const match = await bcrypt.compare(password, user.passwordHash);
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
