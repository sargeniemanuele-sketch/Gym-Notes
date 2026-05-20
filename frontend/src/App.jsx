import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import ActiveTimerBar from "./components/ActiveTimerBar.jsx";
import PlanDetail from "./components/PlanDetail.jsx";
import PlanList from "./components/PlanList.jsx";
import WorkoutDetail from "./components/WorkoutDetail.jsx";
import {
  deletePdfFile,
  deletePlanPdfReference,
  getAllPlanPdfReferences,
  savePdfFile,
  savePlanPdfReference
} from "./pdfStorage.js";
import {
  clearActiveSessionCache,
  createId,
  loadActiveSessionCache,
  loadGymDataCache,
  normalizeGymData,
  saveActiveSessionCache,
  saveGymDataCache
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
import AuthScreen from "./components/AuthScreen.jsx";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

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
  const [saveWarning, setSaveWarning] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [isPdfVisible, setIsPdfVisible] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const [activeSession, setActiveSession] = useState(null);
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
    if (!auth?.user || !gymData || activeSession) {
      return;
    }

    const cachedSession = loadActiveSessionCache(auth.user);

    if (!cachedSession || !isActiveSessionValid(cachedSession, gymData)) {
      clearActiveSessionCache(auth.user);
      return;
    }

    setActiveSession(cachedSession);
    setSessionFeedback("Sessione in corso recuperata");
  }, [auth?.user, gymData, activeSession]);

  useEffect(() => {
    if (selectedWorkoutId && hasPlanPdf(activePlan)) {
      setIsPdfVisible(true);
    }
  }, [activePlan?.cloudPdf?.key, activePlan?.pdfId, selectedWorkoutId]);

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
    setGymData(await mergeLocalPdfReferences(normalizedData));
  }

  function persistNextData(nextData) {
    const normalizedData = normalizeRemoteData({
      deletedPlanIds: gymData?.deletedPlanIds ?? [],
      resetAt: gymData?.resetAt,
      ...nextData
    });
    applyGymData(normalizedData);
    saveGymDataCache(auth?.user, normalizedData, {
      hasPendingChanges: true,
      remoteUpdatedAt: lastCloudUpdatedAtRef.current
    });
    scheduleCloudSave(normalizedData);
  }

  function scheduleCloudSave(nextData) {
    pendingCloudDataRef.current = nextData;
    cloudSaveTokenRef.current = auth?.token ?? null;

    if (cloudSaveTimerRef.current) clearTimeout(cloudSaveTimerRef.current);
    cloudSaveTimerRef.current = setTimeout(flushCloudSave, 1200);
  }

  async function flushCloudSave() {
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
          saveGymDataCache(auth?.user, nextData, {
            hasPendingChanges: false,
            remoteUpdatedAt: lastCloudUpdatedAtRef.current
          });
        } catch (err) {
          if (err.status === 409 && err.payload?.data) {
            lastCloudUpdatedAtRef.current = err.payload.updatedAt ?? lastCloudUpdatedAtRef.current;
            const mergedData = mergeGymData(err.payload.data, nextData);
            const mergedWithLocalPdfRefs = await mergeLocalPdfReferences(mergedData);
            setGymData(mergedWithLocalPdfRefs);
            saveGymDataCache(auth?.user, mergedWithLocalPdfRefs, {
              hasPendingChanges: true,
              remoteUpdatedAt: lastCloudUpdatedAtRef.current
            });
            pendingCloudDataRef.current = mergedWithLocalPdfRefs;
            setSaveWarning("Dati aggiornati da un altro dispositivo: ho unito le modifiche e riprovo il salvataggio.");
            continue;
          }

          throw err;
        }
      }

      setSaveWarning((current) =>
        current.startsWith("Cloud non disponibile") ? "" : current
      );
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
        pendingCloudDataRef.current = null;
        setSaveWarning("Sessione scaduta. Accedi di nuovo per sincronizzare.");
        return;
      }

      if (!pendingCloudDataRef.current && lastAttemptedData) {
        pendingCloudDataRef.current = lastAttemptedData;
      }

      if (lastAttemptedData) {
        saveGymDataCache(auth?.user, lastAttemptedData, {
          hasPendingChanges: true,
          remoteUpdatedAt: lastCloudUpdatedAtRef.current
        });
      }

      setSaveWarning("Cloud non disponibile. Le modifiche restano in memoria e verranno risincronizzate più avanti.");
    } finally {
      cloudSaveInFlightRef.current = false;
      cloudSavePromiseRef.current = null;
    }
  }

  async function flushRequiredCloudSave() {
    await flushCloudSave();

    if (pendingCloudDataRef.current) {
      throw new Error("Cloud non disponibile. Riprova tra poco.");
    }
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

  function showSavedStatus(message = "Salvato automaticamente") {
    setSaveStatus(message);

    if (saveStatusTimeoutRef.current) {
      window.clearTimeout(saveStatusTimeoutRef.current);
    }

    saveStatusTimeoutRef.current = window.setTimeout(() => {
      setSaveStatus("");
    }, 1800);
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

  async function loadCloudData(token, { userOverride = null, verifyToken = false } = {}) {
    setIsLoadingData(true);
    setCloudLoadError("");
    setSaveWarning("");

    let cacheUser = userOverride ?? auth?.user;
    let cached = loadGymDataCache(cacheUser);

    if (cached?.data) {
      lastCloudUpdatedAtRef.current = cached.remoteUpdatedAt;
      await applyCloudGymData(cached.data);
    }

    try {
      if (verifyToken) {
        const currentUser = await getMe(token);
        const nextAuth = { token, user: currentUser.user };
        saveAuth(nextAuth);
        setAuth(nextAuth);
        cacheUser = currentUser.user;
        cached = loadGymDataCache(cacheUser) ?? cached;

        if (cached?.data) {
          lastCloudUpdatedAtRef.current = cached.remoteUpdatedAt;
          await applyCloudGymData(cached.data);
        }
      }

      const remote = await getRemoteGymData(token);
      lastCloudUpdatedAtRef.current = remote.updatedAt ?? null;
      const remoteData = remote.data ?? { activePlanId: null, plans: [] };

      if (cached?.hasPendingChanges && cached.data) {
        const mergedData = mergeGymData(remoteData, cached.data);
        const mergedWithLocalPdfRefs = await mergeLocalPdfReferences(mergedData);
        setGymData(mergedWithLocalPdfRefs);
        saveGymDataCache(cacheUser, mergedWithLocalPdfRefs, {
          hasPendingChanges: true,
          remoteUpdatedAt: lastCloudUpdatedAtRef.current
        });
        pendingCloudDataRef.current = mergedWithLocalPdfRefs;
        cloudSaveTokenRef.current = token;
        flushCloudSave();
        showSavedStatus("Dati locali recuperati");
      } else {
        await applyCloudGymData(remoteData);
        saveGymDataCache(cacheUser, remoteData, {
          hasPendingChanges: false,
          remoteUpdatedAt: lastCloudUpdatedAtRef.current
        });
        showSavedStatus("Dati cloud caricati");
      }

      return true;
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
        setGymData(null);
        return false;
      }

      if (cached?.data) {
        await applyCloudGymData(cached.data);
        setSaveWarning("Cloud non disponibile. Uso i dati salvati su questo dispositivo e riprovo la sincronizzazione.");
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
      saveGymDataCache(auth?.user, remoteData, {
        hasPendingChanges: false,
        remoteUpdatedAt: lastCloudUpdatedAtRef.current
      });
      setSaveWarning("");
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
    const loaded = await loadCloudData(result.token, { userOverride: result.user });
    if (loaded) saveAuth(result);
  }

  async function handleRegister(email, password) {
    const result = await apiRegister(email, password);
    setAuth(result);
    const loaded = await loadCloudData(result.token, { userOverride: result.user });
    if (loaded) saveAuth(result);
  }

  function handleLogout() {
    clearActiveSessionCache(auth?.user);

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
    setActiveSession(null);
    isCompletingSessionRef.current = false;
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

    const nextSession = {
      workoutId,
      planId: activePlan.id,
      startedAt: new Date().toISOString(),
      completedSetsByExercise: {}
    };

    setActiveSession(nextSession);
    saveActiveSessionCache(auth?.user, nextSession);
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
      id: createId(),
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

    persistNextActivePlan(nextPlan);
    setActiveSession(null);
    clearActiveSessionCache(auth?.user);
    showSessionFeedback("Allenamento completato ✓");
  }

  function handleToggleExerciseSet(exerciseId, setNumber) {
    if (!activeSession) {
      return;
    }

    setActiveSession((prev) => {
      const current = prev.completedSetsByExercise?.[exerciseId] ?? [];
      const isCompleted = current.includes(setNumber);
      const next = isCompleted
        ? current.filter((n) => n !== setNumber)
        : [...current, setNumber].sort((a, b) => a - b);

      const nextSession = {
        ...prev,
        completedSetsByExercise: {
          ...prev.completedSetsByExercise,
          [exerciseId]: next
        }
      };

      saveActiveSessionCache(auth?.user, nextSession);
      return nextSession;
    });
  }

  function handleCancelSession() {
    const confirmed = window.confirm("Vuoi annullare questa sessione?");

    if (!confirmed) {
      return;
    }

    setActiveSession(null);
    clearActiveSessionCache(auth?.user);
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

  function handleDeletePlan(planId) {
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
      deletedPlanIds: addDeletedId(gymData?.deletedPlanIds, planId, now),
      plans: nextPlans
    };

    persistNextData(nextData);

    if (activeSession?.planId === planId) {
      setActiveSession(null);
      clearActiveSessionCache(auth?.user);
    }

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

    setSaveWarning("");
    showSavedStatus("Scheda eliminata");

    if (hasPlanPdf(planToDelete)) {
      Promise.resolve()
        .then(() => flushRequiredCloudSave())
        .then(() =>
          Promise.all([
            planToDelete.pdfId ? deletePdfFile(planToDelete.pdfId) : Promise.resolve(),
            deletePlanPdfReference(planToDelete.id),
            planToDelete.cloudPdf
              ? deletePlanPdf(auth?.token, planToDelete.id, planToDelete.cloudPdf.key)
              : Promise.resolve()
          ])
        )
        .then((results) => {
          results.forEach(rememberRemoteUpdatedAt);
          scheduleCloudSave(nextData);
        })
        .catch(() => {
          setSaveWarning("La scheda è stata rimossa dalla vista, ma il PDF non è stato cancellato dal cloud. Riprova.");
        });
    }
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
    showSavedStatus("Scheda duplicata");
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
    showSavedStatus("Allenamento creato");
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
    showSavedStatus();
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
    showSavedStatus();
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

    if (activeSession?.workoutId === workoutId) {
      setActiveSession(null);
      clearActiveSessionCache(auth?.user);
    }

    if (editingWorkoutId === workoutId) {
      setEditingWorkoutId(null);
      setWorkoutNameBeforeRename(null);
    }

    persistNextActivePlan(nextPlan);
    showSavedStatus("Allenamento eliminato");
  }

  function handleResetData() {
    const confirmed = window.confirm("Vuoi cancellare tutte le schede e tutti i dati salvati nel cloud?");

    if (!confirmed) {
      return;
    }

    const pdfIds = [...new Set(plans.map((plan) => plan.pdfId).filter(Boolean))];

    const now = new Date().toISOString();
    const nextData = {
      activePlanId: null,
      deletedPlanIds: [
        ...(gymData?.deletedPlanIds ?? []),
        ...plans.map((plan) => ({ id: plan.id, deletedAt: now }))
      ],
      resetAt: now,
      plans: []
    };
    persistNextData(nextData);
    setIsPlanOpen(false);
    setIsNewPlanFormOpen(false);
    setIsRenamingPlan(false);
    setPlanNameBeforeRename(null);
    setSelectedWorkoutId(null);
    setActiveSession(null);
    clearActiveSessionCache(auth?.user);
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
    showSavedStatus("Dati resettati");
    setSaveWarning("");

    if (pdfIds.length > 0 || plans.length > 0) {
      Promise.resolve()
        .then(() => flushRequiredCloudSave())
        .then(() =>
          Promise.all([
            ...pdfIds.map((pdfId) => deletePdfFile(pdfId)),
            ...plans.map((plan) => deletePlanPdfReference(plan.id)),
            ...plans
              .filter((plan) => plan.cloudPdf)
              .map((plan) => deletePlanPdf(auth?.token, plan.id, plan.cloudPdf.key))
          ])
        )
        .then((results) => {
          results.forEach(rememberRemoteUpdatedAt);
          scheduleCloudSave(nextData);
        })
        .catch(() => {
          setSaveWarning("I dati sono stati rimossi dalla vista, ma non tutti i PDF sono stati cancellati dal cloud. Riprova.");
        });
    }
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

    const pdfId = createId();
    const pdfUpdatedAt = new Date().toISOString();

    try {
      await flushRequiredCloudSave();
      const uploadResult = await uploadPlanPdf(auth?.token, activePlan.id, file);
      rememberRemoteUpdatedAt(uploadResult);
      const cloudPdf = uploadResult.cloudPdf;
      const localPdfId = cloudPdf?.key ?? pdfId;
      await savePdfFile(localPdfId, file);

      if (activePlan.pdfId) {
        try {
          await deletePdfFile(activePlan.pdfId);
        } catch {
          // The plan will point to the new PDF, so an old orphan can be ignored.
        }
      }

      const nextPlan = {
        ...activePlan,
        cloudPdf,
        pdfId: localPdfId,
        pdfName: file.name,
        pdfSize: file.size,
        pdfUpdatedAt: cloudPdf?.updatedAt ?? pdfUpdatedAt,
        updatedAt: pdfUpdatedAt
      };

      await savePlanPdfReference(activePlan.id, {
        pdfId: localPdfId,
        pdfName: file.name,
        pdfSize: file.size,
        pdfUpdatedAt: cloudPdf?.updatedAt ?? pdfUpdatedAt
      });

      persistNextActivePlan(nextPlan);
      showSavedStatus("PDF salvato nel cloud e su questo dispositivo");
    } catch (err) {
      deletePdfFile(pdfId).catch(() => {});
      setPdfError(err?.message ?? "Non è stato possibile salvare il PDF.");
    }
  }

  async function handleRemovePdf() {
    if (!hasPlanPdf(activePlan)) {
      return;
    }

    const confirmed = window.confirm("Vuoi rimuovere il PDF salvato da questo dispositivo?");

    if (!confirmed) {
      return;
    }

    try {
      await flushRequiredCloudSave();
      const deleteResult = await deletePlanPdf(auth?.token, activePlan.id, activePlan.cloudPdf?.key);
      rememberRemoteUpdatedAt(deleteResult);
      if (activePlan.pdfId) {
        await deletePdfFile(activePlan.pdfId);
      }
      await deletePlanPdfReference(activePlan.id);
    } catch (err) {
      setPdfError(err?.message ?? "Non è stato possibile rimuovere il PDF.");
      return;
    }

    const { cloudPdf, pdfId, pdfName, pdfSize, pdfUpdatedAt, ...planWithoutPdf } = activePlan;
    const nextPlan = {
      ...planWithoutPdf,
      updatedAt: new Date().toISOString()
    };

    persistNextActivePlan(nextPlan);
    setIsPdfVisible(false);
    showSavedStatus("PDF rimosso");
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
    showSavedStatus();
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
    showSavedStatus("Esercizio salvato");
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
    showSavedStatus();
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

    if (activeSession?.completedSetsByExercise?.[exerciseId]) {
      const { [exerciseId]: _removed, ...completedSetsByExercise } = activeSession.completedSetsByExercise;
      const nextSession = {
        ...activeSession,
        completedSetsByExercise
      };

      setActiveSession(nextSession);
      saveActiveSessionCache(auth?.user, nextSession);
    }

    persistNextActivePlan({
      ...nextPlan,
      updatedAt: now
    });
    showSavedStatus("Esercizio eliminato");
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
  return !!(plan?.cloudPdf?.key || plan?.pdfId);
}

function isActiveSessionValid(session, data) {
  const plan = data?.plans?.find((candidate) => candidate.id === session.planId);
  return !!plan?.workouts?.some((workout) => workout.id === session.workoutId);
}

async function mergeLocalPdfReferences(data) {
  try {
    const references = await getAllPlanPdfReferences();
    const referencesByPlanId = new Map(references.map((reference) => [reference.planId, reference]));

    return {
      ...data,
      plans: data.plans.map((plan) => {
        const reference = referencesByPlanId.get(plan.id);

        if (!reference?.pdfId || plan.cloudPdf?.key) {
          return plan;
        }

        return {
          ...plan,
          pdfId: reference.pdfId,
          pdfName: reference.pdfName,
          pdfSize: reference.pdfSize,
          pdfUpdatedAt: reference.pdfUpdatedAt
        };
      })
    };
  } catch {
    return data;
  }
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
