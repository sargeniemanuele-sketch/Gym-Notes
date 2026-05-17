import React, { useMemo, useRef, useState } from "react";
import { clearGymData, createId, isStorageAvailable, loadGymData, saveGymData } from "./storage.js";

const todayFormatter = new Intl.DateTimeFormat("it-IT");
const emptyExerciseDraft = {
  name: "",
  sets: "",
  reps: "",
  weight: "",
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

  const numberMatch = stringValue.match(/^(\d+(?:[.,]\d+)?)(?:\s*kg)?$/i);

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
  const saveStatusTimeoutRef = useRef(null);
  const todayLabel = useMemo(() => getTodayLabel(), []);
  const storageAvailable = useMemo(() => isStorageAvailable(), []);

  const selectedWorkout = gymPlan?.workouts.find((workout) => workout.id === selectedWorkoutId);
  const selectedWorkoutExercises = selectedWorkout?.exercises ?? [];

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

  function handleResetData() {
    const confirmed = window.confirm("Vuoi cancellare tutti i dati salvati su questo dispositivo?");

    if (!confirmed) {
      return;
    }

    clearGymData();
    setGymPlan(null);
    setSelectedWorkoutId(null);
    setPlanName("");
    setWorkoutName("");
    setIsExerciseFormOpen(false);
    setExerciseDraft(emptyExerciseDraft);
    setExerciseError("");
    showSavedStatus("");
    setSaveWarning("");
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
                    exercise={exercise}
                    key={exercise.id}
                    onDelete={handleDeleteExercise}
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
        <div className="weight-input-row">
          <input
            id="exercise-weight"
            type="number"
            value={getNumericInputValue(draft.weight)}
            onChange={(event) => onChange("weight", normalizeNumericInputValue(event.target.value))}
            placeholder="70"
            min="0"
            step="0.5"
            inputMode="decimal"
            autoComplete="off"
          />
          <span aria-hidden="true">kg</span>
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

function ExerciseCard({ exercise, onDelete, onUpdate }) {
  const [isEditing, setIsEditing] = useState(false);
  const exerciseName = exercise.name?.trim() || "Esercizio senza nome";
  const setsValue = exercise.sets?.trim();
  const repsValue = exercise.reps?.trim();
  const performanceText =
    setsValue || repsValue
      ? `${setsValue || "-"} x ${repsValue || "-"}`
      : "Serie e ripetizioni non impostate";
  const weightText = formatWeightForDisplay(exercise.weight);
  const notesText = exercise.notes?.trim() || "Nessuna nota";

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
            <span>Note</span>
            <p>{notesText}</p>
          </div>
        </div>
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
        <div className="weight-input-row">
          <input
            id={`exercise-${exercise.id}-weight`}
            type="number"
            value={getNumericInputValue(exercise.weight)}
            onChange={(event) => onUpdate(exercise.id, "weight", normalizeNumericInputValue(event.target.value))}
            min="0"
            step="0.5"
            inputMode="decimal"
            autoComplete="off"
          />
          <span aria-hidden="true">kg</span>
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

export default App;
