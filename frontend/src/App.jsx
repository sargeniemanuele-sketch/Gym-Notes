import React, { useEffect, useMemo, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import { deletePdfFile, getPdfFile, savePdfFile } from "./pdfStorage.js";
import { clearGymData, createId, isStorageAvailable, loadGymData, saveGymData } from "./storage.js";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;

const todayFormatter = new Intl.DateTimeFormat("it-IT");
const emptyExerciseDraft = {
  name: "",
  sets: "",
  reps: "",
  weight: "",
  rest: "",
  notes: ""
};

function getTodayLabel() {
  return todayFormatter.format(new Date());
}

function getNumericInputValue(value) {
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (!stringValue) {
    return "";
  }

  const numberMatch = stringValue.match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:kg|sec))?$/i);

  if (!numberMatch) {
    return "";
  }

  return numberMatch[1].replace(",", ".");
}

function normalizeNumericInputValue(value) {
  return getNumericInputValue(value);
}

function formatWeightForDisplay(value) {
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (!stringValue) {
    return "Carico non impostato";
  }

  const numericValue = getNumericInputValue(stringValue);

  if (numericValue) {
    return `${numericValue} kg`;
  }

  return stringValue;
}

function formatRestForDisplay(value) {
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (!stringValue) {
    return "Recupero non impostato";
  }

  const numericValue = getNumericInputValue(stringValue);

  if (numericValue) {
    return `${numericValue} sec`;
  }

  return stringValue;
}

function getRestDurationSeconds(value) {
  const numericValue = getNumericInputValue(value);

  if (!numericValue) {
    return null;
  }

  const durationSeconds = Number.parseInt(numericValue, 10);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  return durationSeconds;
}

function formatTimerTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
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

function App() {
  const [gymData, setGymData] = useState(() => loadGymData());
  const [isPlanOpen, setIsPlanOpen] = useState(false);
  const [isNewPlanFormOpen, setIsNewPlanFormOpen] = useState(false);
  const [isRenamingPlan, setIsRenamingPlan] = useState(false);
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [planName, setPlanName] = useState("");
  const [workoutName, setWorkoutName] = useState("");
  const [isNewWorkoutFormOpen, setIsNewWorkoutFormOpen] = useState(false);
  const [editingWorkoutId, setEditingWorkoutId] = useState(null);
  const [isExerciseFormOpen, setIsExerciseFormOpen] = useState(false);
  const [exerciseDraft, setExerciseDraft] = useState(emptyExerciseDraft);
  const [exerciseError, setExerciseError] = useState("");
  const [saveStatus, setSaveStatus] = useState("");
  const [saveWarning, setSaveWarning] = useState("");
  const [pdfError, setPdfError] = useState("");
  const [isPdfVisible, setIsPdfVisible] = useState(true);
  const [activeTimer, setActiveTimer] = useState(null);
  const saveStatusTimeoutRef = useRef(null);
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
  const selectedWorkoutExercises = selectedWorkout?.exercises ?? [];

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

  function handleStartRestTimer(exerciseId, durationSeconds) {
    const durationMs = durationSeconds * 1000;
    notifiedTimerRef.current = null;

    setActiveTimer({
      exerciseId,
      durationSeconds,
      durationMs,
      remainingMs: durationMs,
      status: "running",
      targetEndAt: Date.now() + durationMs
    });
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
    setSelectedWorkoutId(null);
    setActiveTimer(null);
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
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
      setIsNewWorkoutFormOpen(false);
      setEditingWorkoutId(null);
    }

    setSaveWarning(deleteWarning);
    showSavedStatus("Scheda eliminata");
  }

  function handleBackToPlans() {
    setIsPlanOpen(false);
    setSelectedWorkoutId(null);
    setActiveTimer(null);
    setIsRenamingPlan(false);
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
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
    setSelectedWorkoutId(null);
    setPlanName("");
    setWorkoutName("");
    setIsNewWorkoutFormOpen(false);
    setEditingWorkoutId(null);
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

  if (!isPlanOpen || !activePlan) {
    return (
      <main className="app-shell">
        <section className="plans-panel" aria-labelledby="app-title">
          <header className="plans-header">
            <p className="eyebrow">Scheda locale sul tuo dispositivo</p>
            <div className="brand-title-row">
              <img className="brand-mark" src="/icons/icon-192.png" alt="" aria-hidden="true" />
              <h1 id="app-title">Gym Notes</h1>
            </div>
            <p className="subtitle">Le tue schede</p>
          </header>

          {plans.length === 0 ? (
            <>
              <div className="plans-empty">
                <h2>Nessuna scheda creata</h2>
                <p className="empty-state">Crea la tua prima scheda palestra.</p>
              </div>

              <form className="form-stack plan-create-form" onSubmit={handleCreatePlan}>
                <label htmlFor="plan-name">Nome scheda</label>
                <input
                  id="plan-name"
                  type="text"
                  value={planName}
                  onChange={(event) => setPlanName(event.target.value)}
                  placeholder="Es. Scheda massa"
                  autoComplete="off"
                />
                <button type="submit">Crea scheda</button>
              </form>
            </>
          ) : (
            <>
              <div className="plan-list" aria-label="Le tue schede">
                {plans.map((plan) => (
                  <PlanCard key={plan.id} onDelete={handleDeletePlan} onOpen={handleOpenPlan} plan={plan} />
                ))}
              </div>

              {isNewPlanFormOpen ? (
                <form className="form-stack plan-create-form" onSubmit={handleCreatePlan}>
                  <label htmlFor="plan-name">Nome scheda</label>
                  <input
                    id="plan-name"
                    type="text"
                    value={planName}
                    onChange={(event) => setPlanName(event.target.value)}
                    placeholder="Es. Scheda massa"
                    autoComplete="off"
                  />
                  <div className="form-actions">
                    <button type="submit">Crea scheda</button>
                    <button className="ghost-button" type="button" onClick={handleCancelCreatePlan}>
                      Annulla
                    </button>
                  </div>
                </form>
              ) : (
                <button className="secondary-action plan-new-button" type="button" onClick={() => setIsNewPlanFormOpen(true)}>
                  + Nuova scheda
                </button>
              )}
            </>
          )}

          {!storageAvailable && (
            <p className="warning">
              Il salvataggio locale non è disponibile su questo browser. I dati potrebbero non essere mantenuti.
            </p>
          )}
          {saveWarning && <p className="warning">{saveWarning}</p>}
        </section>
      </main>
    );
  }

  if (selectedWorkout) {
    return (
      <main className="app-shell">
        <section className="screen-panel">
          <button className="back-button plans-back-button" type="button" onClick={() => setSelectedWorkoutId(null)}>
            ← Torna alla scheda
          </button>

          <header className="page-header">
            {editingWorkoutId === selectedWorkout.id ? (
              <div className="rename-panel">
                <div className="field-stack">
                  <label htmlFor="detail-workout-name">Nome allenamento</label>
                  <input
                    id="detail-workout-name"
                    type="text"
                    value={selectedWorkout.name}
                    onChange={(event) => handleWorkoutNameChange(selectedWorkout.id, event.target.value)}
                    placeholder="Nome allenamento"
                    autoComplete="off"
                  />
                </div>
                <div className="form-actions">
                  <button type="button" onClick={() => setEditingWorkoutId(null)}>
                    Fine
                  </button>
                  <button className="ghost-button" type="button" onClick={() => setEditingWorkoutId(null)}>
                    Annulla
                  </button>
                </div>
              </div>
            ) : (
              <>
                <h1>{selectedWorkout.name || "Allenamento senza nome"}</h1>
                <p className="detail-meta">Scheda: {activePlan.name || "Scheda senza nome"} · Oggi {todayLabel}</p>
                <button className="inline-secondary-button" type="button" onClick={() => setEditingWorkoutId(selectedWorkout.id)}>
                  Rinomina allenamento
                </button>
              </>
            )}
          </header>

          {activePlan.pdfId && (
            <section className="content-section" aria-labelledby="pdf-reference-title">
              <div className="section-title-row">
                <h2 id="pdf-reference-title">Riferimento PDF</h2>
                {saveStatus && <span className="save-status">{saveStatus}</span>}
              </div>

              <PdfReferenceSection
                isVisible={isPdfVisible}
                onHide={() => setIsPdfVisible(false)}
                onPageChange={(pageNumber) => handleWorkoutPdfPageChange(selectedWorkout.id, pageNumber)}
                onShow={() => setIsPdfVisible(true)}
                pdfId={activePlan.pdfId}
                pdfName={activePlan.pdfName}
                selectedPage={selectedWorkout.pdfPage}
              />
            </section>
          )}

          <section className="content-section" aria-labelledby="exercises-title">
            <div className="section-title-row">
              <h2 id="exercises-title">Esercizi</h2>
              {saveStatus && <span className="save-status">{saveStatus}</span>}
            </div>

            {selectedWorkoutExercises.length === 0 ? (
              <p className="empty-state">Non hai ancora aggiunto esercizi.</p>
            ) : (
              <div className="exercise-list">
                {selectedWorkoutExercises.map((exercise) => (
                  <ExerciseCard
                    activeTimer={activeTimer}
                    exercise={exercise}
                    key={exercise.id}
                    onDelete={handleDeleteExercise}
                    onPauseTimer={handlePauseRestTimer}
                    onResetTimer={handleResetRestTimer}
                    onResumeTimer={handleResumeRestTimer}
                    onStartTimer={handleStartRestTimer}
                    onUpdate={handleUpdateExercise}
                  />
                ))}
              </div>
            )}

            {isExerciseFormOpen ? (
              <ExerciseForm
                draft={exerciseDraft}
                error={exerciseError}
                onCancel={handleCancelExerciseForm}
                onChange={handleExerciseDraftChange}
                onSubmit={handleAddExercise}
              />
            ) : (
              <button className="secondary-action" type="button" onClick={() => setIsExerciseFormOpen(true)}>
                + Aggiungi esercizio
              </button>
            )}
          </section>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <section className="screen-panel">
        <button className="back-button plans-back-button" type="button" onClick={handleBackToPlans}>
          ← Le tue schede
        </button>

        <header className="page-header">
          {isRenamingPlan ? (
            <div className="rename-panel">
              <div className="field-stack">
                <label htmlFor="plan-name-edit">Nome scheda</label>
                <input
                  id="plan-name-edit"
                  type="text"
                  value={activePlan.name}
                  onChange={(event) => handlePlanNameChange(event.target.value)}
                  placeholder="Nome scheda"
                  autoComplete="off"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={() => setIsRenamingPlan(false)}>
                  Fine
                </button>
                <button className="ghost-button" type="button" onClick={() => setIsRenamingPlan(false)}>
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1>{activePlan.name || "Scheda senza nome"}</h1>
              <p className="detail-meta">Scheda attiva · Oggi {todayLabel}</p>
              <button className="inline-secondary-button" type="button" onClick={() => setIsRenamingPlan(true)}>
                Rinomina scheda
              </button>
            </>
          )}
        </header>

        <section className="content-section" aria-labelledby="workouts-title">
          <div className="section-title-row">
            <h2 id="workouts-title">I tuoi allenamenti</h2>
            {saveStatus && <span className="save-status">{saveStatus}</span>}
          </div>

          {activePlan.workouts.length === 0 ? (
            <p className="empty-state">Non hai ancora creato allenamenti.</p>
          ) : (
            <div className="card-list">
              {activePlan.workouts.map((workout) => (
                <WorkoutCard
                  editingWorkoutId={editingWorkoutId}
                  key={workout.id}
                  onDelete={handleDeleteWorkout}
                  onFinishRename={() => setEditingWorkoutId(null)}
                  onOpen={setSelectedWorkoutId}
                  onRename={handleWorkoutNameChange}
                  onStartRename={setEditingWorkoutId}
                  workout={workout}
                />
              ))}
            </div>
          )}

          {isNewWorkoutFormOpen ? (
            <form className="form-stack workout-form" onSubmit={handleCreateWorkout}>
              <label htmlFor="workout-name">Nome allenamento</label>
              <input
                id="workout-name"
                type="text"
                value={workoutName}
                onChange={(event) => setWorkoutName(event.target.value)}
                placeholder="Es. Petto e tricipiti"
                autoComplete="off"
              />
              <div className="form-actions">
                <button type="submit">Crea allenamento</button>
                <button className="ghost-button" type="button" onClick={handleCancelCreateWorkout}>
                  Annulla
                </button>
              </div>
            </form>
          ) : (
            <button className="secondary-action workout-new-button" type="button" onClick={() => setIsNewWorkoutFormOpen(true)}>
              + Nuovo allenamento
            </button>
          )}

          {saveWarning && <p className="warning">{saveWarning}</p>}
        </section>

        <section className="content-section pdf-support-section" aria-labelledby="original-pdf-title">
          <div className="section-title-row">
            <h2 id="original-pdf-title">Scheda originale PDF</h2>
            {saveStatus && <span className="save-status">{saveStatus}</span>}
          </div>

          <div className="pdf-home-card">
            {activePlan.pdfId ? (
              <div className="pdf-file-copy">
                <span>PDF caricato</span>
                <p>{activePlan.pdfName}</p>
              </div>
            ) : (
              <p>Nessun PDF caricato</p>
            )}

            <input
              className="sr-only"
              ref={pdfInputRef}
              type="file"
              accept="application/pdf"
              onChange={handlePdfFileChange}
            />

            <div className="pdf-actions">
              <button type="button" onClick={() => pdfInputRef.current?.click()}>
                {activePlan.pdfId ? "Sostituisci" : "Carica PDF"}
              </button>
              {activePlan.pdfId && (
                <button className="outline-danger-button pdf-danger-button" type="button" onClick={handleRemovePdf}>
                  Rimuovi
                </button>
              )}
            </div>

            {pdfError && <p className="field-error">{pdfError}</p>}
          </div>
        </section>

        <section className="content-section account-actions-section">
          <button className="reset-button" type="button" onClick={handleResetData}>
            Reset dati
          </button>
        </section>
      </section>
    </main>
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

function PlanCard({ onDelete, onOpen, plan }) {
  const workoutCount = plan.workouts.length;
  const workoutLabel = workoutCount === 1 ? "1 allenamento" : `${workoutCount} allenamenti`;
  const pdfLabel = plan.pdfId ? "PDF caricato" : "Nessun PDF";

  return (
    <article className="plan-card">
      <div>
        <h2>{plan.name || "Scheda senza nome"}</h2>
        <p>{workoutLabel} · {pdfLabel}</p>
      </div>

      <div className="plan-card-actions">
        <button type="button" onClick={() => onOpen(plan.id)}>
          Apri
        </button>
        <button className="text-danger-button" type="button" onClick={() => onDelete(plan.id)}>
          Elimina
        </button>
      </div>
    </article>
  );
}

function WorkoutCard({ editingWorkoutId, onDelete, onFinishRename, onOpen, onRename, onStartRename, workout }) {
  const isRenaming = editingWorkoutId === workout.id;
  const exerciseCount = workout.exercises.length;
  const exerciseLabel = exerciseCount === 1 ? "1 esercizio" : `${exerciseCount} esercizi`;
  const workoutName = workout.name?.trim() || "Allenamento senza nome";

  return (
    <article className="workout-card">
      {isRenaming ? (
        <div className="field-stack">
          <label htmlFor={`workout-${workout.id}-name`}>Nome allenamento</label>
          <input
            id={`workout-${workout.id}-name`}
            type="text"
            value={workout.name}
            onChange={(event) => onRename(workout.id, event.target.value)}
            placeholder="Nome allenamento"
            autoComplete="off"
          />
        </div>
      ) : (
        <div>
          <h3>{workoutName}</h3>
          <p>{exerciseLabel} · Creato il {todayFormatter.format(new Date(workout.createdAt))}</p>
        </div>
      )}

      <div className="workout-card-actions">
        {isRenaming ? (
          <>
            <button type="button" onClick={onFinishRename}>
              Fine
            </button>
            <button className="ghost-button" type="button" onClick={onFinishRename}>
              Annulla
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onOpen(workout.id)}>
              Apri
            </button>
            <button className="ghost-button" type="button" onClick={() => onStartRename(workout.id)}>
              Rinomina
            </button>
            <button
              className="text-danger-button"
              type="button"
              onClick={() => onDelete(workout.id)}
            >
              Elimina
            </button>
          </>
        )}
      </div>
    </article>
  );
}

function ExerciseForm({ draft, error, onCancel, onChange, onSubmit }) {
  return (
    <form className="exercise-form" onSubmit={onSubmit}>
      <div className="field-stack">
        <label htmlFor="exercise-name">Nome esercizio</label>
        <input
          id="exercise-name"
          type="text"
          value={draft.name}
          onChange={(event) => onChange("name", event.target.value)}
          placeholder="Es. Panca piana"
          autoComplete="off"
        />
        {error && <p className="field-error">{error}</p>}
      </div>

      <div className="two-column-fields">
        <div className="field-stack">
          <label htmlFor="exercise-sets">Serie</label>
          <input
            id="exercise-sets"
            type="number"
            value={getNumericInputValue(draft.sets)}
            onChange={(event) => onChange("sets", normalizeNumericInputValue(event.target.value))}
            placeholder="4"
            min="0"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        <div className="field-stack">
          <label htmlFor="exercise-reps">Ripetizioni</label>
          <input
            id="exercise-reps"
            type="number"
            value={getNumericInputValue(draft.reps)}
            onChange={(event) => onChange("reps", normalizeNumericInputValue(event.target.value))}
            placeholder="10"
            min="0"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor="exercise-weight">Carico</label>
        <div className="unit-input-row">
          <input
            id="exercise-weight"
            type="number"
            value={getNumericInputValue(draft.weight)}
            onChange={(event) => onChange("weight", normalizeNumericInputValue(event.target.value))}
            placeholder="70"
            min="0"
            step="0.25"
            inputMode="decimal"
            autoComplete="off"
          />
          <span aria-hidden="true">kg</span>
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor="exercise-rest">Recupero</label>
        <div className="unit-input-row">
          <input
            id="exercise-rest"
            type="number"
            value={getNumericInputValue(draft.rest)}
            onChange={(event) => onChange("rest", normalizeNumericInputValue(event.target.value))}
            placeholder="90"
            min="0"
            step="5"
            inputMode="numeric"
            autoComplete="off"
          />
          <span aria-hidden="true">sec</span>
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor="exercise-notes">Note</label>
        <textarea
          id="exercise-notes"
          value={draft.notes}
          onChange={(event) => onChange("notes", event.target.value)}
          placeholder="Es. ultima serie difficile"
          rows="3"
        />
      </div>

      <div className="form-actions">
        <button type="submit">Aggiungi esercizio</button>
        <button className="ghost-button" type="button" onClick={onCancel}>
          Annulla
        </button>
      </div>
    </form>
  );
}

function ExerciseCard({ activeTimer, exercise, onDelete, onPauseTimer, onResetTimer, onResumeTimer, onStartTimer, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const exerciseName = exercise.name?.trim() || "Esercizio senza nome";
  const setsValue = exercise.sets?.trim();
  const repsValue = exercise.reps?.trim();
  const performanceText =
    setsValue || repsValue
      ? `${setsValue || "-"} x ${repsValue || "-"}`
      : "Serie e ripetizioni non impostate";
  const weightText = formatWeightForDisplay(exercise.weight);
  const restText = formatRestForDisplay(exercise.rest);
  const restDurationSeconds = getRestDurationSeconds(exercise.rest);
  const notesText = exercise.notes?.trim() || "Nessuna nota";
  const exerciseTimer = activeTimer?.exerciseId === exercise.id ? activeTimer : null;

  if (!isEditing) {
    return (
      <article className="exercise-card exercise-card-compact">
        <header className="exercise-card-header">
          <div>
            <h3>{exerciseName}</h3>
            <p className="exercise-performance">{performanceText}</p>
          </div>
          <button className="compact-edit-button" type="button" onClick={() => setIsEditing(true)}>
            Modifica
          </button>
        </header>

        <div className="exercise-read-grid">
          <div className="exercise-read-block">
            <span>Carico</span>
            <p>{weightText}</p>
          </div>

          <div className="exercise-read-block">
            <span>Recupero</span>
            <p>{restText}</p>
          </div>

          <div className="exercise-read-block">
            <span>Note</span>
            <p>{notesText}</p>
          </div>
        </div>

        <RestTimer
          durationSeconds={restDurationSeconds}
          onPause={() => onPauseTimer(exercise.id)}
          onReset={() => onResetTimer(exercise.id)}
          onResume={() => onResumeTimer(exercise.id)}
          onStart={() => onStartTimer(exercise.id, restDurationSeconds)}
          timer={exerciseTimer}
        />
      </article>
    );
  }

  return (
    <article className="exercise-card">
      <div className="field-stack">
        <label htmlFor={`exercise-${exercise.id}-name`}>Nome esercizio</label>
        <input
          id={`exercise-${exercise.id}-name`}
          type="text"
          value={exercise.name ?? ""}
          onChange={(event) => onUpdate(exercise.id, "name", event.target.value)}
          autoComplete="off"
        />
      </div>

      <div className="two-column-fields">
        <div className="field-stack">
          <label htmlFor={`exercise-${exercise.id}-sets`}>Serie</label>
          <input
            id={`exercise-${exercise.id}-sets`}
            type="number"
            value={getNumericInputValue(exercise.sets)}
            onChange={(event) => onUpdate(exercise.id, "sets", normalizeNumericInputValue(event.target.value))}
            min="0"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>

        <div className="field-stack">
          <label htmlFor={`exercise-${exercise.id}-reps`}>Ripetizioni</label>
          <input
            id={`exercise-${exercise.id}-reps`}
            type="number"
            value={getNumericInputValue(exercise.reps)}
            onChange={(event) => onUpdate(exercise.id, "reps", normalizeNumericInputValue(event.target.value))}
            min="0"
            inputMode="numeric"
            autoComplete="off"
          />
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor={`exercise-${exercise.id}-weight`}>Carico</label>
        <div className="unit-input-row">
          <input
            id={`exercise-${exercise.id}-weight`}
            type="number"
            value={getNumericInputValue(exercise.weight)}
            onChange={(event) => onUpdate(exercise.id, "weight", normalizeNumericInputValue(event.target.value))}
            min="0"
            step="0.25"
            inputMode="decimal"
            autoComplete="off"
          />
          <span aria-hidden="true">kg</span>
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor={`exercise-${exercise.id}-rest`}>Recupero</label>
        <div className="unit-input-row">
          <input
            id={`exercise-${exercise.id}-rest`}
            type="number"
            value={getNumericInputValue(exercise.rest)}
            onChange={(event) => onUpdate(exercise.id, "rest", normalizeNumericInputValue(event.target.value))}
            min="0"
            step="5"
            inputMode="numeric"
            autoComplete="off"
          />
          <span aria-hidden="true">sec</span>
        </div>
      </div>

      <div className="field-stack">
        <label htmlFor={`exercise-${exercise.id}-notes`}>Note</label>
        <textarea
          id={`exercise-${exercise.id}-notes`}
          value={exercise.notes ?? ""}
          onChange={(event) => onUpdate(exercise.id, "notes", event.target.value)}
          rows="3"
        />
      </div>

      <div className="exercise-edit-actions">
        <button className="ghost-button" type="button" onClick={() => setIsEditing(false)}>
          Chiudi modifica
        </button>
        <button className="danger-button" type="button" onClick={() => onDelete(exercise.id)}>
          Elimina esercizio
        </button>
      </div>
    </article>
  );
}

function RestTimer({ durationSeconds, onPause, onReset, onResume, onStart, timer }) {
  const hasDuration = Number.isFinite(durationSeconds) && durationSeconds > 0;
  const isRunning = timer?.status === "running";
  const isPaused = timer?.status === "paused";
  const isFinished = timer?.status === "finished";
  const remainingMs = timer?.remainingMs ?? (hasDuration ? durationSeconds * 1000 : 0);

  if (!hasDuration) {
    return (
      <div className="rest-timer">
        <button className="rest-timer-start" type="button" disabled>
          Recupero non impostato
        </button>
      </div>
    );
  }

  if (!timer) {
    return (
      <div className="rest-timer">
        <button className="rest-timer-start" type="button" onClick={onStart}>
          ▶ Timer {durationSeconds} sec
        </button>
      </div>
    );
  }

  return (
    <div className="rest-timer rest-timer-active">
      <p className="rest-timer-time" aria-live="polite">
        {formatTimerTime(remainingMs)}
      </p>

      {isFinished && <p className="rest-timer-finished">Recupero finito</p>}

      <div className="rest-timer-actions">
        {isRunning && (
          <button type="button" onClick={onPause}>
            Pausa
          </button>
        )}
        {isPaused && (
          <button type="button" onClick={onResume}>
            Riprendi
          </button>
        )}
        <button className="ghost-button" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

function PdfReferenceSection({ isVisible, onHide, onPageChange, onShow, pdfId, pdfName, selectedPage }) {
  const [pdfData, setPdfData] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [referenceStatus, setReferenceStatus] = useState("loading");
  const [referenceError, setReferenceError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const effectivePage = Number.isFinite(selectedPage) && selectedPage >= 1 ? selectedPage : 1;
  const visiblePage = numPages ? Math.min(effectivePage, numPages) : effectivePage;

  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;

    async function loadPdfReference() {
      setReferenceStatus("loading");
      setReferenceError("");
      setPageNotice("");
      setPdfData(null);
      setNumPages(null);

      try {
        const savedPdf = await getPdfFile(pdfId);

        if (!savedPdf?.file) {
          throw new Error("missing-pdf");
        }

        const arrayBuffer = await savedPdf.file.arrayBuffer();
        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdfDocument = await loadingTask.promise;
        const totalPages = pdfDocument.numPages;
        await pdfDocument.destroy();

        if (!totalPages) {
          throw new Error("missing-pages");
        }

        if (!isCancelled) {
          setPdfData(arrayBuffer);
          setNumPages(totalPages);
          setReferenceStatus("ready");
        }
      } catch {
        if (!isCancelled) {
          setReferenceStatus("error");
          setReferenceError("Il PDF non può essere caricato.");
        }
      }
    }

    loadPdfReference();

    return () => {
      isCancelled = true;

      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [pdfId]);

  useEffect(() => {
    if (!numPages) {
      return;
    }

    if (!Number.isFinite(selectedPage) || selectedPage < 1) {
      onPageChange(1);
      return;
    }

    if (selectedPage > numPages) {
      setPageNotice("Pagina non disponibile per questo PDF. Mostro la pagina disponibile più vicina.");
      onPageChange(numPages);
      return;
    }

    setPageNotice("");
  }, [numPages, onPageChange, selectedPage]);

  if (!isVisible) {
    return (
      <div className="pdf-reference-card">
        <p className="pdf-reference-copy">Scheda originale caricata{pdfName ? `: ${pdfName}` : ""}</p>
        <button className="secondary-action pdf-show-button" type="button" onClick={onShow}>
          Mostra riferimento PDF
        </button>
      </div>
    );
  }

  return (
    <div className="pdf-reference-card">
      <p className="pdf-reference-copy">Scheda originale caricata{pdfName ? `: ${pdfName}` : ""}</p>

      {referenceStatus === "loading" && <p className="pdf-viewer-message">Caricamento PDF...</p>}
      {referenceStatus === "error" && <p className="field-error">{referenceError}</p>}

      {referenceStatus === "ready" && numPages && (
        <>
          <div className="pdf-page-control" aria-label="Seleziona pagina PDF">
            <span>Pagina</span>
            <div className="pdf-page-buttons">
              {Array.from({ length: numPages }, (_, index) => {
                const pageNumber = index + 1;
                const isSelected = pageNumber === visiblePage;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={isSelected ? "pdf-page-button pdf-page-button-active" : "pdf-page-button"}
                    key={pageNumber}
                    type="button"
                    onClick={() => onPageChange(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>
          </div>

          {pageNotice && <p className="pdf-page-notice">{pageNotice}</p>}

          <PdfPageViewer pageNumber={visiblePage} pdfData={pdfData} />
        </>
      )}

      <button className="ghost-button pdf-hide-button" type="button" onClick={onHide}>
        Nascondi PDF
      </button>
    </div>
  );
}

function PdfPageViewer({ pageNumber, pdfData }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [viewerStatus, setViewerStatus] = useState("loading");
  const [viewerError, setViewerError] = useState("");

  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;
    let renderTask = null;

    async function renderPdfPage() {
      setViewerStatus("loading");
      setViewerError("");

      try {
        if (!pdfData) {
          throw new Error("missing-pdf-data");
        }

        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData.slice(0)) });
        const pdfDocument = await loadingTask.promise;

        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
          if (!isCancelled) {
            setViewerStatus("error");
            setViewerError("Pagina non disponibile per questo PDF.");
          }
          await pdfDocument.destroy();
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth ?? baseViewport.width;
        const scale = Math.max(containerWidth / baseViewport.width, 0.1);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;

        if (!canvas || isCancelled) {
          await pdfDocument.destroy();
          return;
        }

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("missing-canvas-context");
        }

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        renderTask = page.render({
          canvasContext: context,
          transform,
          viewport
        });

        await renderTask.promise;
        await pdfDocument.destroy();

        if (!isCancelled) {
          setViewerStatus("ready");
        }
      } catch (error) {
        if (isCancelled || error?.name === "RenderingCancelledException") {
          return;
        }

        setViewerStatus("error");
        setViewerError("Il PDF non può essere letto.");
      }
    }

    renderPdfPage();

    return () => {
      isCancelled = true;

      if (renderTask) {
        renderTask.cancel();
      }

      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [pageNumber, pdfData]);

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {viewerStatus === "loading" && <p className="pdf-viewer-message">Caricamento PDF...</p>}
      {viewerStatus === "error" && <p className="field-error">{viewerError}</p>}
      <canvas className={viewerStatus === "ready" ? "pdf-canvas" : "pdf-canvas pdf-canvas-hidden"} ref={canvasRef} />
    </div>
  );
}

export default App;
