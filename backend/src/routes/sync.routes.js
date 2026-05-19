"use strict";

const { Router } = require("express");
const GymData = require("../models/GymData");
const authMiddleware = require("../middleware/auth");
const sanitizeGymData = require("../utils/sanitizeGymData");

const router = Router();

router.use(authMiddleware);

router.get("/data", async (req, res, next) => {
  try {
    const gymData = await GymData.findOne({ userId: req.user._id });

    if (!gymData) {
      return res.json({ data: null, updatedAt: null });
    }

    res.json({ data: gymData.data, updatedAt: gymData.updatedAt });
  } catch (err) {
    next(err);
  }
});

router.put("/data", async (req, res, next) => {
  try {
    const { data } = req.body ?? {};

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "data deve essere un oggetto" });
    }

    const sanitized = sanitizeGymData(data);

    const gymData = await GymData.findOneAndUpdate(
      { userId: req.user._id },
      { data: sanitized },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );

    res.json({ data: gymData.data, updatedAt: gymData.updatedAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
