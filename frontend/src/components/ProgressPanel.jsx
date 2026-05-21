import React from "react";
import { parseNumericWeight } from "../utils/formatters.js";
import ProgressExerciseCard from "./ProgressExerciseCard.jsx";

function normalizeKey(name) {
  return (name ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function parsePositiveNumber(value) {
  const str = typeof value === "string" ? value.trim().replace(",", ".") : "";

  if (!str) {
    return null;
  }

  const n = Number(str);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function buildEntry(session, ex) {
  const weight = parseNumericWeight(ex.weight);
  const reps = parsePositiveNumber(ex.reps);
  const completedSets = ex.completedSets ?? 0;
  const volume =
    completedSets > 0 && reps !== null && weight !== null
      ? completedSets * reps * weight
      : null;

  return {
    date: session.completedAt,
    workoutName: session.workoutName,
    durationSeconds: session.durationSeconds,
    weight: ex.weight,
    numericWeight: weight,
    completedSets,
    sets: ex.sets,
    reps: ex.reps,
    numericReps: reps,
    volume,
    notes: ex.notes
  };
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

      const entry = buildEntry(session, ex);

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          displayName: ex.name?.trim() || key,
          lastWeight: entry.numericWeight,
          bestWeight: entry.numericWeight,
          sessionCount: 1,
          lastDate: session.completedAt,
          history: []
        });
      } else {
        const group = groups.get(key);
        group.sessionCount += 1;

        if (entry.numericWeight !== null && (group.bestWeight === null || entry.numericWeight > group.bestWeight)) {
          group.bestWeight = entry.numericWeight;
        }
      }

      groups.get(key).history.push(entry);
    }
  }

  return Array.from(groups.values())
    .map((group) => ({
      ...group,
      lastEntry: group.history[0] ?? null,
      previousEntry: group.history[1] ?? null
    }))
    .sort((a, b) => new Date(b.lastDate).getTime() - new Date(a.lastDate).getTime());
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
