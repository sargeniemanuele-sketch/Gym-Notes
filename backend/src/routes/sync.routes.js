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
    const { baseUpdatedAt, data } = req.body ?? {};

    if (!data || typeof data !== "object" || Array.isArray(data)) {
      return res.status(400).json({ error: "data deve essere un oggetto" });
    }

    const sanitized = sanitizeGymData(data);
    const currentGymData = await GymData.findOne({ userId: req.user._id });

    if (currentGymData) {
      const currentUpdatedAt = currentGymData.updatedAt.toISOString();

      if (!baseUpdatedAt || baseUpdatedAt !== currentUpdatedAt) {
        return res.status(409).json({
          error: "I dati cloud sono cambiati su un altro dispositivo. Ricarico e unisco le modifiche.",
          data: currentGymData.data,
          updatedAt: currentGymData.updatedAt
        });
      }
    }

    const query = currentGymData
      ? { userId: req.user._id, updatedAt: currentGymData.updatedAt }
      : { userId: req.user._id };

    const gymData = await GymData.findOneAndUpdate(
      query,
      { data: sanitized },
      { upsert: !currentGymData, new: true, setDefaultsOnInsert: true }
    );

    if (!gymData) {
      const latestGymData = await GymData.findOne({ userId: req.user._id });

      return res.status(409).json({
        error: "I dati cloud sono cambiati su un altro dispositivo. Ricarico e unisco le modifiche.",
        data: latestGymData?.data ?? null,
        updatedAt: latestGymData?.updatedAt ?? null
      });
    }

    res.json({ data: gymData.data, updatedAt: gymData.updatedAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
