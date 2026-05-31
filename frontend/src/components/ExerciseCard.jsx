import React, { useState } from "react";
import { formatRestForDisplay, formatWeightForDisplay } from "../utils/formatters.js";
import { getNumericInputValue, normalizeNumericInputValue } from "../utils/numbers.js";
import { getRestDurationSeconds } from "../utils/timer.js";
import RestTimer from "./RestTimer.jsx";

function ExerciseCard({ activeTimer, completedSets = [], exercise, isSessionActive, onDelete, onPauseTimer, onResetTimer, onResumeTimer, onStartTimer, onToggleSet, onUpdate }) {
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
  const notesText = exercise.notes?.trim();
  const exerciseTimer = activeTimer?.exerciseId === exercise.id ? activeTimer : null;
  const totalSets = Number.parseInt(exercise.sets, 10);
  const showSetsTracker = Number.isFinite(totalSets) && totalSets > 0;
  const completedCount = completedSets.length;
  const allDone = showSetsTracker && completedCount >= totalSets;

  if (!isEditing) {
    return (
      <article
        id={`exercise-${exercise.id}`}
        className={`exercise-card exercise-card-compact${
          isSessionActive && showSetsTracker
            ? allDone
              ? " exercise-card--done"
              : " exercise-card--active"
            : ""
        }`}
      >
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

          {notesText && (
            <div className="exercise-read-block">
              <span>Note</span>
              <p>{notesText}</p>
            </div>
          )}
        </div>

        <RestTimer
          durationSeconds={restDurationSeconds}
          onPause={() => onPauseTimer(exercise.id)}
          onReset={() => onResetTimer(exercise.id)}
          onResume={() => onResumeTimer(exercise.id)}
          onStart={() => onStartTimer(exercise.id, restDurationSeconds, exercise.name?.trim() ?? "")}
          timer={exerciseTimer}
        />

        {showSetsTracker && (
          <div className={`sets-tracker${allDone ? " sets-tracker--all-done" : ""}`}>
            {isSessionActive ? (
              <>
                <div className="sets-tracker-header">
                  <span className="sets-tracker-label">Serie</span>
                  <span className="sets-tracker-count">
                    {completedCount} / {totalSets} completate
                  </span>
                </div>
                <div className="sets-tracker-buttons">
                  {Array.from({ length: totalSets }, (_, i) => i + 1).map((setNum) => {
                    const isDone = completedSets.includes(setNum);
                    return (
                      <button
                        key={setNum}
                        className={`set-btn${isDone ? " set-btn--done" : ""}`}
                        type="button"
                        aria-pressed={isDone}
                        aria-label={`Serie ${setNum}${isDone ? ", completata" : ""}`}
                        onClick={() => onToggleSet(exercise.id, setNum)}
                      >
                        {isDone ? `✓ ${setNum}` : setNum}
                      </button>
                    );
                  })}
                </div>
              </>
            ) : (
              <p className="sets-tracker-hint">Inizia l'allenamento per segnare le serie</p>
            )}
          </div>
        )}
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

export default ExerciseCard;
