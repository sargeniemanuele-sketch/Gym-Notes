export function createId() {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;
}

export function normalizeGymData(data) {
  if (!data || typeof data !== "object") {
    return emptyGymData();
  }

  if (Array.isArray(data.plans)) {
    const plans = data.plans.filter(isObject).map(normalizePlan);
    const storedActivePlanId = typeof data.activePlanId === "string" ? data.activePlanId : null;
    const activePlanExists = plans.some((plan) => plan.id === storedActivePlanId);
    const activeSession = normalizeActiveSession(data.activeSession);
    const completedActiveSessionIds = normalizeDeletedIds(data.completedActiveSessionIds);

    return {
      activePlanId: activePlanExists ? storedActivePlanId : plans[0]?.id ?? null,
      activeSession:
        activeSession &&
        isActiveSessionValid(activeSession, plans) &&
        !isActiveSessionCompleted(activeSession, completedActiveSessionIds)
          ? activeSession
          : null,
      activeSessionUpdatedAt:
        typeof data.activeSessionUpdatedAt === "string"
          ? data.activeSessionUpdatedAt
          : activeSession?.updatedAt ?? activeSession?.startedAt,
      completedActiveSessionIds,
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
    activeSession: null,
    activeSessionUpdatedAt: undefined,
    completedActiveSessionIds: [],
    deletedPlanIds: [],
    resetAt: undefined,
    plans: [migratedPlan]
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
    pdfDeletedAt: typeof data.pdfDeletedAt === "string" ? data.pdfDeletedAt : undefined,
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

export function normalizeActiveSession(session) {
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
    id: typeof session.id === "string" ? session.id : createId(),
    planId: session.planId,
    workoutId: session.workoutId,
    startedAt: session.startedAt,
    updatedAt: typeof session.updatedAt === "string" ? session.updatedAt : session.startedAt,
    completedSetsByExercise: normalizeCompletedSetsByExercise(session.completedSetsByExercise)
  };
}

function isActiveSessionValid(session, plans) {
  const plan = plans.find((candidate) => candidate.id === session.planId);
  return !!plan?.workouts?.some((workout) => workout.id === session.workoutId);
}

function isActiveSessionCompleted(session, completedActiveSessionIds) {
  return completedActiveSessionIds.some((item) => item.id === session.id);
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
