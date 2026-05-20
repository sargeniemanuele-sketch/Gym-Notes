export function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;
}

const DATA_CACHE_PREFIX = "gym-notes-data-cache-v1:";
const ACTIVE_SESSION_PREFIX = "gym-notes-active-session-v1:";

function getUserKey(user) {
  const userId = typeof user?.id === "string" ? user.id : user?.email;

  if (!userId) {
    return null;
  }

  return userId;
}

function getUserCacheKey(user) {
  const userKey = getUserKey(user);
  return userKey ? `${DATA_CACHE_PREFIX}${userKey}` : null;
}

function getActiveSessionKey(user) {
  const userKey = getUserKey(user);
  return userKey ? `${ACTIVE_SESSION_PREFIX}${userKey}` : null;
}

export function loadGymDataCache(user) {
  try {
    const key = getUserCacheKey(user);

    if (!key) {
      return null;
    }

    const raw = localStorage.getItem(key);

    if (!raw) {
      return null;
    }

    const parsed = JSON.parse(raw);

    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    return {
      data: normalizeGymData(parsed.data),
      hasPendingChanges: parsed.hasPendingChanges === true,
      remoteUpdatedAt: typeof parsed.remoteUpdatedAt === "string" ? parsed.remoteUpdatedAt : null,
      savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : null
    };
  } catch {
    return null;
  }
}

export function loadActiveSessionCache(user) {
  try {
    const key = getActiveSessionKey(user);

    if (!key) {
      return null;
    }

    return normalizeActiveSession(JSON.parse(localStorage.getItem(key)));
  } catch {
    return null;
  }
}

export function saveActiveSessionCache(user, session) {
  try {
    const key = getActiveSessionKey(user);
    const normalizedSession = normalizeActiveSession(session);

    if (!key || !normalizedSession) {
      return;
    }

    localStorage.setItem(key, JSON.stringify(normalizedSession));
  } catch {
    // Active session recovery is best-effort; completed sessions still persist through gym data.
  }
}

export function clearActiveSessionCache(user) {
  try {
    const key = getActiveSessionKey(user);

    if (key) {
      localStorage.removeItem(key);
    }
  } catch {
    // Nothing to do if browser storage is unavailable.
  }
}

export function saveGymDataCache(user, data, { hasPendingChanges = false, remoteUpdatedAt = null } = {}) {
  try {
    const key = getUserCacheKey(user);

    if (!key) {
      return;
    }

    localStorage.setItem(
      key,
      JSON.stringify({
        data: normalizeGymData(data),
        hasPendingChanges,
        remoteUpdatedAt,
        savedAt: new Date().toISOString()
      })
    );
  } catch {
    // If local storage is full or blocked, cloud sync still remains the source of truth.
  }
}

export function normalizeGymData(data) {
  if (!data || typeof data !== "object") {
    return emptyGymData();
  }

  if (Array.isArray(data.plans)) {
    const plans = data.plans.filter(isObject).map(normalizePlan);
    const storedActivePlanId = typeof data.activePlanId === "string" ? data.activePlanId : null;
    const activePlanExists = plans.some((plan) => plan.id === storedActivePlanId);

    return {
      activePlanId: activePlanExists ? storedActivePlanId : plans[0]?.id ?? null,
      deletedPlanIds: normalizeDeletedIds(data.deletedPlanIds),
      resetAt: typeof data.resetAt === "string" ? data.resetAt : undefined,
      plans
    };
  }

  if (!isLegacyPlan(data)) {
    return emptyGymData();
  }

  const migratedPlan = normalizePlan(data);
  return {
    activePlanId: migratedPlan.id,
    deletedPlanIds: [],
    resetAt: undefined,
    plans: [migratedPlan]
  };
}

function emptyGymData() {
  return {
    activePlanId: null,
    deletedPlanIds: [],
    resetAt: undefined,
    plans: []
  };
}

function isLegacyPlan(data) {
  return (
    typeof data.id === "string" &&
    typeof data.name === "string" &&
    typeof data.createdAt === "string" &&
    Array.isArray(data.workouts)
  );
}

function normalizePlan(data) {
  const planCreatedAt = typeof data.createdAt === "string" ? data.createdAt : new Date().toISOString();

  return {
    id: typeof data.id === "string" ? data.id : createId(),
    name: typeof data.name === "string" ? data.name : "Scheda",
    createdAt: planCreatedAt,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : planCreatedAt,
    pdfId: typeof data.pdfId === "string" ? data.pdfId : undefined,
    pdfName: typeof data.pdfName === "string" ? data.pdfName : undefined,
    pdfSize: typeof data.pdfSize === "number" ? data.pdfSize : undefined,
    pdfUpdatedAt: typeof data.pdfUpdatedAt === "string" ? data.pdfUpdatedAt : undefined,
    cloudPdf: normalizeCloudPdf(data.cloudPdf),
    deletedWorkoutIds: normalizeDeletedIds(data.deletedWorkoutIds),
    workouts: Array.isArray(data.workouts) ? data.workouts.filter(isObject).map(normalizeWorkout) : [],
    sessions: Array.isArray(data.sessions) ? data.sessions.filter(isObject).map(normalizeSession) : []
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

function isObject(value) {
  return value && typeof value === "object";
}

function normalizeSession(session) {
  return {
    id: typeof session.id === "string" ? session.id : createId(),
    planId: typeof session.planId === "string" ? session.planId : "",
    workoutId: typeof session.workoutId === "string" ? session.workoutId : "",
    workoutName: typeof session.workoutName === "string" ? session.workoutName : "",
    startedAt: typeof session.startedAt === "string" ? session.startedAt : new Date().toISOString(),
    completedAt: typeof session.completedAt === "string" ? session.completedAt : new Date().toISOString(),
    durationSeconds: typeof session.durationSeconds === "number" ? session.durationSeconds : 0,
    exercises: Array.isArray(session.exercises) ? session.exercises.filter(isObject).map(normalizeSessionExercise) : []
  };
}

function normalizeSessionExercise(ex) {
  const rawCompletedSets = ex.completedSets;
  const completedSets =
    typeof rawCompletedSets === "number" && Number.isFinite(rawCompletedSets) && rawCompletedSets >= 0
      ? Math.floor(rawCompletedSets)
      : 0;

  return {
    exerciseId: typeof ex.exerciseId === "string" ? ex.exerciseId : "",
    name: typeof ex.name === "string" ? ex.name : "",
    sets: typeof ex.sets === "string" ? ex.sets : "",
    reps: typeof ex.reps === "string" ? ex.reps : "",
    weight: typeof ex.weight === "string" ? ex.weight : "",
    rest: typeof ex.rest === "string" ? ex.rest : "",
    notes: typeof ex.notes === "string" ? ex.notes : "",
    completedSets
  };
}

function normalizeWorkout(workout) {
  const workoutCreatedAt = typeof workout.createdAt === "string" ? workout.createdAt : new Date().toISOString();

  return {
    id: typeof workout.id === "string" ? workout.id : createId(),
    name: typeof workout.name === "string" ? workout.name : "",
    createdAt: workoutCreatedAt,
    updatedAt: typeof workout.updatedAt === "string" ? workout.updatedAt : workoutCreatedAt,
    pdfPage: typeof workout.pdfPage === "number" && Number.isFinite(workout.pdfPage) ? workout.pdfPage : null,
    deletedExerciseIds: normalizeDeletedIds(workout.deletedExerciseIds),
    exercises: Array.isArray(workout.exercises) ? workout.exercises.filter(isObject).map(normalizeExercise) : []
  };
}

function normalizeExercise(exercise) {
  const exerciseCreatedAt = typeof exercise.createdAt === "string" ? exercise.createdAt : new Date().toISOString();

  return {
    id: typeof exercise.id === "string" ? exercise.id : createId(),
    name: typeof exercise.name === "string" ? exercise.name : "",
    sets: normalizeSimpleNumberText(exercise.sets),
    reps: normalizeSimpleNumberText(exercise.reps),
    weight: normalizeSimpleNumberText(exercise.weight),
    rest: normalizeSimpleNumberText(exercise.rest),
    notes: typeof exercise.notes === "string" ? exercise.notes : "",
    createdAt: exerciseCreatedAt,
    updatedAt: typeof exercise.updatedAt === "string" ? exercise.updatedAt : exerciseCreatedAt
  };
}

function normalizeSimpleNumberText(value) {
  if (typeof value !== "string") {
    return "";
  }

  const trimmedValue = value.trim();

  if (!trimmedValue) {
    return "";
  }

  const numberMatch = trimmedValue.match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:kg|sec))?$/i);

  if (!numberMatch) {
    return trimmedValue;
  }

  return numberMatch[1].replace(",", ".");
}

function normalizeDeletedIds(value) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter(isObject)
    .filter((item) => typeof item.id === "string" && typeof item.deletedAt === "string")
    .map((item) => ({
      id: item.id,
      deletedAt: item.deletedAt
    }));
}

function normalizeActiveSession(session) {
  if (
    !session ||
    typeof session !== "object" ||
    typeof session.planId !== "string" ||
    typeof session.workoutId !== "string" ||
    typeof session.startedAt !== "string"
  ) {
    return null;
  }

  return {
    planId: session.planId,
    workoutId: session.workoutId,
    startedAt: session.startedAt,
    completedSetsByExercise: normalizeCompletedSetsByExercise(session.completedSetsByExercise)
  };
}

function normalizeCompletedSetsByExercise(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(
    Object.entries(value)
      .filter(([exerciseId, completedSets]) => typeof exerciseId === "string" && Array.isArray(completedSets))
      .map(([exerciseId, completedSets]) => [
        exerciseId,
        [...new Set(
          completedSets
            .filter((setNumber) => Number.isFinite(setNumber) && setNumber > 0)
            .map((setNumber) => Math.floor(setNumber))
        )].sort((a, b) => a - b)
      ])
  );
}
