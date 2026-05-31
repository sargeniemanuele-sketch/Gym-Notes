"use strict";

const { DeleteObjectCommand, GetObjectCommand, PutObjectCommand } = require("@aws-sdk/client-s3");
const { Router } = require("express");
const { Readable } = require("stream");
const multer = require("multer");
const GymData = require("../models/GymData");
const Plan = require("../models/Plan");
const authMiddleware = require("../middleware/auth");
const { createRateLimit } = require("../middleware/rateLimit");
const { getR2Config } = require("../config/r2");
const {
  removePdfMetadataBeforeStorageDelete,
  savePdfMetadataAfterUpload,
  shouldCleanupUploadedPdfAfterMongoFailure
} = require("../utils/pdfConsistency");
const { runInMongoTransaction } = require("../utils/mongoTransaction");
const { isUserPdfKey, isValidPdfUpload } = require("../utils/pdfSecurity");

const router = Router();
const uploadRateLimit = createRateLimit({
  limit: 30,
  windowMs: 60 * 60 * 1000,
  message: "Troppi upload PDF. Riprova più tardi."
});
const upload = multer({
  limits: {
    fileSize: 20 * 1024 * 1024
  },
  storage: multer.memoryStorage()
});

router.use(authMiddleware);

function uploadPdf(req, res, next) {
  upload.single("pdf")(req, res, (err) => {
    if (!err) {
      return next();
    }

    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: "Il PDF supera il limite di 20 MB" });
    }

    next(err);
  });
}

async function deleteR2Object(r2, key) {
  if (!key) {
    return;
  }

  try {
    await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
  } catch (err) {
    if (isMissingR2Object(err)) {
      return;
    }

    throw err;
  }
}

async function findPlanForUser(userId, planId) {
  const planDoc = await Plan.findOne({ userId, planId, deletedAt: null });

  if (planDoc) {
    return { source: "plan", plan: planDoc };
  }

  const gymData = await GymData.findOne({ userId });
  const legacyPlan = gymData?.data?.plans?.find((candidate) => candidate.id === planId);

  if (!legacyPlan) {
    return { source: "missing", gymData: null, plan: null };
  }

  return { source: "legacy", gymData, plan: legacyPlan };
}

async function updateLegacyPlanPdf(userId, planId, updatePlan, session = null) {
  let query = GymData.findOne({ userId });

  if (session && typeof query.session === "function") {
    query = query.session(session);
  }

  const gymData = await query;
  const plan = gymData?.data?.plans?.find((candidate) => candidate.id === planId);

  if (!gymData || !plan) {
    return null;
  }

  updatePlan(plan);
  gymData.markModified("data");
  await gymData.save(session ? { session } : undefined);

  return gymData;
}

function isMissingR2Object(err) {
  return err?.name === "NoSuchKey" || err?.$metadata?.httpStatusCode === 404;
}

function pipeR2Body(body, res, next) {
  if (!body) {
    const err = new Error("PDF non trovato nel cloud");
    err.status = 404;
    next(err);
    return;
  }

  try {
    const stream = typeof body.pipe === "function" ? body : Readable.fromWeb(body);
    stream.on("error", next);
    stream.pipe(res);
  } catch (err) {
    next(err);
  }
}

router.post("/plans/:planId", uploadRateLimit, uploadPdf, async (req, res, next) => {
  try {
    const r2 = getR2Config();

    if (!r2) {
      return res.status(503).json({ error: "Storage PDF non configurato" });
    }

    if (!req.file) {
      return res.status(400).json({ error: "PDF mancante" });
    }

    if (!isValidPdfUpload(req.file)) {
      return res.status(400).json({ error: "Il file deve essere un PDF valido" });
    }

    const found = await findPlanForUser(req.user._id, req.params.planId);

    if (!found.plan) {
      return res.status(404).json({ error: "Scheda non trovata" });
    }

    const updatedAt = new Date().toISOString();
    const planId = found.source === "plan" ? found.plan.planId : found.plan.id;
    const key = `${req.user._id}/plans/${planId}/${Date.now()}-${req.file.originalname.replace(/[^a-z0-9_.-]/gi, "_")}`;
    const previousPdfKey = found.plan.cloudPdf?.key;
    const cloudPdf = {
      key,
      name: req.file.originalname,
      size: req.file.size,
      contentType: "application/pdf",
      updatedAt
    };

    let dbUpdatedAt;
    let usedMongoTransaction = false;

    await savePdfMetadataAfterUpload({
      uploadObject: () =>
        r2.client.send(
          new PutObjectCommand({
            Bucket: r2.bucket,
            Key: key,
            Body: req.file.buffer,
            ContentLength: req.file.size,
            ContentType: "application/pdf",
            Metadata: {
              userId: req.user._id.toString(),
              planId
            }
          })
        ),
      cleanupUploadedObject: async () => {
        if (
          !shouldCleanupUploadedPdfAfterMongoFailure({
            usedMongoTransaction,
            mongoPdfKey: found.source === "plan" ? found.plan.cloudPdf?.key : undefined,
            uploadedKey: key
          })
        ) {
          console.warn("Skipping new PDF cleanup because Mongo transaction was unavailable after a partial Plan update");
          return;
        }

        await deleteR2Object(r2, key);
      },
      saveMetadata: () =>
        runInMongoTransaction({ Plan, GymData }, async (session) => {
          usedMongoTransaction = !!session;

          if (found.source === "plan") {
            found.plan.cloudPdf = cloudPdf;
            found.plan.pdfDeletedAt = null;
            found.plan.pendingPdfDeleteKey = undefined;
            found.plan.updatedAt = new Date(updatedAt);
            await found.plan.save(session ? { session } : undefined);
            dbUpdatedAt = found.plan.docUpdatedAt ?? found.plan.updatedAt;

            await updateLegacyPlanPdf(
              req.user._id,
              planId,
              (legacyPlan) => {
                legacyPlan.cloudPdf = cloudPdf;
                delete legacyPlan.pdfDeletedAt;
                legacyPlan.updatedAt = updatedAt;
              },
              session
            );
          } else {
            found.plan.cloudPdf = cloudPdf;
            delete found.plan.pdfDeletedAt;
            found.plan.updatedAt = updatedAt;
            found.gymData.markModified("data");
            await found.gymData.save(session ? { session } : undefined);
            dbUpdatedAt = found.gymData.updatedAt;
          }
        })
    });

    if (previousPdfKey && isUserPdfKey(req.user._id, previousPdfKey)) {
      deleteR2Object(r2, previousPdfKey).catch((err) => {
        console.warn("Previous PDF cleanup failed", err);
      });
    }

    res.json({ cloudPdf, updatedAt: dbUpdatedAt });
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

    const found = await findPlanForUser(req.user._id, req.params.planId);
    const plan = found.plan;

    if (!plan?.cloudPdf?.key) {
      return res.status(404).json({ error: "PDF non trovato" });
    }

    if (!isUserPdfKey(req.user._id, plan.cloudPdf.key)) {
      return res.status(403).json({ error: "PDF non accessibile" });
    }

    let object;

    try {
      object = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: plan.cloudPdf.key }));
    } catch (err) {
      if (isMissingR2Object(err)) {
        return res.status(404).json({ error: "PDF non trovato nel cloud. Ricarica il PDF dalla scheda." });
      }

      throw err;
    }

    res.setHeader("Content-Type", object.ContentType ?? "application/pdf");
    res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(plan.cloudPdf.name ?? "scheda.pdf")}"`);

    pipeR2Body(object.Body, res, next);
  } catch (err) {
    next(err);
  }
});

router.delete("/plans/:planId", async (req, res, next) => {
  try {
    const r2 = getR2Config();

    const found = await findPlanForUser(req.user._id, req.params.planId);
    const plan = found.plan;

    if (!plan) {
      return res.status(404).json({ error: "Scheda non trovata" });
    }

    const deletedAt = new Date().toISOString();
    const deleteKey = plan.cloudPdf?.key;

    if (deleteKey && !isUserPdfKey(req.user._id, deleteKey)) {
      return res.status(403).json({ error: "PDF non accessibile" });
    }

    const deleteResult = await removePdfMetadataBeforeStorageDelete({
      deleteObject: (key) => {
        if (!r2) {
          throw new Error("Storage PDF non configurato per cleanup");
        }

        return deleteR2Object(r2, key);
      },
      removeMetadata: async () => {
        let dbUpdatedAt;

        await runInMongoTransaction({ Plan, GymData }, async (session) => {
          if (found.source === "plan") {
            plan.cloudPdf = undefined;
            plan.pdfDeletedAt = new Date(deletedAt);
            plan.pendingPdfDeleteKey = deleteKey || undefined;
            plan.updatedAt = new Date(deletedAt);
            await plan.save(session ? { session } : undefined);
            dbUpdatedAt = plan.docUpdatedAt ?? plan.updatedAt;

            await updateLegacyPlanPdf(
              req.user._id,
              plan.planId,
              (legacyPlan) => {
                delete legacyPlan.cloudPdf;
                legacyPlan.pdfDeletedAt = deletedAt;
                legacyPlan.updatedAt = deletedAt;
              },
              session
            );
          } else {
            delete plan.cloudPdf;
            plan.pdfDeletedAt = deletedAt;
            plan.updatedAt = deletedAt;
            found.gymData.markModified("data");
            await found.gymData.save(session ? { session } : undefined);
            dbUpdatedAt = found.gymData.updatedAt;
          }
        });

        return { deleteKey, updatedAt: dbUpdatedAt };
      },
      markPendingDelete: async (pendingKey) => {
        if (found.source !== "plan") {
          return;
        }

        plan.pendingPdfDeleteKey = pendingKey || undefined;
        await plan.save();
      }
    });

    res.json({ ok: true, updatedAt: deleteResult.updatedAt });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
