import { normalizeGymData } from "../storage.js";

export function mergeGymData(remoteData, localData) {
  const remote = normalizeGymData(remoteData ?? { activePlanId: null, plans: [] });
  const local = normalizeGymData(localData ?? { activePlanId: null, plans: [] });
  const deletedPlanIds = mergeDeletedIds(remote.deletedPlanIds, local.deletedPlanIds);
  const completedActiveSessionIds = mergeDeletedIds(
    remote.completedActiveSessionIds,
    local.completedActiveSessionIds
  );
  const resetAt = getNewerOptionalDate(remote.resetAt, local.resetAt);
  const plansById = new Map(remote.plans.map((plan) => [plan.id, plan]));

  local.plans.forEach((localPlan) => {
    const remotePlan = plansById.get(localPlan.id);
    plansById.set(localPlan.id, remotePlan ? mergePlans(remotePlan, localPlan) : localPlan);
  });

  const plans = filterDeletedItems(Array.from(plansById.values()), deletedPlanIds, resetAt);
  const localActivePlanExists = plans.some((plan) => plan.id === local.activePlanId);
  const remoteActivePlanExists = plans.some((plan) => plan.id === remote.activePlanId);
  const activeSessionFields = getMergedActiveSessionFields(remote, local, plans, completedActiveSessionIds);

  return normalizeGymData({
    activePlanId: localActivePlanExists ? local.activePlanId : remoteActivePlanExists ? remote.activePlanId : plans[0]?.id ?? null,
    ...activeSessionFields,
    completedActiveSessionIds,
    deletedPlanIds,
    resetAt,
    plans
  });
}

function mergePlans(remotePlan, localPlan) {
  const remoteTime = getTimestamp(remotePlan.updatedAt);
  const localTime = getTimestamp(localPlan.updatedAt);
  const basePlan = localTime > remoteTime ? localPlan : remotePlan;
  const mergedPdfFields = getMergedPdfFields(remotePlan, localPlan);
  const deletedWorkoutIds = mergeDeletedIds(remotePlan.deletedWorkoutIds, localPlan.deletedWorkoutIds);
  const workouts = filterDeletedItems(
    mergeById(remotePlan.workouts, localPlan.workouts, mergeWorkouts),
    deletedWorkoutIds
  );

  return {
    ...basePlan,
    ...mergedPdfFields,
    createdAt: getOlderDate(remotePlan.createdAt, localPlan.createdAt),
    updatedAt: getNewerDate(remotePlan.updatedAt, localPlan.updatedAt),
    deletedWorkoutIds,
    workouts,
    sessions: mergeById(remotePlan.sessions ?? [], localPlan.sessions ?? [], mergeSessions)
  };
}

function mergeWorkouts(remoteWorkout, localWorkout) {
  const remoteTime = getTimestamp(remoteWorkout.updatedAt);
  const localTime = getTimestamp(localWorkout.updatedAt);
  const baseWorkout = localTime > remoteTime ? localWorkout : remoteWorkout;
  const deletedExerciseIds = mergeDeletedIds(remoteWorkout.deletedExerciseIds, localWorkout.deletedExerciseIds);
  const exercises = filterDeletedItems(
    mergeById(remoteWorkout.exercises, localWorkout.exercises, mergeExercises),
    deletedExerciseIds
  );

  return {
    ...baseWorkout,
    createdAt: getOlderDate(remoteWorkout.createdAt, localWorkout.createdAt),
    updatedAt: getNewerDate(remoteWorkout.updatedAt, localWorkout.updatedAt),
    deletedExerciseIds,
    exercises
  };
}

function mergeExercises(remoteExercise, localExercise) {
  return getTimestamp(localExercise.updatedAt) > getTimestamp(remoteExercise.updatedAt)
    ? localExercise
    : remoteExercise;
}

function mergeSessions(remoteSession, localSession) {
  return getTimestamp(localSession.completedAt) > getTimestamp(remoteSession.completedAt)
    ? localSession
    : remoteSession;
}

function mergeById(remoteItems = [], localItems = [], mergeItem) {
  const itemsById = new Map(remoteItems.map((item) => [item.id, item]));

  localItems.forEach((localItem) => {
    const remoteItem = itemsById.get(localItem.id);
    itemsById.set(localItem.id, remoteItem ? mergeItem(remoteItem, localItem) : localItem);
  });

  return Array.from(itemsById.values());
}

export function addDeletedId(deletedIds = [], id, deletedAt) {
  return mergeDeletedIds(deletedIds, [{ id, deletedAt }]);
}

function mergeDeletedIds(first = [], second = []) {
  const deletedById = new Map();

  [...first, ...second].forEach((item) => {
    if (!item?.id || !item?.deletedAt) {
      return;
    }

    const current = deletedById.get(item.id);

    if (!current || getTimestamp(item.deletedAt) > getTimestamp(current.deletedAt)) {
      deletedById.set(item.id, item);
    }
  });

  return Array.from(deletedById.values());
}

function filterDeletedItems(items, deletedIds, resetAt = undefined) {
  const deletedById = new Map(deletedIds.map((item) => [item.id, item.deletedAt]));

  return items.filter((item) => {
    const deletedAt = deletedById.get(item.id);
    const itemTimestamp = getTimestamp(item.updatedAt ?? item.createdAt);

    if (resetCutoffApplies(itemTimestamp, resetAt)) {
      return false;
    }

    if (!deletedAt) {
      return true;
    }

    return itemTimestamp > getTimestamp(deletedAt);
  });
}

function getMergedPdfFields(remotePlan, localPlan) {
  const pdfDeletedAt = getNewerOptionalDate(remotePlan.pdfDeletedAt, localPlan.pdfDeletedAt);
  const pdfCandidates = [remotePlan, localPlan].filter(hasPlanPdf);
  const newestPdfPlan = pdfCandidates.reduce((newest, plan) => {
    if (!newest) return plan;
    return getTimestamp(getPdfUpdatedAt(plan)) > getTimestamp(getPdfUpdatedAt(newest)) ? plan : newest;
  }, null);

  if (!newestPdfPlan) {
    return {
      cloudPdf: undefined,
      pdfDeletedAt
    };
  }

  if (pdfDeletedAt && getTimestamp(pdfDeletedAt) >= getTimestamp(getPdfUpdatedAt(newestPdfPlan))) {
    return {
      cloudPdf: undefined,
      pdfDeletedAt
    };
  }

  return {
    ...getPdfFields(newestPdfPlan),
    pdfDeletedAt
  };
}

function hasPlanPdf(plan) {
  return !!plan?.cloudPdf?.key;
}

function getPdfFields(plan) {
  return {
    cloudPdf: plan.cloudPdf,
    pdfDeletedAt: plan.pdfDeletedAt
  };
}

function getPdfUpdatedAt(plan) {
  return plan?.cloudPdf?.updatedAt;
}

function getMergedActiveSessionFields(remote, local, plans, completedActiveSessionIds) {
  const remoteTime = getActiveSessionEventTimestamp(remote);
  const localTime = getActiveSessionEventTimestamp(local);
  const winner = localTime > remoteTime ? local : remote;
  const activeSession = isActiveSessionValid(winner.activeSession, plans, completedActiveSessionIds)
    ? winner.activeSession
    : null;
  const activeSessionUpdatedAt = getNewerOptionalDate(remote.activeSessionUpdatedAt, local.activeSessionUpdatedAt);

  return {
    activeSession,
    activeSessionUpdatedAt
  };
}

function getActiveSessionEventTimestamp(data) {
  return Math.max(
    getTimestamp(data?.activeSessionUpdatedAt),
    getTimestamp(data?.activeSession?.updatedAt),
    getTimestamp(data?.activeSession?.startedAt)
  );
}

function isActiveSessionValid(session, plans, completedActiveSessionIds = []) {
  if (!session) {
    return false;
  }

  if (completedActiveSessionIds.some((item) => item.id === session.id)) {
    return false;
  }

  const plan = plans.find((candidate) => candidate.id === session.planId);
  return !!plan?.workouts?.some((workout) => workout.id === session.workoutId);
}

function getOlderDate(firstDate, secondDate) {
  return getTimestamp(firstDate) <= getTimestamp(secondDate) ? firstDate : secondDate;
}

function getNewerDate(firstDate, secondDate) {
  return getTimestamp(firstDate) >= getTimestamp(secondDate) ? firstDate : secondDate;
}

function getNewerOptionalDate(firstDate, secondDate) {
  if (!firstDate) {
    return secondDate;
  }

  if (!secondDate) {
    return firstDate;
  }

  return getNewerDate(firstDate, secondDate);
}

function resetCutoffApplies(itemTimestamp, resetAt) {
  return !!resetAt && itemTimestamp <= getTimestamp(resetAt);
}

function getTimestamp(value) {
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? timestamp : 0;
}
