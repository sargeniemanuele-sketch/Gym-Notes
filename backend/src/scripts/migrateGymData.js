"use strict";

const mongoose = require("mongoose");
const { connectDB } = require("../config/db");
const GymData = require("../models/GymData");
const GymState = require("../models/GymState");
const Plan = require("../models/Plan");
const Session = require("../models/Session");
const {
  composeGymData,
  composeGymDataFromDocuments,
  decomposeGymData,
  normalizeForComparison,
  saveDecomposedGymData
} = require("../utils/gymDataMigration");

const shouldWrite = process.argv.includes("--write");

async function run() {
  await connectDB();

  const legacyDocuments = await GymData.find({}).lean();
  const report = {
    mode: shouldWrite ? "write" : "dry-run",
    users: legacyDocuments.length,
    plans: 0,
    sessions: 0,
    written: 0,
    differences: []
  };

  for (const legacyDocument of legacyDocuments) {
    const decomposed = decomposeGymData(legacyDocument.userId, legacyDocument.data);
    report.plans += decomposed.plans.length;
    report.sessions += decomposed.sessions.length;

    const recomposed = composeGymDataFromDocuments(
      {
        ...decomposed.gymState,
        updatedAt: legacyDocument.updatedAt
      },
      decomposed.plans,
      decomposed.sessions
    );

    try {
      assertEquivalent(legacyDocument.data, recomposed);
    } catch (err) {
      report.differences.push({
        userId: legacyDocument.userId.toString(),
        reason: err.message
      });
    }

    if (shouldWrite) {
      await saveDecomposedGymData(legacyDocument.userId, legacyDocument.data, {
        GymData,
        GymState,
        Plan,
        Session
      });

      const composed = await composeGymData(legacyDocument.userId, { GymState, Plan, Session });
      assertEquivalent(legacyDocument.data, composed.data);
      report.written += 1;
    }
  }

  console.log(JSON.stringify(report, null, 2));
}

function assertEquivalent(original, recomposed) {
  const normalizedOriginal = normalizeForComparison(original);
  const normalizedRecomposed = normalizeForComparison(recomposed);

  if (JSON.stringify(normalizedOriginal) !== JSON.stringify(normalizedRecomposed)) {
    throw new Error("compose(decompose(data)) differs from normalized legacy data");
  }
}

run()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
