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

    return normalizeGymData(parsedData);
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
  return (
    data &&
    typeof data === "object" &&
    typeof data.id === "string" &&
    typeof data.name === "string" &&
    typeof data.createdAt === "string" &&
    Array.isArray(data.workouts)
  );
}

function normalizeGymData(data) {
  const planCreatedAt = data.createdAt;

  return {
    id: data.id,
    name: data.name,
    createdAt: planCreatedAt,
    updatedAt: typeof data.updatedAt === "string" ? data.updatedAt : planCreatedAt,
    workouts: data.workouts.filter(isObject).map(normalizeWorkout)
  };
}

function isObject(value) {
  return value && typeof value === "object";
}

function normalizeWorkout(workout) {
  const workoutCreatedAt = typeof workout.createdAt === "string" ? workout.createdAt : new Date().toISOString();

  return {
    id: typeof workout.id === "string" ? workout.id : createId(),
    name: typeof workout.name === "string" ? workout.name : "",
    createdAt: workoutCreatedAt,
    updatedAt: typeof workout.updatedAt === "string" ? workout.updatedAt : workoutCreatedAt,
    exercises: Array.isArray(workout.exercises) ? workout.exercises.filter(isObject).map(normalizeExercise) : []
  };
}

function normalizeExercise(exercise) {
  const exerciseCreatedAt = typeof exercise.createdAt === "string" ? exercise.createdAt : new Date().toISOString();

  return {
    id: typeof exercise.id === "string" ? exercise.id : createId(),
    name: typeof exercise.name === "string" ? exercise.name : "",
    sets: typeof exercise.sets === "string" ? exercise.sets : "",
    reps: typeof exercise.reps === "string" ? exercise.reps : "",
    weight: typeof exercise.weight === "string" ? exercise.weight : "",
    notes: typeof exercise.notes === "string" ? exercise.notes : "",
    createdAt: exerciseCreatedAt,
    updatedAt: typeof exercise.updatedAt === "string" ? exercise.updatedAt : exerciseCreatedAt
  };
}
