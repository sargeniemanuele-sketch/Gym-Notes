"use strict";

const { runInMongoTransaction } = require("./mongoTransaction");

function decomposeGymData(userId, data) {
  const normalized = normalizeGymData(data);
  const deletedPlanIds = normalizeDeletedIds(normalized.deletedPlanIds);
  const deletedPlanTimes = new Map(deletedPlanIds.map((item) => [item.id, item.deletedAt]));
  const plans = [];
  const sessions = [];

  normalized.plans.forEach((plan, index) => {
    if (!plan?.id) {
      return;
    }

    const { sessions: planSessions, ...planFields } = plan;

    plans.push({
      userId,
      planId: plan.id,
      name: plan.name,
      sortIndex: index,
      createdAt: toDate(plan.createdAt) ?? new Date(),
      updatedAt: toDate(plan.updatedAt) ?? toDate(plan.createdAt) ?? new Date(),
      deletedAt: toDate(deletedPlanTimes.get(plan.id)),
      deletedWorkoutIds: normalizeDeletedIds(plan.deletedWorkoutIds),
      pdfDeletedAt: toDate(plan.pdfDeletedAt),
      cloudPdf: plan.cloudPdf,
      workouts: Array.isArray(planFields.workouts) ? planFields.workouts : []
    });

    if (Array.isArray(planSessions)) {
      planSessions.forEach((session) => {
        if (!session?.id) {
          return;
        }

        sessions.push({
          userId,
          sessionId: session.id,
          activeSessionId: typeof session.activeSessionId === "string" ? session.activeSessionId : null,
          planId: typeof session.planId === "string" ? session.planId : plan.id,
          workoutId: typeof session.workoutId === "string" ? session.workoutId : "",
          workoutName: typeof session.workoutName === "string" ? session.workoutName : "",
          startedAt: toDate(session.startedAt) ?? new Date(),
          completedAt: toDate(session.completedAt) ?? new Date(),
          durationSeconds: numberOrZero(session.durationSeconds),
          exercises: Array.isArray(session.exercises) ? session.exercises : []
        });
      });
    }
  });

  return {
    gymState: {
      userId,
      activePlanId: typeof normalized.activePlanId === "string" ? normalized.activePlanId : null,
      activeSession: normalized.activeSession ?? null,
      activeSessionUpdatedAt: toDate(normalized.activeSessionUpdatedAt),
      completedActiveSessionIds: normalizeDeletedIds(normalized.completedActiveSessionIds),
      deletedPlanIds,
      resetAt: toDate(normalized.resetAt),
      schemaVersion: 2
    },
    plans,
    sessions
  };
}

async function composeGymData(userId, models) {
  const { GymState, Plan, Session } = models;
  const [gymState, plans, sessions] = await Promise.all([
    GymState.findOne({ userId }).lean(),
    Plan.find({ userId, deletedAt: null }).lean(),
    Session.find({ userId }).lean()
  ]);

  if (!gymState) {
    return { data: null, updatedAt: null };
  }

  return {
    data: composeGymDataFromDocuments(gymState, plans, sessions),
    updatedAt: gymState.updatedAt
  };
}

function composeGymDataFromDocuments(gymState, plans, sessions) {
  if (!gymState) {
    return null;
  }

  const sessionsByPlanId = new Map();
  sessions.forEach((session) => {
    const planSessions = sessionsByPlanId.get(session.planId) ?? [];
    planSessions.push(composeSession(session));
    sessionsByPlanId.set(session.planId, planSessions);
  });

  const composedPlans = plans
    .map((plan) => ({
      id: plan.planId,
      name: plan.name,
      sortIndex: typeof plan.sortIndex === "number" ? plan.sortIndex : 0,
      createdAt: toIso(plan.createdAt),
      updatedAt: toIso(plan.updatedAt),
      pdfDeletedAt: toIso(plan.pdfDeletedAt),
      cloudPdf: plan.cloudPdf,
      deletedWorkoutIds: normalizeDeletedIds(plan.deletedWorkoutIds),
      workouts: Array.isArray(plan.workouts) ? plan.workouts : [],
      sessions: (sessionsByPlanId.get(plan.planId) ?? []).sort(compareCompletedAt)
    }))
    .sort(compareSortIndex)
    .map(({ sortIndex, ...plan }) => plan);

  return normalizeGymData({
    activePlanId: gymState.activePlanId,
    activeSession: gymState.activeSession,
    activeSessionUpdatedAt: toIso(gymState.activeSessionUpdatedAt),
    completedActiveSessionIds: normalizeDeletedIds(gymState.completedActiveSessionIds),
    deletedPlanIds: normalizeDeletedIds(gymState.deletedPlanIds),
    resetAt: toIso(gymState.resetAt),
    plans: composedPlans
  });
}

function composeSession(session) {
  return {
    id: session.sessionId,
    activeSessionId: session.activeSessionId ?? undefined,
    planId: session.planId,
    workoutId: session.workoutId,
    workoutName: session.workoutName,
    startedAt: toIso(session.startedAt),
    completedAt: toIso(session.completedAt),
    durationSeconds: numberOrZero(session.durationSeconds),
    exercises: Array.isArray(session.exercises) ? session.exercises : []
  };
}

async function saveDecomposedGymData(userId, data, models) {
  return runInMongoTransaction(models, (session) => saveDecomposedGymDataWrites(userId, data, models, session));
}

async function saveDecomposedGymDataWrites(userId, data, models, session = null) {
  const { GymData, GymState, Plan, Session } = models;
  const decomposed = decomposeGymData(userId, data);
  const writeOptions = getWriteOptions(session);
  const sessionIds = decomposed.sessions.map((sessionDoc) => sessionDoc.sessionId);

  for (const plan of decomposed.plans) {
    await Plan.updateOne(
      { userId, planId: plan.planId },
      { $set: plan },
      { upsert: true, ...writeOptions }
    );
  }

  for (const sessionDoc of decomposed.sessions) {
    await Session.updateOne(
      { userId, sessionId: sessionDoc.sessionId },
      { $set: sessionDoc },
      { upsert: true, ...writeOptions }
    );
  }

  await Session.deleteMany(
    {
      userId,
      sessionId: { $nin: sessionIds }
    },
    writeOptions
  );

  for (const item of decomposed.gymState.deletedPlanIds) {
    await Plan.updateOne(
      { userId, planId: item.id },
      { $set: { deletedAt: toDate(item.deletedAt) } },
      writeOptions
    );
  }

  const gymState = await GymState.findOneAndUpdate(
    { userId },
    { $set: decomposed.gymState },
    { upsert: true, new: true, setDefaultsOnInsert: true, ...writeOptions }
  );

  if (GymData) {
    await GymData.findOneAndUpdate(
      { userId },
      { data, schemaVersion: 2 },
      { upsert: true, new: true, setDefaultsOnInsert: true, ...writeOptions }
    );
  }

  return gymState;
}

function getWriteOptions(session) {
  return session ? { session } : {};
}

function normalizeGymData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return emptyGymData();
  }

  const plans = Array.isArray(data.plans) ? data.plans.filter(isObject).map(normalizePlan) : [];
  const activeSession = normalizeActiveSession(data.activeSession);

  return {
    activePlanId: typeof data.activePlanId === "string" ? data.activePlanId : plans[0]?.id ?? null,
    activeSession,
    activeSessionUpdatedAt:
      typeof data.activeSessionUpdatedAt === "string"
        ? data.activeSessionUpdatedAt
        : activeSession?.updatedAt ?? activeSession?.startedAt,
    completedActiveSessionIds: normalizeDeletedIds(data.completedActiveSessionIds),
    deletedPlanIds: normalizeDeletedIds(data.deletedPlanIds),
    resetAt: typeof data.resetAt === "string" ? data.resetAt : undefined,
    plans
  };
}

function normalizePlan(plan) {
  const createdAt = typeof plan.createdAt === "string" ? plan.createdAt : new Date().toISOString();

  return {
    id: typeof plan.id === "string" ? plan.id : "",
    name: typeof plan.name === "string" ? plan.name : "Scheda",
    createdAt,
    updatedAt: typeof plan.updatedAt === "string" ? plan.updatedAt : createdAt,
    pdfDeletedAt: typeof plan.pdfDeletedAt === "string" ? plan.pdfDeletedAt : undefined,
    cloudPdf: normalizeCloudPdf(plan.cloudPdf),
    deletedWorkoutIds: normalizeDeletedIds(plan.deletedWorkoutIds),
    workouts: Array.isArray(plan.workouts) ? plan.workouts : [],
    sessions: Array.isArray(plan.sessions) ? plan.sessions.filter(isObject).map(normalizeSession) : []
  };
}

function normalizeSession(session) {
  return {
    id: typeof session.id === "string" ? session.id : "",
    activeSessionId: typeof session.activeSessionId === "string" ? session.activeSessionId : undefined,
    planId: typeof session.planId === "string" ? session.planId : "",
    workoutId: typeof session.workoutId === "string" ? session.workoutId : "",
    workoutName: typeof session.workoutName === "string" ? session.workoutName : "",
    startedAt: typeof session.startedAt === "string" ? session.startedAt : new Date().toISOString(),
    completedAt: typeof session.completedAt === "string" ? session.completedAt : new Date().toISOString(),
    durationSeconds: numberOrZero(session.durationSeconds),
    exercises: Array.isArray(session.exercises) ? session.exercises : []
  };
}

function normalizeActiveSession(session) {
  if (!session || typeof session !== "object") {
    return null;
  }

  return {
    id: typeof session.id === "string" ? session.id : "",
    planId: typeof session.planId === "string" ? session.planId : "",
    workoutId: typeof session.workoutId === "string" ? session.workoutId : "",
    startedAt: typeof session.startedAt === "string" ? session.startedAt : new Date().toISOString(),
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : session.startedAt,
    completedSetsByExercise:
      session.completedSetsByExercise && typeof session.completedSetsByExercise === "object"
        ? session.completedSetsByExercise
        : {}
  };
}

function normalizeCloudPdf(cloudPdf) {
  if (!cloudPdf || typeof cloudPdf !== "object" || typeof cloudPdf.key !== "string") {
    return undefined;
  }

  return {
    key: cloudPdf.key,
    name: typeof cloudPdf.name === "string" ? cloudPdf.name : "scheda.pdf",
    size: typeof cloudPdf.size === "number" ? cloudPdf.size : undefined,
    contentType: typeof cloudPdf.contentType === "string" ? cloudPdf.contentType : "application/pdf",
    updatedAt: typeof cloudPdf.updatedAt === "string" ? cloudPdf.updatedAt : undefined
  };
}

function emptyGymData() {
  return {
    activePlanId: null,
    activeSession: null,
    activeSessionUpdatedAt: undefined,
    completedActiveSessionIds: [],
    deletedPlanIds: [],
    resetAt: undefined,
    plans: []
  };
}

function normalizeDeletedIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .filter((item) => typeof item.id === "string" && typeof item.deletedAt === "string")
    .map((item) => ({ id: item.id, deletedAt: item.deletedAt }));
}

function normalizeForComparison(data) {
  return normalizeGymData(data);
}

function isObject(value) {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function numberOrZero(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : 0;
}

function toDate(value) {
  if (!value) {
    return null;
  }

  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function toIso(value) {
  const date = toDate(value);
  return date ? date.toISOString() : undefined;
}

function compareSortIndex(first, second) {
  return first.sortIndex - second.sortIndex;
}

function compareCompletedAt(first, second) {
  return Date.parse(first.completedAt) - Date.parse(second.completedAt);
}

module.exports = {
  composeGymDataFromDocuments,
  composeGymData,
  decomposeGymData,
  normalizeForComparison,
  saveDecomposedGymData,
  saveDecomposedGymDataWrites
};
