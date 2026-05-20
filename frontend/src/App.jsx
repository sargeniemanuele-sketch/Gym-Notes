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
import { createId, normalizeGymData } from "./storage.js";
import { getTodayLabel } from "./utils/formatters.js";
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
    const normalizedData = normalizeRemoteData(nextData);
    applyGymData(normalizedData);
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
      return cloudSavePromiseRef.current;
    }

    const token = cloudSaveTokenRef.current;
    const nextData = pendingCloudDataRef.current;

    if (!token || !nextData) {
      return;
    }

    pendingCloudDataRef.current = null;
    cloudSaveInFlightRef.current = true;

    try {
      cloudSavePromiseRef.current = saveRemoteGymData(token, sanitizeForCloud(nextData));
      await cloudSavePromiseRef.current;
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

      setSaveWarning("Cloud non disponibile. Le modifiche restano in memoria e verranno risincronizzate più avanti.");
    } finally {
      cloudSaveInFlightRef.current = false;
      cloudSavePromiseRef.current = null;
    }

    if (pendingCloudDataRef.current) {
      flushCloudSave();
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
      await applyCloudGymData(remote.data ?? { activePlanId: null, plans: [] });
      showSavedStatus("Dati cloud caricati");
      return true;
    } catch (err) {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
        setGymData(null);
        return false;
      }

      setCloudLoadError("Cloud non disponibile. Riprova tra poco.");
      setGymData(null);
      return false;
    } finally {
      setIsLoadingData(false);
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

  function handleLogout() {
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

    setActiveSession({
      workoutId,
      planId: activePlan.id,
      startedAt: new Date().toISOString(),
      completedSetsByExercise: {}
    });
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

      return {
        ...prev,
        completedSetsByExercise: {
          ...prev.completedSetsByExercise,
          [exerciseId]: next
        }
      };
    });
  }

  function handleCancelSession() {
    const confirmed = window.confirm("Vuoi annullare questa sessione?");

    if (!confirmed) {
      return;
    }

    setActiveSession(null);
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

    const nextPlans = plans.filter((plan) => plan.id !== planId);
    const nextActivePlanId =
      gymData?.activePlanId === planId ? nextPlans[0]?.id ?? null : gymData?.activePlanId ?? nextPlans[0]?.id ?? null;

    const nextData = {
      activePlanId: nextActivePlanId,
      plans: nextPlans
    };

    applyGymData(nextData);

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
      Promise.all([
        planToDelete.pdfId ? deletePdfFile(planToDelete.pdfId) : Promise.resolve(),
        deletePlanPdfReference(planToDelete.id),
        planToDelete.cloudPdf ? deletePlanPdf(auth?.token, planToDelete.id) : Promise.resolve()
      ])
        .catch(() => {
          setSaveWarning("La scheda è stata eliminata, ma non è stato possibile rimuovere il PDF.");
        })
        .finally(() => scheduleCloudSave(nextData));
    } else {
      scheduleCloudSave(nextData);
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

    const nextPlan = {
      ...activePlan,
      updatedAt: new Date().toISOString(),
      workouts: activePlan.workouts.filter((workout) => workout.id !== workoutId)
    };

    if (selectedWorkoutId === workoutId) {
      setSelectedWorkoutId(null);
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
    const cloudPdfPlanIds = plans.filter((plan) => plan.cloudPdf).map((plan) => plan.id);

    const nextData = { activePlanId: null, plans: [] };
    applyGymData(nextData);
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
    showSavedStatus("Dati resettati");
    setSaveWarning("");

    if (pdfIds.length > 0 || plans.length > 0) {
      Promise.all([
        ...pdfIds.map((pdfId) => deletePdfFile(pdfId)),
        ...plans.map((plan) => deletePlanPdfReference(plan.id)),
        ...cloudPdfPlanIds.map((planId) => deletePlanPdf(auth?.token, planId))
      ])
        .catch(() => {
          setSaveWarning("I dati sono stati cancellati, ma non è stato possibile rimuovere tutti i PDF.");
        })
        .finally(() => scheduleCloudSave(nextData));
    } else {
      scheduleCloudSave(nextData);
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
      await flushCloudSave();
      const uploadResult = await uploadPlanPdf(auth?.token, activePlan.id, file);
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
      showSavedStatus("PDF salvato sul dispositivo");
    } catch {
      deletePdfFile(pdfId).catch(() => {});
      setPdfError("Non è stato possibile salvare il PDF.");
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
      await deletePlanPdf(auth?.token, activePlan.id);
      if (activePlan.pdfId) {
        await deletePdfFile(activePlan.pdfId);
      }
      await deletePlanPdfReference(activePlan.id);
    } catch {
      setPdfError("Non è stato possibile rimuovere il PDF.");
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
      exercises: [...workout.exercises, nextExercise]
    }));

    persistNextActivePlan(nextPlan);
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

    const nextPlan = updateWorkoutInPlan(activePlan, selectedWorkout.id, (workout) => ({
      ...workout,
      exercises: workout.exercises.map((exercise) => {
        if (exercise.id !== exerciseId) {
          return exercise;
        }

        return {
          ...exercise,
          [field]: value,
          updatedAt: new Date().toISOString()
        };
      })
    }));

    persistNextActivePlan(nextPlan);
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

    const nextPlan = updateWorkoutInPlan(activePlan, selectedWorkout.id, (workout) => ({
      ...workout,
      exercises: workout.exercises.filter((exercise) => exercise.id !== exerciseId)
    }));

    persistNextActivePlan(nextPlan);
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
