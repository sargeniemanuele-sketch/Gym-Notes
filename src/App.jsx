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
  const [gymPlan, setGymPlan] = useState(() => loadGymData());
  const [selectedWorkoutId, setSelectedWorkoutId] = useState(null);
  const [planName, setPlanName] = useState("");
  const [workoutName, setWorkoutName] = useState("");
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

  const selectedWorkout = gymPlan?.workouts.find((workout) => workout.id === selectedWorkoutId);
  const selectedWorkoutExercises = selectedWorkout?.exercises ?? [];

  useEffect(() => {
    if (selectedWorkoutId && gymPlan?.pdfId) {
      setIsPdfVisible(true);
    }
  }, [gymPlan?.pdfId, selectedWorkoutId]);

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

  function persistNextPlan(nextPlan) {
    setGymPlan(nextPlan);
    const saved = saveGymData(nextPlan);
    setSaveWarning(
      saved ? "" : "Il salvataggio locale non è disponibile su questo browser. I dati potrebbero non essere mantenuti."
    );
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

    const nextPlan = {
      id: createId(),
      name: trimmedName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      workouts: []
    };

    persistNextPlan(nextPlan);
    setPlanName("");
  }

  function handleCreateWorkout(event) {
    event.preventDefault();

    if (!gymPlan) {
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
      ...gymPlan,
      updatedAt: new Date().toISOString(),
      workouts: [...gymPlan.workouts, nextWorkout]
    };

    persistNextPlan(nextPlan);
    setWorkoutName("");
    showSavedStatus("Allenamento creato");
  }

  function handlePlanNameChange(value) {
    if (!gymPlan) {
      return;
    }

    const nextPlan = {
      ...gymPlan,
      name: value,
      updatedAt: new Date().toISOString()
    };

    persistNextPlan(nextPlan);
    showSavedStatus();
  }

  function handleWorkoutNameChange(workoutId, value) {
    if (!gymPlan) {
      return;
    }

    const nextPlan = updateWorkoutInPlan(gymPlan, workoutId, (workout) => ({
      ...workout,
      name: value,
      updatedAt: new Date().toISOString()
    }));

    persistNextPlan({
      ...nextPlan,
      updatedAt: new Date().toISOString()
    });
    showSavedStatus();
  }

  function handleDeleteWorkout(workoutId) {
    if (!gymPlan) {
      return;
    }

    const confirmed = window.confirm("Vuoi eliminare questo allenamento e tutti i suoi esercizi?");

    if (!confirmed) {
      return;
    }

    const nextPlan = {
      ...gymPlan,
      updatedAt: new Date().toISOString(),
      workouts: gymPlan.workouts.filter((workout) => workout.id !== workoutId)
    };

    if (selectedWorkoutId === workoutId) {
      setSelectedWorkoutId(null);
    }

    persistNextPlan(nextPlan);
    showSavedStatus("Allenamento eliminato");
  }

  async function handleResetData() {
    const confirmed = window.confirm("Vuoi cancellare tutti i dati salvati su questo dispositivo?");

    if (!confirmed) {
      return;
    }

    let resetWarning = "";

    if (gymPlan?.pdfId) {
      try {
        await deletePdfFile(gymPlan.pdfId);
      } catch {
        resetWarning = "I dati sono stati cancellati, ma non è stato possibile rimuovere il PDF da IndexedDB.";
      }
    }

    clearGymData();
    setGymPlan(null);
    setSelectedWorkoutId(null);
    setPlanName("");
    setWorkoutName("");
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    setPdfError("");
    setIsPdfVisible(false);
    showSavedStatus("");
    setSaveWarning(resetWarning);
  }

  async function handlePdfFileChange(event) {
    if (!gymPlan) {
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

      if (gymPlan.pdfId) {
        try {
          await deletePdfFile(gymPlan.pdfId);
        } catch {
          // The plan will point to the new PDF, so an old orphan can be ignored.
        }
      }

      const nextPlan = {
        ...gymPlan,
        pdfId,
        pdfName: file.name,
        pdfSize: file.size,
        pdfUpdatedAt,
        updatedAt: pdfUpdatedAt
      };

      persistNextPlan(nextPlan);
      showSavedStatus("PDF salvato sul dispositivo");
    } catch {
      setPdfError("Non è stato possibile salvare il PDF su questo dispositivo.");
    }
  }

  async function handleRemovePdf() {
    if (!gymPlan?.pdfId) {
      return;
    }

    const confirmed = window.confirm("Vuoi rimuovere il PDF salvato da questo dispositivo?");

    if (!confirmed) {
      return;
    }

    try {
      await deletePdfFile(gymPlan.pdfId);
    } catch {
      setPdfError("Non è stato possibile rimuovere il PDF da IndexedDB.");
      return;
    }

    const { pdfId, pdfName, pdfSize, pdfUpdatedAt, ...planWithoutPdf } = gymPlan;
    const nextPlan = {
      ...planWithoutPdf,
      updatedAt: new Date().toISOString()
    };

    persistNextPlan(nextPlan);
    setIsPdfVisible(false);
    showSavedStatus("PDF rimosso");
  }

  function handleWorkoutPdfPageChange(workoutId, value) {
    if (!gymPlan) {
      return;
    }

    const parsedPage = typeof value === "number" ? value : Number.parseInt(value, 10);
    const pdfPage = Number.isFinite(parsedPage) && parsedPage >= 1 ? parsedPage : null;
    const now = new Date().toISOString();
    const nextPlan = updateWorkoutInPlan(gymPlan, workoutId, (workout) => ({
      ...workout,
      pdfPage,
      updatedAt: now
    }));

    persistNextPlan({
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

    if (!gymPlan || !selectedWorkout) {
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

    const nextPlan = updateWorkoutInPlan(gymPlan, selectedWorkout.id, (workout) => ({
      ...workout,
      exercises: [...workout.exercises, nextExercise]
    }));

    persistNextPlan(nextPlan);
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
    if (!gymPlan || !selectedWorkout) {
      return;
    }

    const nextPlan = updateWorkoutInPlan(gymPlan, selectedWorkout.id, (workout) => ({
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

    persistNextPlan(nextPlan);
    showSavedStatus();
  }

  function handleDeleteExercise(exerciseId) {
    if (!gymPlan || !selectedWorkout) {
      return;
    }

    const confirmed = window.confirm("Vuoi eliminare questo esercizio?");

    if (!confirmed) {
      return;
    }

    const nextPlan = updateWorkoutInPlan(gymPlan, selectedWorkout.id, (workout) => ({
      ...workout,
      exercises: workout.exercises.filter((exercise) => exercise.id !== exerciseId)
    }));

    persistNextPlan(nextPlan);
    showSavedStatus("Esercizio eliminato");
  }

  if (!gymPlan) {
    return (
      <main className="app-shell">
        <section className="welcome-panel" aria-labelledby="app-title">
          <div className="brand-mark" aria-hidden="true">GN</div>
          <p className="eyebrow">Scheda locale sul tuo dispositivo</p>
          <h1 id="app-title">Gym Notes</h1>
          <p className="subtitle">La tua scheda palestra semplice, veloce e sempre con te.</p>
          <p className="intro">Crea la tua scheda e segnati esercizi, serie, ripetizioni, carichi e note.</p>

          <form className="form-stack" onSubmit={handleCreatePlan}>
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
          <button className="back-button" type="button" onClick={() => setSelectedWorkoutId(null)}>
            ← Torna
          </button>

          <header className="page-header">
            <p className="eyebrow">Oggi: {todayLabel}</p>
            <label className="sr-only" htmlFor="detail-workout-name">Nome allenamento</label>
            <input
              className="title-input"
              id="detail-workout-name"
              type="text"
              value={selectedWorkout.name}
              onChange={(event) => handleWorkoutNameChange(selectedWorkout.id, event.target.value)}
              placeholder="Nome allenamento"
              autoComplete="off"
            />
          </header>

          {gymPlan.pdfId && (
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
                pdfId={gymPlan.pdfId}
                pdfName={gymPlan.pdfName}
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
        <header className="page-header">
          <p className="eyebrow">Oggi: {todayLabel}</p>
          <h1>Gym Notes</h1>
          <label className="sr-only" htmlFor="plan-name-edit">Nome scheda</label>
          <input
            className="plan-name-input"
            id="plan-name-edit"
            type="text"
            value={gymPlan.name}
            onChange={(event) => handlePlanNameChange(event.target.value)}
            placeholder="Nome scheda"
            autoComplete="off"
          />
        </header>

        <section className="content-section" aria-labelledby="original-pdf-title">
          <div className="section-title-row">
            <h2 id="original-pdf-title">Scheda originale PDF</h2>
            {saveStatus && <span className="save-status">{saveStatus}</span>}
          </div>

          <div className="pdf-home-card">
            {gymPlan.pdfId ? (
              <p>PDF caricato: {gymPlan.pdfName}</p>
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
                {gymPlan.pdfId ? "Sostituisci PDF" : "Carica PDF"}
              </button>
              {gymPlan.pdfId && (
                <button className="danger-button" type="button" onClick={handleRemovePdf}>
                  Rimuovi PDF
                </button>
              )}
            </div>

            {pdfError && <p className="field-error">{pdfError}</p>}
          </div>
        </section>

        <section className="content-section" aria-labelledby="workouts-title">
          <div className="section-title-row">
            <h2 id="workouts-title">I tuoi allenamenti</h2>
            {saveStatus && <span className="save-status">{saveStatus}</span>}
          </div>

          {gymPlan.workouts.length === 0 ? (
            <p className="empty-state">Non hai ancora creato allenamenti.</p>
          ) : (
            <div className="card-list">
              {gymPlan.workouts.map((workout) => (
                <WorkoutCard
                  key={workout.id}
                  onDelete={handleDeleteWorkout}
                  onOpen={setSelectedWorkoutId}
                  onRename={handleWorkoutNameChange}
                  workout={workout}
                />
              ))}
            </div>
          )}

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
            <button type="submit">+ Nuovo allenamento</button>
          </form>

          {saveWarning && <p className="warning">{saveWarning}</p>}

          <section className="install-hint" aria-labelledby="install-title">
            <h2 id="install-title">Vuoi usarla come app?</h2>
            <p>Su iPhone apri Safari, tocca Condividi e poi Aggiungi alla schermata Home.</p>
          </section>

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

function WorkoutCard({ onDelete, onOpen, onRename, workout }) {
  function stopCardClick(event) {
    event.stopPropagation();
  }

  function handleCardKeyDown(event) {
    if (event.target !== event.currentTarget) {
      return;
    }

    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      onOpen(workout.id);
    }
  }

  return (
    <article
      className="workout-card workout-edit-card"
      onClick={() => onOpen(workout.id)}
      onKeyDown={handleCardKeyDown}
      role="button"
      tabIndex="0"
    >
      <div className="field-stack" onClick={stopCardClick}>
        <label htmlFor={`workout-${workout.id}-name`}>Nome allenamento</label>
        <input
          id={`workout-${workout.id}-name`}
          type="text"
          value={workout.name}
          onChange={(event) => onRename(workout.id, event.target.value)}
          onClick={stopCardClick}
          placeholder="Nome allenamento"
          autoComplete="off"
        />
      </div>

      <small>Creato il {todayFormatter.format(new Date(workout.createdAt))}</small>

      <div className="workout-card-actions">
        <button type="button" onClick={() => onOpen(workout.id)}>
          Apri
        </button>
        <button
          className="danger-button"
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onDelete(workout.id);
          }}
        >
          Elimina
        </button>
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
