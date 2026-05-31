import assert from "node:assert/strict";
import test from "node:test";
import { mergeGymData } from "./mergeGymData.js";

const basePlan = {
  id: "plan-1",
  name: "Scheda",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  workouts: [],
  sessions: []
};

const baseWorkout = {
  id: "workout-1",
  name: "Push",
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
  pdfPage: null,
  exercises: []
};

const basePlanWithWorkout = {
  ...basePlan,
  workouts: [baseWorkout]
};

test("mergeGymData keeps completed sessions from both devices", () => {
  const remote = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        sessions: [
          {
            id: "session-remote",
            planId: "plan-1",
            workoutId: "workout-1",
            workoutName: "Push",
            startedAt: "2026-05-01T10:00:00.000Z",
            completedAt: "2026-05-01T11:00:00.000Z",
            durationSeconds: 3600,
            exercises: []
          }
        ]
      }
    ]
  };
  const local = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        sessions: [
          {
            id: "session-local",
            planId: "plan-1",
            workoutId: "workout-1",
            workoutName: "Push",
            startedAt: "2026-05-02T10:00:00.000Z",
            completedAt: "2026-05-02T11:00:00.000Z",
            durationSeconds: 3600,
            exercises: []
          }
        ]
      }
    ]
  };

  const merged = mergeGymData(remote, local);
  assert.deepEqual(
    merged.plans[0].sessions.map((session) => session.id).sort(),
    ["session-local", "session-remote"]
  );
});

test("mergeGymData does not resurrect deleted exercises from stale device data", () => {
  const remote = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        updatedAt: "2026-05-03T10:00:00.000Z",
        workouts: [
          {
            ...baseWorkout,
            updatedAt: "2026-05-03T10:00:00.000Z",
            deletedExerciseIds: [{ id: "exercise-1", deletedAt: "2026-05-03T10:00:00.000Z" }],
            exercises: []
          }
        ]
      }
    ]
  };
  const local = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        workouts: [
          {
            ...baseWorkout,
            exercises: [
              {
                id: "exercise-1",
                name: "Bench",
                sets: "4",
                reps: "8",
                weight: "80",
                rest: "120",
                notes: "",
                createdAt: "2026-05-01T10:00:00.000Z",
                updatedAt: "2026-05-01T10:00:00.000Z"
              }
            ]
          }
        ]
      }
    ]
  };

  const merged = mergeGymData(remote, local);
  assert.equal(merged.plans[0].workouts[0].exercises.length, 0);
});

test("mergeGymData applies global reset to older plans", () => {
  const remote = {
    activePlanId: null,
    resetAt: "2026-05-03T10:00:00.000Z",
    deletedPlanIds: [{ id: "plan-1", deletedAt: "2026-05-03T10:00:00.000Z" }],
    plans: []
  };
  const local = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        updatedAt: "2026-05-01T10:00:00.000Z"
      }
    ]
  };

  const merged = mergeGymData(remote, local);
  assert.equal(merged.activePlanId, null);
  assert.equal(merged.plans.length, 0);
});

test("mergeGymData keeps the newest active session in the cloud model", () => {
  const remote = {
    activePlanId: "plan-1",
    activeSession: {
      planId: "plan-1",
      workoutId: "workout-1",
      startedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:05:00.000Z",
      completedSetsByExercise: {
        "exercise-1": [1]
      }
    },
    activeSessionUpdatedAt: "2026-05-03T10:05:00.000Z",
    plans: [basePlanWithWorkout]
  };
  const local = {
    activePlanId: "plan-1",
    activeSession: {
      planId: "plan-1",
      workoutId: "workout-1",
      startedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:06:00.000Z",
      completedSetsByExercise: {
        "exercise-1": [1, 2]
      }
    },
    activeSessionUpdatedAt: "2026-05-03T10:06:00.000Z",
    plans: [basePlanWithWorkout]
  };

  const merged = mergeGymData(remote, local);
  assert.deepEqual(merged.activeSession.completedSetsByExercise["exercise-1"], [1, 2]);
});

test("mergeGymData keeps the newest update for the same active session id", () => {
  const remote = {
    activePlanId: "plan-1",
    activeSession: {
      id: "active-1",
      planId: "plan-1",
      workoutId: "workout-1",
      startedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:10:00.000Z",
      completedSetsByExercise: {
        "exercise-1": [1, 2, 3]
      }
    },
    activeSessionUpdatedAt: "2026-05-03T10:10:00.000Z",
    plans: [basePlanWithWorkout]
  };
  const local = {
    activePlanId: "plan-1",
    activeSession: {
      id: "active-1",
      planId: "plan-1",
      workoutId: "workout-1",
      startedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:06:00.000Z",
      completedSetsByExercise: {
        "exercise-1": [1]
      }
    },
    activeSessionUpdatedAt: "2026-05-03T10:06:00.000Z",
    plans: [basePlanWithWorkout]
  };

  const merged = mergeGymData(remote, local);
  assert.equal(merged.activeSession.id, "active-1");
  assert.deepEqual(merged.activeSession.completedSetsByExercise["exercise-1"], [1, 2, 3]);
});

test("mergeGymData does not resurrect a completed active session", () => {
  const remote = {
    activePlanId: "plan-1",
    activeSession: {
      id: "active-1",
      planId: "plan-1",
      workoutId: "workout-1",
      startedAt: "2026-05-03T10:00:00.000Z",
      updatedAt: "2026-05-03T10:06:00.000Z",
      completedSetsByExercise: {
        "exercise-1": [1, 2]
      }
    },
    activeSessionUpdatedAt: "2026-05-03T10:06:00.000Z",
    plans: [basePlanWithWorkout]
  };
  const local = {
    activePlanId: "plan-1",
    activeSession: null,
    activeSessionUpdatedAt: "2026-05-03T10:08:00.000Z",
    completedActiveSessionIds: [{ id: "active-1", deletedAt: "2026-05-03T10:08:00.000Z" }],
    plans: [basePlanWithWorkout]
  };

  const merged = mergeGymData(remote, local);
  assert.equal(merged.activeSession, null);
  assert.deepEqual(merged.completedActiveSessionIds, [
    { id: "active-1", deletedAt: "2026-05-03T10:08:00.000Z" }
  ]);
});

test("mergeGymData does not resurrect a PDF deleted after it was uploaded", () => {
  const remote = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        pdfDeletedAt: "2026-05-03T10:00:00.000Z"
      }
    ]
  };
  const local = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        cloudPdf: {
          key: "user-1/plans/plan-1/old.pdf",
          name: "old.pdf",
          contentType: "application/pdf",
          updatedAt: "2026-05-03T09:00:00.000Z"
        }
      }
    ]
  };

  const merged = mergeGymData(remote, local);
  assert.equal(merged.plans[0].cloudPdf, undefined);
  assert.equal(merged.plans[0].pdfDeletedAt, "2026-05-03T10:00:00.000Z");
});

test("mergeGymData keeps a new PDF uploaded after a deletion", () => {
  const remote = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        pdfDeletedAt: "2026-05-03T10:00:00.000Z"
      }
    ]
  };
  const local = {
    activePlanId: "plan-1",
    plans: [
      {
        ...basePlan,
        cloudPdf: {
          key: "user-1/plans/plan-1/new.pdf",
          name: "new.pdf",
          contentType: "application/pdf",
          updatedAt: "2026-05-03T10:10:00.000Z"
        },
        pdfDeletedAt: "2026-05-03T10:00:00.000Z"
      }
    ]
  };

  const merged = mergeGymData(remote, local);
  assert.equal(merged.plans[0].cloudPdf.key, "user-1/plans/plan-1/new.pdf");
});
