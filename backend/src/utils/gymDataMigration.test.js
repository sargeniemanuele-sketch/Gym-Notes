"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  composeGymDataFromDocuments,
  decomposeGymData,
  normalizeForComparison,
  saveDecomposedGymData
} = require("./gymDataMigration");

const gymData = {
  activePlanId: "plan-1",
  activeSession: {
    id: "active-1",
    planId: "plan-1",
    workoutId: "workout-1",
    startedAt: "2026-05-01T10:00:00.000Z",
    updatedAt: "2026-05-01T10:10:00.000Z",
    completedSetsByExercise: {
      "exercise-1": [1]
    }
  },
  activeSessionUpdatedAt: "2026-05-01T10:10:00.000Z",
  completedActiveSessionIds: [{ id: "old-active", deletedAt: "2026-05-01T09:00:00.000Z" }],
  deletedPlanIds: [],
  plans: [
    {
      id: "plan-1",
      name: "Scheda",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-05-01T10:00:00.000Z",
      cloudPdf: {
        key: "user-1/plans/plan-1/file.pdf",
        name: "file.pdf",
        size: 123,
        contentType: "application/pdf",
        updatedAt: "2026-05-01T09:00:00.000Z"
      },
      workouts: [
        {
          id: "workout-1",
          name: "Push",
          createdAt: "2026-01-01T00:00:00.000Z",
          updatedAt: "2026-01-02T00:00:00.000Z",
          pdfPage: 1,
          exercises: [
            {
              id: "exercise-1",
              name: "Bench",
              sets: "4",
              reps: "8",
              weight: "80",
              rest: "120",
              notes: "",
              createdAt: "2026-01-01T00:00:00.000Z",
              updatedAt: "2026-01-02T00:00:00.000Z"
            }
          ]
        }
      ],
      sessions: [
        {
          id: "session-1",
          activeSessionId: "active-1",
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

test("decomposeGymData preserves existing plan, workout, exercise, session, and active session ids", () => {
  const decomposed = decomposeGymData("user-1", gymData);

  assert.equal(decomposed.gymState.activeSession.id, "active-1");
  assert.equal(decomposed.plans[0].planId, "plan-1");
  assert.equal(decomposed.plans[0].workouts[0].id, "workout-1");
  assert.equal(decomposed.plans[0].workouts[0].exercises[0].id, "exercise-1");
  assert.equal(decomposed.sessions[0].sessionId, "session-1");
});

test("compose after decompose produces the same normalized gym data", () => {
  const decomposed = decomposeGymData("user-1", gymData);
  const recomposed = composeGymDataFromDocuments(
    {
      ...decomposed.gymState,
      updatedAt: new Date("2026-05-01T12:00:00.000Z")
    },
    decomposed.plans,
    decomposed.sessions
  );

  assert.deepEqual(normalizeForComparison(recomposed), normalizeForComparison(gymData));
});

test("decomposeGymData is idempotent for document identity", () => {
  const first = decomposeGymData("user-1", gymData);
  const second = decomposeGymData("user-1", gymData);

  assert.deepEqual(
    {
      planIds: first.plans.map((plan) => plan.planId),
      sessionIds: first.sessions.map((session) => session.sessionId)
    },
    {
      planIds: second.plans.map((plan) => plan.planId),
      sessionIds: second.sessions.map((session) => session.sessionId)
    }
  );
});

test("saveDecomposedGymData passes the Mongo session to every write", async () => {
  const { models, writeSessions, session } = createTransactionalModels();

  await saveDecomposedGymData("user-1", gymData, models);

  assert.ok(writeSessions.length >= 5);
  assert.equal(writeSessions.every((item) => item === session), true);
});

test("saveDecomposedGymData rolls back partial writes when a transactional write fails", async () => {
  const { models, state } = createTransactionalModels({ failGymDataWrite: true });

  await assert.rejects(() => saveDecomposedGymData("user-1", gymData, models), /legacy backup failed/);

  assert.deepEqual(state.plans, []);
  assert.deepEqual(state.sessions, [{ userId: "user-1", sessionId: "stale-session", planId: "plan-1" }]);
  assert.equal(state.gymState, null);
  assert.equal(state.gymData, null);
});

test("saveDecomposedGymData hard-deletes sessions missing from the current payload", async () => {
  const { models, state } = createTransactionalModels();

  await saveDecomposedGymData("user-1", gymData, models);

  assert.deepEqual(
    state.sessions.map((session) => session.sessionId),
    ["session-1"]
  );
});

test("saveDecomposedGymData hard-deletes plan sessions after reset payload", async () => {
  const { models, state } = createTransactionalModels();
  const resetData = {
    activePlanId: null,
    activeSession: null,
    activeSessionUpdatedAt: "2026-05-02T10:00:00.000Z",
    deletedPlanIds: [{ id: "plan-1", deletedAt: "2026-05-02T10:00:00.000Z" }],
    resetAt: "2026-05-02T10:00:00.000Z",
    plans: []
  };

  await saveDecomposedGymData("user-1", resetData, models);

  assert.deepEqual(state.sessions, []);
  assert.equal(state.plans[0].deletedAt.toISOString(), "2026-05-02T10:00:00.000Z");
});

function createTransactionalModels({ failGymDataWrite = false } = {}) {
  const session = {
    id: "session-1",
    withTransaction: async (work) => {
      const before = snapshot();
      try {
        await work();
      } catch (err) {
        restore(before);
        throw err;
      }
    },
    endSession: async () => {}
  };
  const writeSessions = [];
  const state = {
    plans: [],
    sessions: [{ userId: "user-1", sessionId: "stale-session", planId: "plan-1" }],
    gymState: null,
    gymData: null
  };

  const snapshot = () => JSON.parse(JSON.stringify(state));
  const restore = (nextState) => {
    state.plans = nextState.plans;
    state.sessions = nextState.sessions;
    state.gymState = nextState.gymState;
    state.gymData = nextState.gymData;
  };
  const recordSession = (options = {}) => writeSessions.push(options.session);

  return {
    models: {
      startSession: async () => session,
      Plan: {
        updateOne: async (query, update, options = {}) => {
          recordSession(options);
          let plan = state.plans.find((candidate) => candidate.planId === query.planId);

          if (!plan) {
            plan = { userId: query.userId, planId: query.planId };
            state.plans.push(plan);
          }

          Object.assign(plan, update.$set);
        }
      },
      Session: {
        updateOne: async (query, update, options = {}) => {
          recordSession(options);
          let sessionDoc = state.sessions.find((candidate) => candidate.sessionId === query.sessionId);

          if (!sessionDoc) {
            sessionDoc = { userId: query.userId, sessionId: query.sessionId };
            state.sessions.push(sessionDoc);
          }

          Object.assign(sessionDoc, update.$set);
        },
        deleteMany: async (query, options = {}) => {
          recordSession(options);
          const keepIds = query.sessionId.$nin;
          state.sessions = state.sessions.filter(
            (sessionDoc) => sessionDoc.userId !== query.userId || keepIds.includes(sessionDoc.sessionId)
          );
        }
      },
      GymState: {
        findOneAndUpdate: async (query, update, options = {}) => {
          recordSession(options);
          state.gymState = { userId: query.userId, ...update.$set, updatedAt: new Date() };
          return state.gymState;
        }
      },
      GymData: {
        findOneAndUpdate: async (query, update, options = {}) => {
          recordSession(options);

          if (failGymDataWrite) {
            throw new Error("legacy backup failed");
          }

          state.gymData = { userId: query.userId, ...update, updatedAt: new Date() };
          return state.gymData;
        }
      }
    },
    session,
    state,
    writeSessions
  };
}
