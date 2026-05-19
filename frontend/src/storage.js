export const STORAGE_KEY = "gym-notes-data-v1";

export function isStorageAvailable() {
  try {
    const testKey = "__gym_notes_storage_test__";
    window.localStorage.setItem(testKey, "1");
    window.localStorage.removeItem(testKey);
    return true;
  } catch {
    return false;
  }
}

export function loadGymData() {
  if (!isStorageAvailable()) {
    return null;
  }

  try {
    const savedData = window.localStorage.getItem(STORAGE_KEY);

    if (!savedData) {
      return null;
    }

    const parsedData = JSON.parse(savedData);

    if (!isValidGymData(parsedData)) {
      return null;
    }

    const normalizedData = normalizeGymData(parsedData);

    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalizedData));
    } catch {
      // The app can still use the normalized data in memory if persisting the migration fails.
    }

    return normalizedData;
  } catch {
    return null;
  }
}

export function saveGymData(data) {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export function clearGymData() {
  if (!isStorageAvailable()) {
    return false;
  }

  try {
    window.localStorage.removeItem(STORAGE_KEY);
    return true;
  } catch {
    return false;
  }
}

export function createId() {
  if (window.crypto && typeof window.crypto.randomUUID === "function") {
    return window.crypto.randomUUID();
  }

  return `${Date.now().toString()}-${Math.random().toString(16).slice(2)}`;
}

function isValidGymData(data) {
  if (!data || typeof data !== "object") {
    return false;
  }

  if (Array.isArray(data.plans)) {
    return true;
  }

  return (
    typeof data.id === "string" &&
    typeof data.name === "string" &&
    typeof data.createdAt === "string" &&
    Array.isArray(data.workouts)
  );
}

function normalizeGymData(data) {
  if (Array.isArray(data.plans)) {
    const plans = data.plans.filter(isObject).map(normalizePlan);
    const storedActivePlanId = typeof data.activePlanId === "string" ? data.activePlanId : null;
    const activePlanExists = plans.some((plan) => plan.id === storedActivePlanId);

    return {
      activePlanId: activePlanExists ? storedActivePlanId : plans[0]?.id ?? null,
      plans
    };
  }

  const migratedPlan = normalizePlan(data);

  return {
    activePlanId: migratedPlan.id,
    plans: [migratedPlan]
  };
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
    workouts: Array.isArray(data.workouts) ? data.workouts.filter(isObject).map(normalizeWorkout) : [],
    sessions: Array.isArray(data.sessions) ? data.sessions.filter(isObject).map(normalizeSession) : []
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
