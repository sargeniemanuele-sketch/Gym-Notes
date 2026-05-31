import React, { useEffect, useMemo, useRef, useState } from "react";
import ActiveTimerBar from "./components/ActiveTimerBar.jsx";
import PlanDetail from "./components/PlanDetail.jsx";
import PlanList from "./components/PlanList.jsx";
import WorkoutDetail from "./components/WorkoutDetail.jsx";
import {
  createId,
  normalizeGymData
} from "./storage.js";
import { getTodayLabel } from "./utils/formatters.js";
import { addDeletedId, mergeGymData } from "./utils/mergeGymData.js";
import { normalizeNumericInputValue } from "./utils/numbers.js";
import { clearAuth, loadAuth, saveAuth } from "./authStorage.js";
import {
  deletePlanPdf,
  getMe,
  getRemoteGymData,
  login as apiLogin,
  register as apiRegister,
  saveRemoteGymData,
  uploadPlanPdf
} from "./api/client.js";
import { sanitizeForCloud } from "./utils/sanitizeForCloud.js";
import {
  CLOUD_SAVE_STATUS,
  getCloudSaveMessage,
  isCloudSaveBlockingUnload,
  shouldConfirmLogoutAfterFlush
} from "./utils/cloudSaveState.js";
import AuthScreen from "./components/AuthScreen.jsx";

const emptyExerciseDraft = {
  name: "",
  sets: "",
  reps: "",
  weight: "",
  rest: "",
  notes: ""
};

function App() {
  const [gymData, setGymData] = useState(null);
  const [isLoadingData, setIsLoadingData] = useState(false);
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isNewPlanFormOpen, setIsNewPlanFormOpen] = useState(false);
  const [isRenamingPlan, setIsRenamingPlan] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [planName, setPlanName] = useState("");
  const [planNameBeforeRename, setPlanNameBeforeRename] = useState(null);
  const [workoutName, setWorkoutName] = useState("");
  const [isNewWorkoutFormOpen, setIsNewWorkoutFormOpen] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [workoutNameBeforeRename, setWorkoutNameBeforeRename] = useState(null);
  const [isExerciseFormOpen, setIsExerciseFormOpen] = useState(false);
  const [exerciseDraft, setExerciseDraft] = useState(emptyExerciseDraft);
  const [exerciseError, setExerciseError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [cloudSaveStatus, setCloudSaveStatus] = useState(CLOUD_SAVE_STATUS.IDLE);
  const [saveWarning, setSaveWarning] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [isPdfVisible, setIsPdfVisible] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [auth, setAuth] = useState(() => loadAuth());
  const [cloudLoadError, setCloudLoadError] = useState("");
  const saveStatusTimeoutRef = useRef(null);
  const sessionFeedbackTimeoutRef = useRef(null);
  const cloudSaveTimerRef = useRef(null);
  const cloudSaveInFlightRef = useRef(false);
  const cloudSavePromiseRef = useRef(null);
  const pendingCloudDataRef = useRef(null);
  const cloudSaveTokenRef = useRef(null);
  const lastCloudUpdatedAtRef = useRef(null);
  const lastCloudRefreshAtRef = useRef(0);
  const isCompletingSessionRef = useRef(false);
  const notifiedTimerRef = useRef(null);
  const pdfInputRef = useRef(null);
  const todayLabel = useMemo(() => getTodayLabel(), []);
  const plans = gymData?.plans ?? [];
  const activeSession = gymData?.activeSession ?? null;
  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === gymData?.activePlanId) ?? null,
    [gymData?.activePlanId, plans]
  );

  const selectedWorkout = activePlan?.workouts.find((workout) => workout.id === selectedWorkoutId);

  useEffect(() => {
    if (!auth) return;
    loadCloudData(auth.token, { verifyToken: true });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const handleBeforeUnload = (event) => {
      if (!hasUnflushedCloudChanges()) {
        return;
      }

      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);

    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, []);

  useEffect(() => {
    if (!auth?.token || !gymData) {
      return undefined;
    }

    const sync = () => syncCloudDataIfNeeded(auth.token);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        sync();
      }
    };

    window.addEventListener("focus", sync);
    window.addEventListener("online", sync);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    const intervalId = window.setInterval(sync, 30000);

    return () => {
      window.removeEventListener("focus", sync);
      window.removeEventListener("online", sync);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearInterval(intervalId);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [auth?.token, !!gymData]);

  useEffect(() => {
    if (selectedWorkoutId && hasPlanPdf(activePlan)) {
      setIsPdfVisible(true);
    }
  }, [activePlan?.cloudPdf?.key, selectedWorkoutId]);

  useEffect(() => {
    if (activeTimer?.status !== "running") {
      return undefined;
    }

    const intervalId = window.setInterval(() => {
      setActiveTimer((currentTimer) => {
        if (!currentTimer || currentTimer.status !== "running") {
          return currentTimer;
        }

        const remainingMs = Math.max(0, currentTimer.targetEndAt - Date.now());

        if (remainingMs > 0) {
          return {
            ...currentTimer,
            remainingMs
          };
        }

        return {
          ...currentTimer,
          remainingMs: 0,
          status: "finished"
        };
      });
    }, 250);

    return () => window.clearInterval(intervalId);
  }, [activeTimer?.status]);

  useEffect(() => {
    if (activeTimer?.status !== "finished") {
      return;
    }

    if (notifiedTimerRef.current === activeTimer.exerciseId) {
      return;
    }

    notifiedTimerRef.current = activeTimer.exerciseId;
    notifyTimerFinished();
  }, [activeTimer?.exerciseId, activeTimer?.status]);

  function applyGymData(nextData) {
    const normalizedData = normalizeRemoteData(nextData);
    setGymData(normalizedData);
  }

  async function applyCloudGymData(nextData) {
    const normalizedData = normalizeRemoteData(nextData);
    setGymData(normalizedData);
  }

  function persistNextData(nextData) {
    const normalizedData = normalizeRemoteData({
      ...gymData,
      completedActiveSessionIds: gymData?.completedActiveSessionIds ?? [],
      deletedPlanIds: gymData?.deletedPlanIds ?? [],
      resetAt: gymData?.resetAt,
      ...nextData
    });
    applyGymData(normalizedData);
    scheduleCloudSave(normalizedData);
  }

  function scheduleCloudSave(nextData) {
    pendingCloudDataRef.current = nextData;
    cloudSaveTokenRef.current = auth?.token ?? null;
    setCloudSaveStatus(CLOUD_SAVE_STATUS.SAVING);
    setSaveStatus(getCloudSaveMessage(CLOUD_SAVE_STATUS.SAVING));

    if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = setTimeout(flushCloudSave, 1200);
  }

  async function flushCloudSave() {
    if (cloudSaveTimerRef.current) {
      clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }

    if (cloudSaveInFlightRef.current) {
      try {
        await cloudSavePromiseRef.current;
      } catch {
        // The active flush handles the error and keeps the latest data queued.
      }

      if (pendingCloudDataRef.current) {
        return flushCloudSave();
      }

      return;
    }

    let lastAttemptedData = null;

    if (!cloudSaveTokenRef.current || !pendingCloudDataRef.current) {
      return;
    }

    cloudSaveInFlightRef.current = true;
    setCloudSaveStatus(CLOUD_SAVE_STATUS.SAVING);
    setSaveStatus(getCloudSaveMessage(CLOUD_SAVE_STATUS.SAVING));

    try {
      while (cloudSaveTokenRef.current && pendingCloudDataRef.current) {
        const token = cloudSaveTokenRef.current;
        const nextData = pendingCloudDataRef.current;
        pendingCloudDataRef.current = null;
        lastAttemptedData = nextData;

        try {
          cloudSavePromiseRef.current = saveRemoteGymData(
            token,
            sanitizeForCloud(nextData),
            lastCloudUpdatedAtRef.current
          );
          const savedRemote = await cloudSavePromiseRef.current;
          rememberRemoteUpdatedAt(savedRemote);
        } catch (err) {
          if (err.status === 409 && err.payload?.data) {
            lastCloudUpdatedAtRef.current = err.payload.updatedAt ?? lastCloudUpdatedAtRef.current;
            const mergedData = mergeGymData(err.payload.data, nextData);
            setGymData(mergedData);
            pendingCloudDataRef.current = mergedData;
            setSaveWarning("Dati aggiornati da un altro dispositivo: ho unito le modifiche e riprovo il salvataggio.");
            continue;
          }

          throw err;
        }
      }

      setSaveWarning((current) =>
        current.startsWith("Cloud non disponibile") ? "" : current
      );
      setCloudSaveStatus(CLOUD_SAVE_STATUS.SAVED);
      showSavedStatus(getCloudSaveMessage(CLOUD_SAVE_STATUS.SAVED));
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
        pendingCloudDataRef.current = null;
        setCloudSaveStatus(CLOUD_SAVE_STATUS.IDLE);
        setSaveWarning("Sessione scaduta. Accedi di nuovo per sincronizzare.");
        return;
      }

      if (!pendingCloudDataRef.current && lastAttemptedData) {
        pendingCloudDataRef.current = lastAttemptedData;
      }

      setCloudSaveStatus(CLOUD_SAVE_STATUS.ERROR);
      setSaveWarning(getCloudSaveMessage(CLOUD_SAVE_STATUS.ERROR));
    } finally {
      cloudSaveInFlightRef.current = false;
      cloudSavePromiseRef.current = null;
    }
  }

  async function flushRequiredCloudSave() {
    await flushCloudSave();

    if (hasUnflushedCloudChanges()) {
      throw new Error("Cloud non disponibile. Riprova tra poco.");
    }
  }

  function hasUnflushedCloudChanges() {
    return isCloudSaveBlockingUnload({
      hasPendingChanges: !!pendingCloudDataRef.current,
      isSaveInFlight: cloudSaveInFlightRef.current
    });
  }

  function persistNextActivePlan(nextPlan) {
    if (!gymData) {
      return;
    }

    persistNextData({
      ...gymData,
      activePlanId: nextPlan.id,
      plans: gymData.plans.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
    });
  }

  function persistActiveSession(nextSession, updatedAt = new Date().toISOString()) {
    if (!gymData) {
      return;
    }

    persistNextData({
      ...gymData,
      activeSession: nextSession ? { ...nextSession, updatedAt } : null,
      activeSessionUpdatedAt: updatedAt
    });
  }

  function showSavedStatus(message = "Salvato nel cloud") {
    setSaveStatus(message);

    if (saveStatusTimeoutRef.current) {
      window.clearTimeout(saveStatusTimeoutRef.current);
    }

    saveStatusTimeoutRef.current = window.setTimeout(() => {
      setSaveStatus("");
    }, 1800);
  }

  function showLocalActionStatus(message = "Modifica in memoria. Salvataggio...") {
    setSaveStatus(message);

    if (saveStatusTimeoutRef.current) {
      window.clearTimeout(saveStatusTimeoutRef.current);
    }
  }

  function showSessionFeedback(message) {
    setSessionFeedback(message);

    if (sessionFeedbackTimeoutRef.current) {
      window.clearTimeout(sessionFeedbackTimeoutRef.current);
    }

    sessionFeedbackTimeoutRef.current = window.setTimeout(() => {
      setSessionFeedback("");
    }, 3000);
  }

  function rememberRemoteUpdatedAt(result) {
    lastCloudUpdatedAtRef.current = result?.updatedAt ?? lastCloudUpdatedAtRef.current;
  }

  async function loadCloudData(token, { verifyToken = false } = {}) {
    setIsLoadingData(true);
    setCloudLoadError("");
    setSaveWarning("");

    try {
      if (verifyToken) {
        const currentUser = await getMe(token);
        const nextAuth = { token, user: currentUser.user };
        saveAuth(nextAuth);
        setAuth(nextAuth);
      }

      const remote = await getRemoteGymData(token);
      lastCloudUpdatedAtRef.current = remote.updatedAt ?? null;
      const remoteData = remote.data ?? { activePlanId: null, plans: [] };

      await applyCloudGymData(remoteData);
      setCloudSaveStatus("saved");
      showSavedStatus("Dati cloud caricati");

      return true;
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
        setGymData(null);
        return false;
      }

      if (gymData) {
        setSaveWarning("Cloud non disponibile. Mantengo i dati aperti in memoria e riprovo la sincronizzazione.");
        return true;
      }

      setCloudLoadError("Cloud non disponibile. Riprova tra poco.");
      setGymData(null);
      return false;
    } finally {
      setIsLoadingData(false);
    }
  }

  async function syncCloudDataIfNeeded(token) {
    const now = Date.now();

    if (
      document.visibilityState === "hidden" ||
      cloudSaveInFlightRef.current ||
      now - lastCloudRefreshAtRef.current < 5000
    ) {
      return;
    }

    lastCloudRefreshAtRef.current = now;

    if (pendingCloudDataRef.current) {
      await flushCloudSave();

      if (pendingCloudDataRef.current) {
        return;
      }
    }

    try {
      const remote = await getRemoteGymData(token);
      const remoteUpdatedAt = remote.updatedAt ?? null;

      if (!remoteUpdatedAt || remoteUpdatedAt === lastCloudUpdatedAtRef.current) {
        return;
      }

      lastCloudUpdatedAtRef.current = remoteUpdatedAt;
      const remoteData = remote.data ?? { activePlanId: null, plans: [] };
      await applyCloudGymData(remoteData);
      setSaveWarning("");
      setCloudSaveStatus("saved");
      showSavedStatus("Dati cloud aggiornati");
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
        setGymData(null);
        return;
      }

      setSaveWarning("Cloud non disponibile. Le modifiche verranno risincronizzate più avanti.");
    }
  }

  async function handleLogin(email, password) {
    const result = await apiLogin(email, password);
    setAuth(result);
    const loaded = await loadCloudData(result.token);
    if (loaded) saveAuth(result);
  }

  async function handleRegister(email, password) {
    const result = await apiRegister(email, password);
    setAuth(result);
    const loaded = await loadCloudData(result.token);
    if (loaded) saveAuth(result);
  }

  async function handleLogout() {
    if (hasUnflushedCloudChanges()) {
      let flushSucceeded = false;

      try {
        await flushRequiredCloudSave();
        flushSucceeded = true;
      } catch {
        const confirmed =
          shouldConfirmLogoutAfterFlush({ hadPendingChanges: true, flushSucceeded }) &&
          window.confirm("Ci sono modifiche non salvate nel cloud. Uscire comunque?");

        if (!confirmed) {
          return;
        }
      }
    }

    if (cloudSaveTimerRef.current) {
      clearTimeout(cloudSaveTimerRef.current);
      cloudSaveTimerRef.current = null;
    }
    pendingCloudDataRef.current = null;
    cloudSaveTokenRef.current = null;
    cloudSavePromiseRef.current = null;

    clearAuth();
    setAuth(null);
    setGymData(null);
    setCloudLoadError("");
    setIsPlanOpen(false);
    setSelectedWorkoutId(null);
    setActiveTimer(null);
    isCompletingSessionRef.current = false;
    setCloudSaveStatus(CLOUD_SAVE_STATUS.IDLE);
    setSaveWarning("");
  }

  function handleStartSession(workoutId) {
    if (!activePlan) {
      return;
    }

    if (activeSession && activeSession.workoutId !== workoutId) {
      const confirmed = window.confirm("Hai già una sessione in corso. Vuoi sostituirla?");

      if (!confirmed) {
        return;
      }
    }

    const startedAt = new Date().toISOString();
    const nextSession = {
      id: createId(),
      workoutId,
      planId: activePlan.id,
      startedAt,
      updatedAt: startedAt,
      completedSetsByExercise: {}
    };

    persistActiveSession(nextSession, startedAt);
    isCompletingSessionRef.current = false;
    setSessionFeedback("");
  }

  function handleCompleteSession() {
    if (!activeSession || !activePlan || isCompletingSessionRef.current) {
      return;
    }
    isCompletingSessionRef.current = true;

    const completedAt = new Date().toISOString();
    const durationSeconds = Math.floor(
      (new Date(completedAt).getTime() - new Date(activeSession.startedAt).getTime()) / 1000
    );
    const workout = activePlan.workouts.find((w) => w.id === activeSession.workoutId);

    const session = {
      id: activeSession.id ?? createId(),
      activeSessionId: activeSession.id ?? null,
      planId: activeSession.planId,
      workoutId: activeSession.workoutId,
      workoutName: workout?.name ?? "",
      startedAt: activeSession.startedAt,
      completedAt,
      durationSeconds,
      exercises: (workout?.exercises ?? []).map((ex) => ({
        exerciseId: ex.id,
        name: ex.name,
        sets: ex.sets,
        reps: ex.reps,
        weight: ex.weight,
        rest: ex.rest,
        notes: ex.notes,
        completedSets: activeSession.completedSetsByExercise?.[ex.id]?.length ?? 0
      }))
    };

    const nextPlan = {
      ...activePlan,
      sessions: [...(activePlan.sessions ?? []), session],
      updatedAt: completedAt
    };

    persistNextData({
      ...gymData,
      activeSession: null,
      activeSessionUpdatedAt: completedAt,
      completedActiveSessionIds: addDeletedId(gymData?.completedActiveSessionIds, session.id, completedAt),
      plans: gymData.plans.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
    });
    showSessionFeedback("Allenamento completato ✓");
  }

  function handleToggleExerciseSet(exerciseId, setNumber) {
    if (!activeSession) {
      return;
    }

    const current = activeSession.completedSetsByExercise?.[exerciseId] ?? [];
    const isCompleted = current.includes(setNumber);
    const next = isCompleted
      ? current.filter((n) => n !== setNumber)
      : [...current, setNumber].sort((a, b) => a - b);

    persistActiveSession({
      ...activeSession,
      completedSetsByExercise: {
        ...activeSession.completedSetsByExercise,
        [exerciseId]: next
      }
    });
  }

  function handleCancelSession() {
    const confirmed = window.confirm("Vuoi annullare questa sessione?");

    if (!confirmed) {
      return;
    }

    persistActiveSession(null);
    isCompletingSessionRef.current = false;
  }

  function handleStartRestTimer(exerciseId, durationSeconds, exerciseName = "", workoutName = "", workoutId = "", planId = "") {
    const durationMs = durationSeconds * 1000;
    notifiedTimerRef.current = null;

    setActiveTimer({
      exerciseId,
      exerciseName,
      workoutId,
      workoutName,
      planId,
      durationSeconds,
      durationMs,
      remainingMs: durationMs,
      status: "running",
      targetEndAt: Date.now() + durationMs
    });
  }

  function handleNavigateToTimerExercise() {
    if (!activeTimer) {
      return;
    }

    const { planId, workoutId } = activeTimer;

    if (gymData && gymData.activePlanId !== planId) {
      persistNextData({ ...gymData, activePlanId: planId });
    }

    setIsPlanOpen(true);
    setSelectedWorkoutId(workoutId);
    setIsExerciseFormOpen(false);
    setEditingWorkoutId(null);
    setIsNewWorkoutFormOpen(false);
  }

  function handleBarTimerPause() {
    if (activeTimer) handlePauseRestTimer(activeTimer.exerciseId);
  }

  function handleBarTimerResume() {
    if (activeTimer) handleResumeRestTimer(activeTimer.exerciseId);
  }

  function handleBarTimerReset() {
    if (activeTimer) handleResetRestTimer(activeTimer.exerciseId);
  }

  function handlePauseRestTimer(exerciseId) {
    setActiveTimer((currentTimer) => {
      if (!currentTimer || currentTimer.exerciseId !== exerciseId || currentTimer.status !== "running") {
        return currentTimer;
      }

      return {
        ...currentTimer,
        remainingMs: Math.max(0, currentTimer.targetEndAt - Date.now()),
        status: "paused",
        targetEndAt: null
      };
    });
  }

  function handleResumeRestTimer(exerciseId) {
    setActiveTimer((currentTimer) => {
      if (!currentTimer || currentTimer.exerciseId !== exerciseId || currentTimer.status !== "paused") {
        return currentTimer;
      }

      return {
        ...currentTimer,
        status: "running",
        targetEndAt: Date.now() + currentTimer.remainingMs
      };
    });
  }

  function handleResetRestTimer(exerciseId) {
    setActiveTimer((currentTimer) => {
      if (!currentTimer || currentTimer.exerciseId !== exerciseId) {
        return currentTimer;
      }

      return null;
    });
  }

  function handleCreatePlan(event) {
    event.preventDefault();

    const trimmedName = planName.trim();

    if (!trimmedName) {
      return;
    }

    const now = new Date().toISOString();
    const nextPlan = {
      id: createId(),
      name: trimmedName,
      createdAt: now,
      updatedAt: now,
      workouts: []
    };
    const nextData = {
      activePlanId: nextPlan.id,
      plans: [...plans, nextPlan]
    };

    persistNextData(nextData);
    setIsPlanOpen(true);
    setIsNewPlanFormOpen(false);
    setSelectedWorkoutId(null);
    setActiveTimer(null);
    setIsRenamingPlan(false);
    setPlanNameBeforeRename(null);
    setPlanName("");
  }

  function handleOpenPlan(planId) {
    const nextData = {
      activePlanId: planId,
      plans
    };

    persistNextData(nextData);
    setIsPlanOpen(true);
    setIsNewPlanFormOpen(false);
    setIsRenamingPlan(false);
    setPlanNameBeforeRename(null);
    setSelectedWorkoutId(null);
    if (activeTimer?.planId !== planId) {
      setActiveTimer(null);
    }
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
    setWorkoutNameBeforeRename(null);
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setPdfError("");
  }

  async function handleDeletePlan(planId) {
    const planToDelete = plans.find((plan) => plan.id === planId);

    if (!planToDelete) {
      return;
    }

    const confirmed = window.confirm("Vuoi eliminare questa scheda e tutti i suoi dati?");

    if (!confirmed) {
      return;
    }

    const now = new Date().toISOString();
    const nextPlans = plans.filter((plan) => plan.id !== planId);
    const nextActivePlanId =
      gymData?.activePlanId === planId ? nextPlans[0]?.id ?? null : gymData?.activePlanId ?? nextPlans[0]?.id ?? null;

    const nextData = {
      activePlanId: nextActivePlanId,
      activeSession: activeSession?.planId === planId ? null : gymData?.activeSession ?? null,
      activeSessionUpdatedAt: activeSession?.planId === planId ? now : gymData?.activeSessionUpdatedAt,
      completedActiveSessionIds:
        activeSession?.planId === planId
          ? addDeletedId(gymData?.completedActiveSessionIds, activeSession.id, now)
          : gymData?.completedActiveSessionIds,
      deletedPlanIds: addDeletedId(gymData?.deletedPlanIds, planId, now),
      plans: nextPlans
    };

    persistNextData(nextData);

    if (activePlan?.id === planId) {
      setIsPlanOpen(false);
      setSelectedWorkoutId(null);
      setActiveTimer(null);
      setIsRenamingPlan(false);
      setPlanNameBeforeRename(null);
      setIsNewWorkoutFormOpen(false);
      setEditingWorkoutId(null);
      setWorkoutNameBeforeRename(null);
    }

    showLocalActionStatus("Scheda rimossa. Salvataggio...");

    try {
      await flushRequiredCloudSave();
    } catch (err) {
      setSaveWarning(err?.message ?? "Scheda rimossa in memoria. Cloud non disponibile, ritento più avanti.");
      return;
    }

    if (planToDelete.cloudPdf?.key) {
      try {
        rememberRemoteUpdatedAt(await deletePlanPdf(auth?.token, planToDelete.id));
      } catch (err) {
        setSaveWarning(err?.message ?? "Scheda eliminata. Non è stato possibile completare il cleanup del PDF.");
        return;
      }
    }

    setSaveWarning("");
  }

  function handleDuplicatePlan(planId) {
    const planToDuplicate = plans.find((plan) => plan.id === planId);

    if (!planToDuplicate) {
      return;
    }

    const now = new Date().toISOString();
    const duplicatedPlan = {
      id: createId(),
      name: `${planToDuplicate.name || "Scheda senza nome"} copia`,
      createdAt: now,
      updatedAt: now,
      workouts: planToDuplicate.workouts.map((workout) => ({
        id: createId(),
        name: workout.name,
        createdAt: now,
        updatedAt: now,
        pdfPage: workout.pdfPage,
        exercises: workout.exercises.map((exercise) => ({
          id: createId(),
          name: exercise.name,
          sets: exercise.sets,
          reps: exercise.reps,
          weight: "",
          rest: exercise.rest,
          notes: "",
          createdAt: now,
          updatedAt: now
        }))
      }))
    };

    persistNextData({
      activePlanId: duplicatedPlan.id,
      plans: [...plans, duplicatedPlan]
    });
    setIsPlanOpen(true);
    setIsNewPlanFormOpen(false);
    setIsRenamingPlan(false);
    setPlanNameBeforeRename(null);
    setSelectedWorkoutId(null);
    setActiveTimer(null);
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
    setWorkoutNameBeforeRename(null);
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setPdfError("");
    setIsPdfVisible(false);
    showLocalActionStatus("Scheda duplicata. Salvataggio...");
  }

  function handleBackToPlans() {
    setIsPlanOpen(false);
    setSelectedWorkoutId(null);
    setIsRenamingPlan(false);
    setPlanNameBeforeRename(null);
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
    setWorkoutNameBeforeRename(null);
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setPdfError("");
  }

  function handleCancelCreatePlan() {
    setPlanName("");
    setIsNewPlanFormOpen(false);
  }

  function handleCreateWorkout(event) {
    event.preventDefault();

    if (!activePlan) {
      return;
    }

    const trimmedName = workoutName.trim();

    if (!trimmedName) {
      return;
    }

    const nextWorkout = {
      id: createId(),
      name: trimmedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      pdfPage: null,
      exercises: []
    };

    const nextPlan = {
      ...activePlan,
      updatedAt: new Date().toISOString(),
      workouts: [...activePlan.workouts, nextWorkout]
    };

    persistNextActivePlan(nextPlan);
    setWorkoutName("");
    setIsNewWorkoutFormOpen(false);
    showLocalActionStatus("Allenamento creato. Salvataggio...");
  }

  function handleCancelCreateWorkout() {
    setWorkoutName("");
    setIsNewWorkoutFormOpen(false);
  }

  function handlePlanNameChange(value) {
    if (!activePlan) {
      return;
    }

    const nextPlan = {
      ...activePlan,
      name: value,
      updatedAt: new Date().toISOString()
    };

    persistNextActivePlan(nextPlan);
    showLocalActionStatus();
  }

  function handleStartPlanRename() {
    if (!activePlan) {
      return;
    }

    setPlanNameBeforeRename(activePlan.name);
    setIsRenamingPlan(true);
  }

  function handleFinishPlanRename() {
    setPlanNameBeforeRename(null);
    setIsRenamingPlan(false);
  }

  function handleCancelPlanRename() {
    if (activePlan && planNameBeforeRename !== null) {
      handlePlanNameChange(planNameBeforeRename);
    }

    setPlanNameBeforeRename(null);
    setIsRenamingPlan(false);
  }

  function handleWorkoutNameChange(workoutId, value) {
    if (!activePlan) {
      return;
    }

    const nextPlan = updateWorkoutInPlan(activePlan, workoutId, (workout) => ({
      ...workout,
      name: value,
      updatedAt: new Date().toISOString()
    }));

    persistNextActivePlan({
      ...nextPlan,
      updatedAt: new Date().toISOString()
    });
    showLocalActionStatus();
  }

  function handleStartWorkoutRename(workoutId) {
    const workoutToRename = activePlan?.workouts.find((workout) => workout.id === workoutId);

    if (!workoutToRename) {
      return;
    }

    setWorkoutNameBeforeRename({
      id: workoutId,
      name: workoutToRename.name
    });
    setEditingWorkoutId(workoutId);
  }

  function handleFinishWorkoutRename() {
    setWorkoutNameBeforeRename(null);
    setEditingWorkoutId(null);
  }

  function handleCancelWorkoutRename() {
    if (workoutNameBeforeRename) {
      handleWorkoutNameChange(workoutNameBeforeRename.id, workoutNameBeforeRename.name);
    }

    setWorkoutNameBeforeRename(null);
    setEditingWorkoutId(null);
  }

  function handleDeleteWorkout(workoutId) {
    if (!activePlan) {
      return;
    }

    const confirmed = window.confirm("Vuoi eliminare questo allenamento e tutti i suoi esercizi?");

    if (!confirmed) {
      return;
    }

    const now = new Date().toISOString();
    const nextPlan = {
      ...activePlan,
      updatedAt: now,
      deletedWorkoutIds: addDeletedId(activePlan.deletedWorkoutIds, workoutId, now),
      workouts: activePlan.workouts.filter((workout) => workout.id !== workoutId)
    };

    if (selectedWorkoutId === workoutId) {
      setSelectedWorkoutId(null);
    }

    if (editingWorkoutId === workoutId) {
      setEditingWorkoutId(null);
      setWorkoutNameBeforeRename(null);
    }

    if (activeSession?.workoutId === workoutId) {
      persistNextData({
        ...gymData,
        activeSession: null,
        activeSessionUpdatedAt: now,
        plans: gymData.plans.map((plan) => (plan.id === nextPlan.id ? nextPlan : plan))
      });
    } else {
      persistNextActivePlan(nextPlan);
    }
    showLocalActionStatus("Allenamento eliminato. Salvataggio...");
  }

  async function handleResetData() {
    const confirmed = window.confirm("Vuoi cancellare tutte le schede e tutti i dati salvati nel cloud?");

    if (!confirmed) {
      return;
    }

    const now = new Date().toISOString();
    const nextData = {
      activePlanId: null,
      activeSession: null,
      activeSessionUpdatedAt: now,
      completedActiveSessionIds: activeSession?.id
        ? addDeletedId(gymData?.completedActiveSessionIds, activeSession.id, now)
        : gymData?.completedActiveSessionIds ?? [],
      deletedPlanIds: [
        ...(gymData?.deletedPlanIds ?? []),
        ...plans.map((plan) => ({ id: plan.id, deletedAt: now }))
      ],
      resetAt: now,
      plans: []
    };

    const plansWithPdf = plans.filter((plan) => plan.cloudPdf?.key);

    persistNextData(nextData);
    setIsPlanOpen(false);
    setIsNewPlanFormOpen(false);
    setIsRenamingPlan(false);
    setPlanNameBeforeRename(null);
    setSelectedWorkoutId(null);
    setPlanName("");
    setWorkoutName("");
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
    setWorkoutNameBeforeRename(null);
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setPdfError("");
    setIsPdfVisible(false);
    showLocalActionStatus("Dati resettati. Salvataggio...");

    try {
      await flushRequiredCloudSave();
    } catch (err) {
      setSaveWarning(err?.message ?? "Reset applicato in memoria. Cloud non disponibile, ritento più avanti.");
      return;
    }

    const cleanupResults = await Promise.allSettled(plansWithPdf.map((plan) => deletePlanPdf(auth?.token, plan.id)));
    cleanupResults.forEach((result) => {
      if (result.status === "fulfilled") {
        rememberRemoteUpdatedAt(result.value);
      }
    });

    if (cleanupResults.some((result) => result.status === "rejected")) {
      setSaveWarning("Reset salvato. Non è stato possibile completare il cleanup di tutti i PDF.");
      return;
    }

    setSaveWarning("");
  }

  async function handlePdfFileChange(event) {
    if (!activePlan) {
      return;
    }

    const file = event.target.files?.[0];
    event.target.value = "";
    setPdfError("");

    if (!file) {
      return;
    }

    if (!isPdfFile(file)) {
      setPdfError("Seleziona un file PDF.");
      return;
    }

    const cloudPdfUpdatedAt = new Date().toISOString();

    try {
      await flushRequiredCloudSave();
      const uploadResult = await uploadPlanPdf(auth?.token, activePlan.id, file);
      rememberRemoteUpdatedAt(uploadResult);
      const cloudPdf = uploadResult.cloudPdf;

      const nextPlan = {
        ...activePlan,
        cloudPdf,
        pdfDeletedAt: undefined,
        updatedAt: cloudPdfUpdatedAt
      };

      persistNextActivePlan(nextPlan);
      showLocalActionStatus("PDF caricato nel cloud. Salvataggio scheda...");
    } catch (err) {
      setPdfError(err?.message ?? "Non è stato possibile salvare il PDF.");
    }
  }

  async function handleRemovePdf() {
    if (!hasPlanPdf(activePlan)) {
      return;
    }

    const confirmed = window.confirm("Vuoi rimuovere il PDF dal cloud?");

    if (!confirmed) {
      return;
    }

    try {
      await flushRequiredCloudSave();
      const deleteResult = await deletePlanPdf(auth?.token, activePlan.id);
      rememberRemoteUpdatedAt(deleteResult);
    } catch (err) {
      setPdfError(err?.message ?? "Non è stato possibile rimuovere il PDF.");
      return;
    }

    const { cloudPdf, ...planWithoutPdf } = activePlan;
    const nextPlan = {
      ...planWithoutPdf,
      pdfDeletedAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    persistNextActivePlan(nextPlan);
    setIsPdfVisible(false);
    showLocalActionStatus("PDF rimosso dal cloud. Salvataggio scheda...");
  }

  function handleWorkoutPdfPageChange(workoutId, value) {
    if (!activePlan) {
      return;
    }

    const parsedPage = typeof value === "number" ? value : Number.parseInt(value, 10);
    const pdfPage = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : null;
    const now = new Date().toISOString();
    const nextPlan = updateWorkoutInPlan(activePlan, workoutId, (workout) => ({
      ...workout,
      pdfPage,
      updatedAt: now
    }));

    persistNextActivePlan({
      ...nextPlan,
      updatedAt: now
    });
    showLocalActionStatus();
  }

  function handleExerciseDraftChange(field, value) {
    setExerciseDraft((currentDraft) => ({
      ...currentDraft,
      [field]: value
    }));

    if (field === "name" && value.trim()) {
      setExerciseError("");
    }
  }

  function handleAddExercise(event) {
    event.preventDefault();

    if (!activePlan || !selectedWorkout) {
      return;
    }

    const trimmedName = exerciseDraft.name.trim();

    if (!trimmedName) {
      setExerciseError("Inserisci il nome esercizio.");
      return;
    }

    const now = new Date().toISOString();
    const nextExercise = {
      id: createId(),
      name: trimmedName,
      sets: normalizeNumericInputValue(exerciseDraft.sets),
      reps: normalizeNumericInputValue(exerciseDraft.reps),
      weight: normalizeNumericInputValue(exerciseDraft.weight),
      rest: normalizeNumericInputValue(exerciseDraft.rest),
      notes: exerciseDraft.notes,
      createdAt: now,
      updatedAt: now
    };

    const nextPlan = updateWorkoutInPlan(activePlan, selectedWorkout.id, (workout) => ({
      ...workout,
      updatedAt: now,
      exercises: [...workout.exercises, nextExercise]
    }));

    persistNextActivePlan({
      ...nextPlan,
      updatedAt: now
    });
    showLocalActionStatus("Esercizio aggiunto. Salvataggio...");
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setIsExerciseFormOpen(false);
  }

  function handleCancelExerciseForm() {
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setIsExerciseFormOpen(false);
  }

  function handleUpdateExercise(exerciseId, field, value) {
    if (!activePlan || !selectedWorkout) {
      return;
    }

    const now = new Date().toISOString();
    const nextPlan = updateWorkoutInPlan(activePlan, selectedWorkout.id, (workout) => ({
      ...workout,
      updatedAt: now,
      exercises: workout.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          [field]: value,
          updatedAt: now
        };
      })
    }));

    persistNextActivePlan({
      ...nextPlan,
      updatedAt: now
    });
    showLocalActionStatus();
  }

  function handleDeleteExercise(exerciseId) {
    if (!activePlan || !selectedWorkout) {
      return;
    }

    const confirmed = window.confirm("Vuoi eliminare questo esercizio?");

    if (!confirmed) {
      return;
    }

    const now = new Date().toISOString();
    const nextPlan = updateWorkoutInPlan(activePlan, selectedWorkout.id, (workout) => ({
      ...workout,
      updatedAt: now,
      deletedExerciseIds: addDeletedId(workout.deletedExerciseIds, exerciseId, now),
      exercises: workout.exercises.filter((exercise) => exercise.id !== exerciseId)
    }));

    let nextSession = activeSession;

    if (activeSession?.completedSetsByExercise?.[exerciseId]) {
      const { [exerciseId]: _removed, ...completedSetsByExercise } = activeSession.completedSetsByExercise;
      nextSession = {
        ...activeSession,
        updatedAt: now,
        completedSetsByExercise
      };
    }

    persistNextData({
      ...gymData,
      activeSession: nextSession,
      activeSessionUpdatedAt: nextSession !== activeSession ? now : gymData?.activeSessionUpdatedAt,
      plans: gymData.plans.map((plan) => (plan.id === nextPlan.id ? { ...nextPlan, updatedAt: now } : plan))
    });
    showLocalActionStatus("Esercizio eliminato. Salvataggio...");
  }

  const timerBar = activeTimer ? (
    <ActiveTimerBar
      activeTimer={activeTimer}
      onNavigate={handleNavigateToTimerExercise}
      onPause={handleBarTimerPause}
      onResume={handleBarTimerResume}
      onReset={handleBarTimerReset}
    />
  ) : null;

  if (!auth) {
    return <AuthScreen onLogin={handleLogin} onRegister={handleRegister} />;
  }

  if (isLoadingData || !gymData) {
    return (
      <main className="app-shell">
        <div className="auth-panel">
          <header className="auth-header">
            <img className="brand-mark" src="/icons/icon-192.png" alt="" aria-hidden="true" />
            <h1>Gym Notes</h1>
          </header>

          {cloudLoadError ? (
            <>
              <p className="account-error">{cloudLoadError}</p>
              <button className="auth-submit" type="button" onClick={() => loadCloudData(auth.token, { verifyToken: true })}>
                Riprova
              </button>
              <button className="auth-switch" type="button" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <p className="account-intro">Connessione al cloud in corso...</p>
          )}
        </div>
      </main>
    );
  }

  if (!isPlanOpen || !activePlan) {
    return (
      <>
        <PlanList
          auth={auth}
          hasTimerBar={!!activeTimer}
          isNewPlanFormOpen={isNewPlanFormOpen}
          onCancelCreatePlan={handleCancelCreatePlan}
          onCreatePlan={handleCreatePlan}
          onDeletePlan={handleDeletePlan}
          onDuplicatePlan={handleDuplicatePlan}
          onLogout={handleLogout}
          onOpenNewPlanForm={() => setIsNewPlanFormOpen(true)}
          onOpenPlan={handleOpenPlan}
          onPlanNameChange={setPlanName}
          planName={planName}
          plans={plans}
          saveStatus={saveStatus}
          saveWarning={saveWarning}
        />
        {timerBar}
      </>
    );
  }

  if (selectedWorkout) {
    return (
      <>
        <WorkoutDetail
          activePlan={activePlan}
          activeSession={activeSession}
          activeTimer={activeTimer}
          authToken={auth?.token}
          editingWorkoutId={editingWorkoutId}
          exerciseDraft={exerciseDraft}
          exerciseError={exerciseError}
          hasTimerBar={!!activeTimer}
          isExerciseFormOpen={isExerciseFormOpen}
          isPdfVisible={isPdfVisible}
          onAddExercise={handleAddExercise}
          onBack={() => setSelectedWorkoutId(null)}
          onCancelExerciseForm={handleCancelExerciseForm}
          onCancelSession={handleCancelSession}
          onCompleteSession={handleCompleteSession}
          onDeleteExercise={handleDeleteExercise}
          onExerciseDraftChange={handleExerciseDraftChange}
          onHidePdf={() => setIsPdfVisible(false)}
          onPauseRestTimer={handlePauseRestTimer}
          onResetRestTimer={handleResetRestTimer}
          onResumeRestTimer={handleResumeRestTimer}
          onShowExerciseForm={() => setIsExerciseFormOpen(true)}
          onShowPdf={() => setIsPdfVisible(true)}
          onStartEditingWorkout={handleStartWorkoutRename}
          onStartRestTimer={handleStartRestTimer}
          onStartSession={handleStartSession}
          onToggleExerciseSet={handleToggleExerciseSet}
          onCancelEditingWorkout={handleCancelWorkoutRename}
          onStopEditingWorkout={handleFinishWorkoutRename}
          onUpdateExercise={handleUpdateExercise}
          onWorkoutNameChange={handleWorkoutNameChange}
          onWorkoutPdfPageChange={handleWorkoutPdfPageChange}
          saveStatus={saveStatus}
          saveWarning={saveWarning}
          selectedWorkout={selectedWorkout}
          sessionFeedback={sessionFeedback}
          todayLabel={todayLabel}
        />
        {timerBar}
      </>
    );
  }

  return (
    <>
      <PlanDetail
        activePlan={activePlan}
        editingWorkoutId={editingWorkoutId}
        hasTimerBar={!!activeTimer}
        isNewWorkoutFormOpen={isNewWorkoutFormOpen}
        isRenamingPlan={isRenamingPlan}
        onBackToPlans={handleBackToPlans}
        onCancelCreateWorkout={handleCancelCreateWorkout}
        onCreateWorkout={handleCreateWorkout}
        onDeleteWorkout={handleDeleteWorkout}
        onFileChange={handlePdfFileChange}
        onCancelPlanRename={handleCancelPlanRename}
        onFinishPlanRename={handleFinishPlanRename}
        onFinishWorkoutRename={handleFinishWorkoutRename}
        onOpenFilePicker={() => pdfInputRef.current?.click()}
        onOpenWorkout={setSelectedWorkoutId}
        onPlanNameChange={handlePlanNameChange}
        onRemovePdf={handleRemovePdf}
        onResetData={handleResetData}
        onStartPlanRename={handleStartPlanRename}
        onShowNewWorkoutForm={() => setIsNewWorkoutFormOpen(true)}
        onStartWorkoutRename={handleStartWorkoutRename}
        onCancelWorkoutRename={handleCancelWorkoutRename}
        onWorkoutNameChange={handleWorkoutNameChange}
        onWorkoutNameInputChange={setWorkoutName}
        pdfError={pdfError}
        pdfInputRef={pdfInputRef}
        saveStatus={saveStatus}
        saveWarning={saveWarning}
        todayLabel={todayLabel}
        workoutName={workoutName}
      />
      {timerBar}
    </>
  );
}

function updateWorkoutInPlan(gymPlan, workoutId, updateWorkout) {
  return {
    ...gymPlan,
    workouts: gymPlan.workouts.map((workout) => {
      if (workout.id !== workoutId) {
        return workout;
      }

      return updateWorkout(workout);
    })
  };
}

function normalizeRemoteData(data) {
  return normalizeGymData(data ?? { activePlanId: null, plans: [] });
}

function hasPlanPdf(plan) {
  return !!plan?.cloudPdf?.key;
}

function playTimerBeep() {
  try {
    const AudioContext = window.AudioContext || window.webkitAudioContext;

    if (!AudioContext) {
      return;
    }

    const audioContext = new AudioContext();
    const oscillator = audioContext.createOscillator();
    const gain = audioContext.createGain();

    oscillator.type = "sine";
    oscillator.frequency.setValueAtTime(880, audioContext.currentTime);
    gain.gain.setValueAtTime(0.0001, audioContext.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.18, audioContext.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, audioContext.currentTime + 0.28);
    oscillator.connect(gain);
    gain.connect(audioContext.destination);
    oscillator.start();
    oscillator.stop(audioContext.currentTime + 0.3);
    window.setTimeout(() => audioContext.close(), 450);
  } catch {
    // Audio feedback is optional and can be blocked by the browser.
  }
}

function notifyTimerFinished() {
  try {
    if (navigator.vibrate) {
      navigator.vibrate([300, 150, 300]);
    }
  } catch {
    // Vibration is optional.
  }

  playTimerBeep();
}

function isPdfFile(file) {
  return file.type === "application/pdf" || file.name.toLowerCase().endsWith(".pdf");
}

export default App;
