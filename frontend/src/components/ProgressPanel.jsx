import React from "react";
import { parseNumericWeight } from "../utils/formatters.js";
import ProgressExerciseCard from "./ProgressExerciseCard.jsx";

function normalizeKey(name) {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function buildExerciseProgress(sessions) {
  const sorted = [...sessions].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  const groups = new Map();

  for (const session of sorted) {
    for (const ex of session.exercises ?? []) {
      const key = normalizeKey(ex.name);

      if (!key) {
        continue;
      }

      const weight = parseNumericWeight(ex.weight);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          displayName: ex.name?.trim() || key,
          lastWeight: weight,
          bestWeight: weight,
          sessionCount: 1,
          lastDate: session.completedAt,
          history: []
        });
      } else {
        const group = groups.get(key);
        group.sessionCount += 1;

        if (weight !== null && (group.bestWeight === null || weight > group.bestWeight)) {
          group.bestWeight = weight;
        }
      }

      groups.get(key).history.push({
        date: session.completedAt,
        workoutName: session.workoutName,
        weight: ex.weight,
        completedSets: ex.completedSets ?? 0,
        sets: ex.sets,
        reps: ex.reps,
        notes: ex.notes
      });
    }
  }

  return Array.from(groups.values()).sort(
    (a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime()
  );
}

const emptyState = (
  <div className="progress-empty">
    <p className="empty-state">Nessun progresso disponibile.</p>
    <p className="empty-state">Completa almeno un allenamento per vedere i progressi.</p>
  </div>
);

function ProgressPanel({ sessions }) {
  const exercises = sessions?.length > 0 ? buildExerciseProgress(sessions) : [];

  return (
    <section className="content-section progress-panel" aria-labelledby="progress-title">
      <div className="section-title-row">
        <h2 id="progress-title">Progressi</h2>
      </div>

      {exercises.length === 0 ? (
        emptyState
      ) : (
        <div className="progress-exercise-list">
          {exercises.map((ex) => (
            <ProgressExerciseCard key={ex.key} exercise={ex} />
          ))}
        </div>
      )}
    </section>
  );
}

export default ProgressPanel;
