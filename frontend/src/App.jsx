import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import ActiveTimerBar from "./components/ActiveTimerBar.jsx";
import PlanDetail from "./components/PlanDetail.jsx";
import PlanList from "./components/PlanList.jsx";
import WorkoutDetail from "./components/WorkoutDetail.jsx";
import { deletePdfFile, savePdfFile } from "./pdfStorage.js";
import { clearGymData, createId, isStorageAvailable, loadGymData, saveGymData } from "./storage.js";
import { getTodayLabel } from "./utils/formatters.js";
import { normalizeNumericInputValue } from "./utils/numbers.js";
import { clearAuth, loadAuth, saveAuth } from "./authStorage.js";
import { login as apiLogin, register as apiRegister, getMe, getRemoteGymData, saveRemoteGymData } from "./api/client.js";
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
  const [gymData, setGymData] = useState(() => loadGymData());
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
  const [cloudStatus, setCloudStatus] = useState(null);
  const saveStatusTimeoutRef = useRef(null);
  const sessionFeedbackTimeoutRef = useRef(null);
  const cloudStatusTimeoutRef = useRef(null);
  const notifiedTimerRef = useRef(null);
  const pdfInputRef = useRef(null);
  const todayLabel = useMemo(() => getTodayLabel(), []);
  const storageAvailable = useMemo(() => isStorageAvailable(), []);
  const plans = gymData?.plans ?? [];
  const activePlan = useMemo(
    () => plans.find((plan) => plan.id === gymData?.activePlanId) ?? null,
    [gymData?.activePlanId, plans]
  );

  const selectedWorkout = activePlan?.workouts.find((workout) => workout.id === selectedWorkoutId);

  useEffect(() => {
    if (!auth) return;
    getMe(auth.token).catch((err) => {
      if (err.status === 401) {
        clearAuth();
        setAuth(null);
      }
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedWorkoutId && activePlan?.pdfId) {
      setIsPdfVisible(true);
    }
  }, [activePlan?.pdfId, selectedWorkoutId]);

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

  function persistNextData(nextData) {
    setGymData(nextData);
    const saved = saveGymData(nextData);
    setSaveWarning(
      saved ? "" : "Il salvataggio locale non è disponibile su questo browser. I dati potrebbero non essere mantenuti."
    );
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

  function showCloudStatus(message, isError = false) {
    setCloudStatus({ message, isError });
    if (cloudStatusTimeoutRef.current) window.clearTimeout(cloudStatusTimeoutRef.current);
    cloudStatusTimeoutRef.current = window.setTimeout(() => setCloudStatus(null), 4500);
  }

  async function handleLogin(email, password) {
    const result = await apiLogin(email, password);
    saveAuth(result);
    setAuth(result);
  }

  async function handleRegister(email, password) {
    const result = await apiRegister(email, password);
    saveAuth(result);
    setAuth(result);
  }

  function handleLogout() {
    clearAuth();
    setAuth(null);
    setCloudStatus(null);
  }

  async function handleUploadToCloud() {
    if (!auth) return;
    const dataToSync = gymData ?? { activePlanId: null, plans: [] };
    try {
      await saveRemoteGymData(auth.token, sanitizeForCloud(dataToSync));
      showCloudStatus("Dati sincronizzati ✓");
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      showCloudStatus(err.message ?? "Errore di sincronizzazione.", true);
    }
  }

  async function handleDownloadFromCloud() {
    if (!auth) return;
    const confirmed = window.confirm(
      "Vuoi sostituire i dati locali con quelli salvati nel cloud?\n\n⚠ I PDF restano solo su questo dispositivo: se hai collegato un PDF a una scheda, il collegamento non verrà ripristinato."
    );
    if (!confirmed) return;
    try {
      const result = await getRemoteGymData(auth.token);
      if (!result.data) {
        showCloudStatus("Nessun dato cloud disponibile.");
        return;
      }
      saveGymData(result.data);
      setGymData(loadGymData());
      showCloudStatus("Dati cloud caricati ✓");
    } catch (err) {
      if (err.status === 401) { handleLogout(); return; }
      showCloudStatus(err.message ?? "Errore durante il download.", true);
    }
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
    setSessionFeedback("");
  }

  function handleCompleteSession() {
    if (!activeSession || !activePlan) {
      return;
    }

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

    let deleteWarning = "";

    if (planToDelete.pdfId) {
      try {
        await deletePdfFile(planToDelete.pdfId);
      } catch {
        deleteWarning = "La scheda è stata eliminata, ma non è stato possibile rimuovere il PDF da IndexedDB.";
      }
    }

    const nextPlans = plans.filter((plan) => plan.id !== planId);
    const nextActivePlanId =
      gymData?.activePlanId === planId ? nextPlans[0]?.id ?? null : gymData?.activePlanId ?? nextPlans[0]?.id ?? null;

    persistNextData({
      activePlanId: nextActivePlanId,
      plans: nextPlans
    });

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

    setSaveWarning(deleteWarning);
    showSavedStatus("Scheda eliminata");
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

  async function handleResetData() {
    const confirmed = window.confirm("Vuoi cancellare tutte le schede e tutti i dati salvati su questo dispositivo?");

    if (!confirmed) {
      return;
    }

    let resetWarning = "";
    const pdfIds = [...new Set(plans.map((plan) => plan.pdfId).filter(Boolean))];

    if (pdfIds.length > 0) {
      try {
        await Promise.all(pdfIds.map((pdfId) => deletePdfFile(pdfId)));
      } catch {
        resetWarning = "I dati sono stati cancellati, ma non è stato possibile rimuovere tutti i PDF da IndexedDB.";
      }
    }

    clearGymData();
    setGymData(null);
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
    showSavedStatus("");
    setSaveWarning(resetWarning);
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
      await savePdfFile(pdfId, file);

      if (activePlan.pdfId) {
        try {
          await deletePdfFile(activePlan.pdfId);
        } catch {
          // The plan will point to the new PDF, so an old orphan can be ignored.
        }
      }

      const nextPlan = {
        ...activePlan,
        pdfId,
        pdfName: file.name,
        pdfSize: file.size,
        pdfUpdatedAt,
        updatedAt: pdfUpdatedAt
      };

      persistNextActivePlan(nextPlan);
      showSavedStatus("PDF salvato sul dispositivo");
    } catch {
      setPdfError("Non è stato possibile salvare il PDF su questo dispositivo.");
    }
  }

  async function handleRemovePdf() {
    if (!activePlan?.pdfId) {
      return;
    }

    const confirmed = window.confirm("Vuoi rimuovere il PDF salvato da questo dispositivo?");

    if (!confirmed) {
      return;
    }

    try {
      await deletePdfFile(activePlan.pdfId);
    } catch {
      setPdfError("Non è stato possibile rimuovere il PDF da IndexedDB.");
      return;
    }

    const { pdfId, pdfName, pdfSize, pdfUpdatedAt, ...planWithoutPdf } = activePlan;
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

  if (!isPlanOpen || !activePlan) {
    return (
      <>
        <PlanList
          auth={auth}
          cloudStatus={cloudStatus}
          hasTimerBar={!!activeTimer}
          isNewPlanFormOpen={isNewPlanFormOpen}
          onCancelCreatePlan={handleCancelCreatePlan}
          onCreatePlan={handleCreatePlan}
          onDeletePlan={handleDeletePlan}
          onDownloadFromCloud={handleDownloadFromCloud}
          onDuplicatePlan={handleDuplicatePlan}
          onLogout={handleLogout}
          onOpenNewPlanForm={() => setIsNewPlanFormOpen(true)}
          onOpenPlan={handleOpenPlan}
          onPlanNameChange={setPlanName}
          onUploadToCloud={handleUploadToCloud}
          planName={planName}
          plans={plans}
          saveWarning={saveWarning}
          storageAvailable={storageAvailable}
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
