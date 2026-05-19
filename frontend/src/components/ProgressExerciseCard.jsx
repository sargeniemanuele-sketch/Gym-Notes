import React, { useState } from "react";
import { formatDate, formatWeightForDisplay } from "../utils/formatters.js";

function setsLabel(entry) {
  const totalSets = Number.parseInt(entry.sets, 10);
  const hasTotalSets = Number.isFinite(totalSets) && totalSets > 0;
  const completedSets = entry.completedSets ?? 0;

  if (!hasTotalSets && completedSets === 0) {
    return null;
  }

  return hasTotalSets ? `${completedSets} / ${totalSets}` : String(completedSets);
}

function schemaLabel(entry) {
  const parts = [entry.sets, entry.reps].filter(Boolean);
  return parts.length > 0 ? parts.join(" x ") : null;
}

function ProgressExerciseCard({ exercise }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { displayName, lastWeight, bestWeight, sessionCount, lastDate, history } = exercise;

  const lastWeightText = lastWeight !== null ? `${lastWeight} kg` : "Carico non impostato";
  const bestWeightText = bestWeight !== null ? `${bestWeight} kg` : "Carico non impostato";
  const sessionLabel = sessionCount === 1 ? "1 sessione" : `${sessionCount} sessioni`;

  return (
    <article className="progress-card">
      <div className="progress-card-summary">
        <div className="progress-card-info">
          <p className="progress-card-name">{displayName}</p>
          <div className="progress-card-weights">
            <span className="progress-weight-item">
              <span className="progress-weight-label">Ultimo</span>
              <span className="progress-weight-value">{lastWeightText}</span>
            </span>
            <span className="progress-weight-item">
              <span className="progress-weight-label">Migliore</span>
              <span className="progress-weight-value">{bestWeightText}</span>
            </span>
          </div>
          <p className="progress-card-meta">
            {sessionLabel} · Ultima volta {formatDate(lastDate)}
          </p>
        </div>
        <button
          className="progress-card-toggle"
          type="button"
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((v) => !v)}
        >
          {isExpanded ? "Chiudi" : "Dettagli"}
        </button>
      </div>

      {isExpanded && (
        <div className="progress-card-body">
          <ul className="progress-history-list">
            {history.map((entry, i) => {
              const sets = setsLabel(entry);
              const schema = schemaLabel(entry);

              return (
                <li key={i} className="progress-history-item">
                  <p className="progress-history-date">
                    {formatDate(entry.date)} · {entry.workoutName || "Allenamento"}
                  </p>
                  <dl className="progress-history-fields">
                    <div className="progress-history-field">
                      <dt>Carico</dt>
                      <dd>{formatWeightForDisplay(entry.weight)}</dd>
                    </div>
                    {sets !== null && (
                      <div className="progress-history-field">
                        <dt>Serie</dt>
                        <dd>{sets}</dd>
                      </div>
                    )}
                    {schema && (
                      <div className="progress-history-field">
                        <dt>Schema</dt>
                        <dd>{schema}</dd>
                      </div>
                    )}
                    {entry.notes && (
                      <div className="progress-history-field">
                        <dt>Note</dt>
                        <dd>{entry.notes}</dd>
                      </div>
                    )}
                  </dl>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </article>
  );
}

export default ProgressExerciseCard;
