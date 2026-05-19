import React, { useState } from "react";
import { formatDateTimeItalian, formatRestForDisplay, formatWeightForDisplay } from "../utils/formatters.js";
import { formatDuration } from "../utils/timer.js";

function renderCompletedSets(ex) {
  const completedSets = ex.completedSets ?? 0;
  const totalSets = Number.parseInt(ex.sets, 10);
  const hasTotalSets = Number.isFinite(totalSets) && totalSets > 0;

  if (!hasTotalSets && completedSets === 0) {
    return null;
  }

  const label = hasTotalSets ? `${completedSets} / ${totalSets}` : String(completedSets);

  return (
    <div className="session-exercise-field">
      <dt>Serie completate</dt>
      <dd>{label}</dd>
    </div>
  );
}

function SessionCard({ session }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const exerciseCount = session.exercises?.length ?? 0;
  const exerciseLabel = exerciseCount === 1 ? "1 esercizio" : `${exerciseCount} esercizi`;

  return (
    <article className="session-card">
      <div className="session-card-summary">
        <div className="session-card-info">
          <p className="session-card-name">{session.workoutName || "Allenamento senza nome"}</p>
          <p className="session-card-meta">
            {formatDateTimeItalian(session.completedAt)} · {formatDuration(session.durationSeconds)}
          </p>
          <p className="session-card-count">{exerciseLabel}</p>
        </div>
        <button
          className="session-card-toggle"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((v) => !v)}
        >
          {isExpanded ? "Chiudi" : "Dettagli"}
        </button>
      </div>

      {isExpanded && (
        <div className="session-card-body">
          {exerciseCount === 0 ? (
            <p className="session-card-empty">Nessun esercizio salvato in questa sessione.</p>
          ) : (
            <ul className="session-exercise-list">
              {session.exercises.map((ex, index) => (
                <li className="session-exercise-item" key={ex.exerciseId || index}>
                  <p className="session-exercise-name">{ex.name || "Esercizio senza nome"}</p>
                  {(ex.sets || ex.reps) && (
                    <p className="session-exercise-sets">
                      {[ex.sets, ex.reps].filter(Boolean).join(" x ")}
                    </p>
                  )}
                  <dl className="session-exercise-fields">
                    {renderCompletedSets(ex)}
                    <div className="session-exercise-field">
                      <dt>Carico</dt>
                      <dd>{formatWeightForDisplay(ex.weight)}</dd>
                    </div>
                    <div className="session-exercise-field">
                      <dt>Recupero</dt>
                      <dd>{formatRestForDisplay(ex.rest)}</dd>
                    </div>
                    {ex.notes && (
                      <div className="session-exercise-field session-exercise-field--notes">
                        <dt>Note</dt>
                        <dd>{ex.notes}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </article>
  );
}

export default SessionCard;
