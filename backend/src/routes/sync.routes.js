"use strict";

const { Router } = require("express");
const GymData = require("../models/GymData");
const GymState = require("../models/GymState");
const Plan = require("../models/Plan");
const Session = require("../models/Session");
const authMiddleware = require("../middleware/auth");
const { createRateLimit } = require("../middleware/rateLimit");
const sanitizeGymData = require("../utils/sanitizeGymData");
const { composeGymData, saveDecomposedGymData } = require("../utils/gymDataMigration");

const router = Router();
const syncRateLimit = createRateLimit({
  limit: 240,
  windowMs: 15 * 60 * 1000,
  message: "Troppe sincronizzazioni. Riprova tra poco."
});

router.use(authMiddleware);
router.use(syncRateLimit);

router.get("/data", async (req, res, next) => {
  try {
    const composed = await composeGymData(req.user._id, { GymState, Plan, Session });

    if (composed.data) {
      return res.json({ data: composed.data, updatedAt: composed.updatedAt });
    }

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
    const { baseUpdatedAt, data } = req.body ?? {};

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "data deve essere un oggetto" });
    }

    const currentComposed = await composeGymData(req.user._id, { GymState, Plan, Session });
    const currentGymData = await GymData.findOne({ userId: req.user._id });
    const currentData = currentComposed.data ?? currentGymData?.data ?? null;
    const currentUpdatedAt = currentComposed.updatedAt ?? currentGymData?.updatedAt ?? null;
    const sanitized = sanitizeGymData(data, {
      existingData: currentData,
      userId: req.user._id
    });

    if (currentUpdatedAt) {
      const currentUpdatedAtIso = currentUpdatedAt.toISOString();

      if (!baseUpdatedAt || baseUpdatedAt !== currentUpdatedAtIso) {
        return res.status(409).json({
          error: "I dati cloud sono cambiati su un altro dispositivo. Ricarico e unisco le modifiche.",
          data: currentData,
          updatedAt: currentUpdatedAt
        });
      }
    }

    const gymState = await saveDecomposedGymData(req.user._id, sanitized, {
      GymData,
      GymState,
      Plan,
      Session
    });
    const composed = await composeGymData(req.user._id, { GymState, Plan, Session });

    res.json({ data: composed.data, updatedAt: gymState.updatedAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
