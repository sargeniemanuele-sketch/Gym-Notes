export function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
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

    return {
      activePlanId: activePlanExists ? storedActivePlanId : plans[0]?.id ?? null,
      plans
    };
  }

  if (!isLegacyPlan(data)) {
    return emptyGymData();
  }

  const migratedPlan = normalizePlan(data);
  return {
    activePlanId: migratedPlan.id,
    plans: [migratedPlan]
  };
}

function emptyGymData() {
  return {
    activePlanId: null,
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
