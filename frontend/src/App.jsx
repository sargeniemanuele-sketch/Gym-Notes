import React, { useEffect, useMemo, useRef, useState } from "react";
import ActiveSessionBar from "./components/ActiveSessionBar.jsx";
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
import ConfirmDialog from "./components/ConfirmDialog.jsx";
import SyncIndicator from "./components/SyncIndicator.jsx";
import { useConfirm } from "./utils/useConfirm.js";

const emptyExerciseDraft = {
  name: "",
  sets: "",
  reps: "",
  weight: "",
  rest: "",
  notes: ""
};

const EXERCISE_CLIPBOARD_KEY = "gym-notes-exercise-clipboard-v1";

function loadCopiedExercise() {
  try {
    const raw = window.localStorage.getItem(EXERCISE_CLIPBOARD_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function pickExerciseFields(exercise) {
  return {
    name: exercise.name ?? "",
    sets: exercise.sets ?? "",
    reps: exercise.reps ?? "",
    weight: exercise.weight ?? "",
    rest: exercise.rest ?? "",
    notes: exercise.notes ?? ""
  };
}

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
  const [copiedExercise, setCopiedExercise] = useState(() => loadCopiedExercise());
  const [isEditingPlans, setIsEditingPlans] = useState(false);
  const [isEditingWorkouts, setIsEditingWorkouts] = useState(false);
  const [isEditingExercises, setIsEditingExercises] = useState(false);
  const [cloudSaveStatus, setCloudSaveStatus] = useState(CLOUD_SAVE_STATUS.IDLE);
  const [saveWarning, setSaveWarning] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [isPdfVisible, setIsPdfVisible] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const [sessionFeedback, setSessionFeedback] = useState("");
  const [auth, setAuth] = useState(() => loadAuth());
  const [cloudLoadError, setCloudLoadError] = useState("");
  const { confirm, dialogProps } = useConfirm();
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
          (await confirm({
            title: "Modifiche non salvate",
            message: "Alcune modifiche non sono ancora state salvate nel cloud. Uscire comunque?",
            confirmLabel: "Esci",
            tone: "danger"
          }));

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

  async function handleStartSession(workoutId) {
    if (!activePlan) {
      return;
    }

    if (activeSession && activeSession.workoutId !== workoutId) {
      const confirmed = await confirm({
        title: "Sessione già in corso",
        message: "Hai già un allenamento in corso. Vuoi sostituirlo con questo?",
        confirmLabel: "Sostituisci",
        tone: "danger"
      });

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

  async function handleCancelSession() {
    const confirmed = await confirm({
      title: "Annullare la sessione?",
      message: "I progressi non salvati di questo allenamento andranno persi.",
      confirmLabel: "Annulla sessione",
      cancelLabel: "Continua",
      tone: "danger"
    });

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

  function handleResumeSession() {
    if (!activeSession) {
      return;
    }

    const { planId, workoutId } = activeSession;

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
    setPlanName("");
    setIsNewPlanFormOpen(true);
    setIsEditingPlans(true);
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
    setIsEditingPlans(false);
    setIsEditingWorkouts(false);
    setIsEditingExercises(false);
  }

  async function handleDeletePlan(planId) {
    const planToDelete = plans.find((plan) => plan.id === planId);

    if (!planToDelete) {
      return;
    }

    const confirmed = await confirm({
      title: "Eliminare la scheda?",
      message: `"${planToDelete.name || "Scheda senza nome"}" e tutti i suoi allenamenti, esercizi e storico verranno eliminati.`,
      confirmLabel: "Elimina",
      tone: "danger"
    });

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
    setIsEditingPlans(false);
    setIsEditingWorkouts(false);
    setIsEditingExercises(false);
  }

  function handleOpenWorkout(workoutId) {
    setSelectedWorkoutId(workoutId);
    setIsEditingExercises(false);
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
  }

  function handleBackToPlanDetail() {
    setSelectedWorkoutId(null);
    setIsEditingExercises(false);
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
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

  async function handleDeleteWorkout(workoutId) {
    if (!activePlan) {
      return;
    }

    const workoutToDelete = activePlan.workouts.find((workout) => workout.id === workoutId);
    const confirmed = await confirm({
      title: "Eliminare l'allenamento?",
      message: `"${workoutToDelete?.name || "Allenamento senza nome"}" e tutti i suoi esercizi verranno eliminati.`,
      confirmLabel: "Elimina",
      tone: "danger"
    });

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
  }

  async function handleResetData() {
    const confirmed = await confirm({
      title: "Cancellare tutti i dati?",
      message: "Tutte le schede, gli allenamenti e lo storico verranno eliminati definitivamente dal cloud. Digita RESET per confermare.",
      confirmLabel: "Cancella tutto",
      requireText: "RESET",
      tone: "danger"
    });

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
    } catch (err) {
      setPdfError(err?.message ?? "Non è stato possibile salvare il PDF.");
    }
  }

  async function handleRemovePdf() {
    if (!hasPlanPdf(activePlan)) {
      return;
    }

    const confirmed = await confirm({
      title: "Rimuovere il PDF?",
      message: "Il PDF di riferimento verrà rimosso dal cloud per questa scheda.",
      confirmLabel: "Rimuovi",
      tone: "danger"
    });

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
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
  }

  function handleCopyExercise(exerciseId) {
    const exercise = selectedWorkout?.exercises.find((item) => item.id === exerciseId);

    if (!exercise) {
      return;
    }

    const snapshot = pickExerciseFields(exercise);
    setCopiedExercise(snapshot);

    try {
      window.localStorage.setItem(EXERCISE_CLIPBOARD_KEY, JSON.stringify(snapshot));
    } catch {
      // Persisting the clipboard is best-effort; in-memory copy still works.
    }

    showSessionFeedback("Esercizio copiato ✓");
  }

  function handlePasteExercise() {
    if (!copiedExercise || !activePlan || !selectedWorkout) {
      return;
    }

    const now = new Date().toISOString();
    const nextExercise = {
      id: createId(),
      name: copiedExercise.name,
      sets: copiedExercise.sets,
      reps: copiedExercise.reps,
      weight: copiedExercise.weight,
      rest: copiedExercise.rest,
      notes: copiedExercise.notes,
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
    showSessionFeedback("Esercizio incollato ✓");
  }

  function handleCancelExerciseForm() {
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setIsExerciseFormOpen(false);
  }

  function handleToggleEditPlans() {
    if (isEditingPlans) {
      setIsNewPlanFormOpen(false);
      setPlanName("");
    }
    setIsEditingPlans(!isEditingPlans);
  }

  function handleToggleEditWorkouts() {
    if (isEditingWorkouts) {
      setIsNewWorkoutFormOpen(false);
      setWorkoutName("");
      setEditingWorkoutId(null);
      setWorkoutNameBeforeRename(null);
    }
    setIsEditingWorkouts(!isEditingWorkouts);
  }

  function handleToggleEditExercises() {
    if (isEditingExercises) {
      setIsExerciseFormOpen(false);
      setExerciseDraft(emptyExerciseDraft);
      setExerciseError("");
      if (editingWorkoutId === selectedWorkout?.id) {
        handleCancelWorkoutRename();
      }
    }
    setIsEditingExercises(!isEditingExercises);
  }

  function handleReorderExercises(fromIndex, toIndex) {
    if (!activePlan || !selectedWorkout || fromIndex === toIndex) {
      return;
    }

    const now = new Date().toISOString();
    const nextPlan = updateWorkoutInPlan(activePlan, selectedWorkout.id, (workout) => {
      const exercises = [...workout.exercises];
      const [moved] = exercises.splice(fromIndex, 1);

      if (!moved) {
        return workout;
      }

      exercises.splice(toIndex, 0, moved);
      return { ...workout, updatedAt: now, exercises };
    });

    persistNextActivePlan({ ...nextPlan, updatedAt: now });
  }

  function handleReorderWorkouts(fromIndex, toIndex) {
    if (!activePlan || fromIndex === toIndex) {
      return;
    }

    const workouts = [...activePlan.workouts];
    const [moved] = workouts.splice(fromIndex, 1);

    if (!moved) {
      return;
    }

    const now = new Date().toISOString();
    workouts.splice(toIndex, 0, moved);
    persistNextActivePlan({ ...activePlan, workouts, updatedAt: now });
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
  }

  async function handleDeleteExercise(exerciseId) {
    if (!activePlan || !selectedWorkout) {
      return;
    }

    const confirmed = await confirm({
      title: "Eliminare l'esercizio?",
      message: "L'esercizio verrà rimosso da questo allenamento.",
      confirmLabel: "Elimina",
      tone: "danger"
    });

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
  }

  const sessionPlan = activeSession ? plans.find((plan) => plan.id === activeSession.planId) : null;
  const sessionWorkout = sessionPlan?.workouts.find((workout) => workout.id === activeSession?.workoutId) ?? null;
  const viewingSessionWorkout =
    isPlanOpen &&
    !!selectedWorkout &&
    selectedWorkout.id === activeSession?.workoutId &&
    activePlan?.id === activeSession?.planId;
  const showSessionBar = !!activeSession && !activeTimer && !viewingSessionWorkout;
  const hasBar = !!activeTimer || showSessionBar;

  const overlays = (
    <>
      {activeTimer ? (
        <ActiveTimerBar
          activeTimer={activeTimer}
          onNavigate={handleNavigateToTimerExercise}
          onPause={handleBarTimerPause}
          onResume={handleBarTimerResume}
          onReset={handleBarTimerReset}
        />
      ) : null}
      {showSessionBar ? (
        <ActiveSessionBar
          startedAt={activeSession.startedAt}
          workoutName={sessionWorkout?.name}
          planName={sessionPlan?.name}
          onResume={handleResumeSession}
        />
      ) : null}
      <SyncIndicator status={cloudSaveStatus} />
      <ConfirmDialog {...dialogProps} />
    </>
  );

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
          hasTimerBar={hasBar}
          isEditing={isEditingPlans}
          isNewPlanFormOpen={isNewPlanFormOpen}
          onCancelCreatePlan={handleCancelCreatePlan}
          onCreatePlan={handleCreatePlan}
          onDeletePlan={handleDeletePlan}
          onDuplicatePlan={handleDuplicatePlan}
          onLogout={handleLogout}
          onOpenNewPlanForm={() => setIsNewPlanFormOpen(true)}
          onOpenPlan={handleOpenPlan}
          onPlanNameChange={setPlanName}
          onResetData={handleResetData}
          onToggleEdit={handleToggleEditPlans}
          planName={planName}
          plans={plans}
          saveWarning={saveWarning}
        />
        {overlays}
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
          copiedExercise={copiedExercise}
          editingWorkoutId={editingWorkoutId}
          exerciseDraft={exerciseDraft}
          exerciseError={exerciseError}
          hasTimerBar={hasBar}
          isEditing={isEditingExercises}
          isExerciseFormOpen={isExerciseFormOpen}
          isPdfVisible={isPdfVisible}
          onAddExercise={handleAddExercise}
          onBack={handleBackToPlanDetail}
          onCancelExerciseForm={handleCancelExerciseForm}
          onCancelSession={handleCancelSession}
          onCompleteSession={handleCompleteSession}
          onCopyExercise={handleCopyExercise}
          onDeleteExercise={handleDeleteExercise}
          onPasteExercise={handlePasteExercise}
          onReorderExercises={handleReorderExercises}
          onToggleEdit={handleToggleEditExercises}
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
          saveWarning={saveWarning}
          selectedWorkout={selectedWorkout}
          sessionFeedback={sessionFeedback}
          todayLabel={todayLabel}
        />
        {overlays}
      </>
    );
  }

  return (
    <>
      <PlanDetail
        activePlan={activePlan}
        editingWorkoutId={editingWorkoutId}
        hasTimerBar={hasBar}
        isEditing={isEditingWorkouts}
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
        onOpenWorkout={handleOpenWorkout}
        onPlanNameChange={handlePlanNameChange}
        onRemovePdf={handleRemovePdf}
        onReorderWorkouts={handleReorderWorkouts}
        onStartPlanRename={handleStartPlanRename}
        onShowNewWorkoutForm={() => setIsNewWorkoutFormOpen(true)}
        onStartWorkoutRename={handleStartWorkoutRename}
        onToggleEdit={handleToggleEditWorkouts}
        onCancelWorkoutRename={handleCancelWorkoutRename}
        onWorkoutNameChange={handleWorkoutNameChange}
        onWorkoutNameInputChange={setWorkoutName}
        pdfError={pdfError}
        pdfInputRef={pdfInputRef}
        saveWarning={saveWarning}
        todayLabel={todayLabel}
        workoutName={workoutName}
      />
      {overlays}
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
