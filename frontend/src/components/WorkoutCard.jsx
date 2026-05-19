import React from "react";
import { formatDate } from "../utils/formatters.js";

function WorkoutCard({
  editingWorkoutId,
  onCancelRename,
  onDelete,
  onFinishRename,
  onOpen,
  onRename,
  onStartRename,
  workout
}) {
  const isRenaming = editingWorkoutId === workout.id;
  const exerciseCount = workout.exercises.length;
  const exerciseLabel = exerciseCount === 1 ? "1 esercizio" : `${exerciseCount} esercizi`;
  const workoutName = workout.name?.trim() || "Allenamento senza nome";

  function handleStartEdit() {
    onStartRename(workout.id);
  }

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
          <p>
            {exerciseLabel} · Creato il {formatDate(workout.createdAt)}
          </p>
        </div>
      )}

      <div className="workout-card-actions">
        {isRenaming ? (
          <>
            <button type="button" onClick={onFinishRename}>
              Fine
            </button>
            <button className="ghost-button" type="button" onClick={onCancelRename}>
              Annulla
            </button>
            <button className="text-danger-button" type="button" onClick={() => onDelete(workout.id)}>
              Elimina
            </button>
          </>
        ) : (
          <>
            <button type="button" onClick={() => onOpen(workout.id)}>
              Apri
            </button>
            <button className="ghost-button" type="button" onClick={handleStartEdit}>
              Modifica
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default WorkoutCard;
