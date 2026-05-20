"use strict";

const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Router } = require("express");
const multer = require("multer");
const GymData = require("../models/GymData");
const authMiddleware = require("../middleware/auth");
const { getR2Config } = require("../config/r2");

const router = Router();
const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  storage: multer.memoryStorage()
});

router.use(authMiddleware);

async function deleteR2Object(r2, key) {
  if (!key) {
    return;
  }

  await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
}

function isUserPdfKey(userId, key) {
  return typeof key === "string" && key.startsWith(`${userId}/plans/`);
}

router.post("/plans/:planId", upload.single("pdf"), async (req, res, next) => {
  try {
    const r2 = getR2Config();

    if (!r2) {
      return res.status(503).json({ error: "Storage PDF non configurato" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "PDF mancante" });
    }

    if (req.file.mimetype !== "application/pdf" && !req.file.originalname.toLowerCase().endsWith(".pdf")) {
      return res.status(400).json({ error: "Il file deve essere un PDF" });
    }

    const gymData = await GymData.findOne({ userId: req.user._id });
    const plans = gymData?.data?.plans;

    if (!gymData || !Array.isArray(plans)) {
      return res.status(404).json({ error: "Dati scheda non trovati" });
    }

    const plan = plans.find((candidate) => candidate.id === req.params.planId);

    if (!plan) {
      return res.status(404).json({ error: "Scheda non trovata" });
    }

    const updatedAt = new Date().toISOString();
    const key = `${req.user._id}/plans/${plan.id}/${Date.now()}-${req.file.originalname.replace(/[^a-z0-9_.-]/gi, "_")}`;
    const previousPdfKey = plan.cloudPdf?.key;

    await r2.client.send(
      new PutObjectCommand({
        Bucket: r2.bucket,
        Key: key,
        Body: req.file.buffer,
        ContentLength: req.file.size,
        ContentType: "application/pdf",
        Metadata: {
          userId: req.user._id.toString(),
          planId: plan.id
        }
      })
    );

    if (previousPdfKey) {
      try {
        await deleteR2Object(r2, previousPdfKey);
      } catch (err) {
        await deleteR2Object(r2, key).catch(() => {});
        return next(err);
      }
    }

    plan.cloudPdf = {
      key,
      name: req.file.originalname,
      size: req.file.size,
      contentType: "application/pdf",
      updatedAt
    };
    plan.updatedAt = updatedAt;
    gymData.markModified("data");
    await gymData.save();

    res.json({ cloudPdf: plan.cloudPdf, updatedAt: gymData.updatedAt });
  } catch (err) {
    next(err);
  }
});

router.get("/plans/:planId", async (req, res, next) => {
  try {
    const r2 = getR2Config();

    if (!r2) {
      return res.status(503).json({ error: "Storage PDF non configurato" });
    }

    const gymData = await GymData.findOne({ userId: req.user._id });
    const plan = gymData?.data?.plans?.find((candidate) => candidate.id === req.params.planId);

    if (!plan?.cloudPdf?.key) {
      return res.status(404).json({ error: "PDF non trovato" });
    }

    const object = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: plan.cloudPdf.key }));

    res.setHeader("Content-Type", object.ContentType ?? "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(plan.cloudPdf.name ?? "scheda.pdf")}"`);

    object.Body.pipe(res);
  } catch (err) {
    next(err);
  }
});

router.delete("/plans/:planId", async (req, res, next) => {
  try {
    const r2 = getR2Config();

    if (!r2) {
      return res.status(503).json({ error: "Storage PDF non configurato" });
    }

    const fallbackKey = req.body?.cloudPdfKey;
    const gymData = await GymData.findOne({ userId: req.user._id });
    const plan = gymData?.data?.plans?.find((candidate) => candidate.id === req.params.planId);

    if (!gymData || !plan) {
      if (isUserPdfKey(req.user._id, fallbackKey)) {
        await deleteR2Object(r2, fallbackKey);
        return res.json({ ok: true, updatedAt: gymData?.updatedAt ?? null });
      }

      return res.status(404).json({ error: "Scheda non trovata" });
    }

    const deleteKey = plan.cloudPdf?.key ?? (isUserPdfKey(req.user._id, fallbackKey) ? fallbackKey : null);

    if (!deleteKey) {
      delete plan.cloudPdf;
      plan.updatedAt = new Date().toISOString();
      gymData.markModified("data");
      await gymData.save();

      return res.json({ ok: true, updatedAt: gymData.updatedAt });
    }

    await deleteR2Object(r2, deleteKey);

    delete plan.cloudPdf;
    plan.updatedAt = new Date().toISOString();
    gymData.markModified("data");
    await gymData.save();

    res.json({ ok: true, updatedAt: gymData.updatedAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
