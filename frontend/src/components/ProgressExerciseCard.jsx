import React, { useState } from "react";
import { formatDate, formatWeightForDisplay } from "../utils/formatters.js";
import { formatDuration } from "../utils/timer.js";

function formatNumber(value) {
  if (!Number.isFinite(value)) {
    return "";
  }

  return Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/\.?0+$/, "");
}

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

function weightDeltaLabel(currentEntry, previousEntry) {
  const currentWeight = currentEntry?.numericWeight;
  const previousWeight = previousEntry?.numericWeight;

  if (currentWeight === null || currentWeight === undefined) {
    return "Carico non impostato";
  }

  if (previousWeight === null || previousWeight === undefined) {
    return "Prima sessione";
  }

  const delta = currentWeight - previousWeight;

  if (delta === 0) {
    return "Stabile";
  }

  return `${delta > 0 ? "+" : ""}${formatNumber(delta)} kg`;
}

function volumeLabel(entry) {
  if (entry?.volume === null || entry?.volume === undefined) {
    return "Non calcolabile";
  }

  return `${formatNumber(entry.completedSets)} x ${formatNumber(entry.numericReps)} x ${formatNumber(
    entry.numericWeight
  )} kg = ${formatNumber(entry.volume)} kg`;
}

function ProgressExerciseCard({ exercise }) {
  const [isExpanded, setIsExpanded] = useState(false);

  const { displayName, lastWeight, bestWeight, sessionCount, lastDate, history, lastEntry, previousEntry } = exercise;

  const lastWeightText = lastWeight !== null ? `${lastWeight} kg` : "Carico non impostato";
  const bestWeightText = bestWeight !== null ? `${bestWeight} kg` : "Carico non impostato";
  const sessionLabel = sessionCount === 1 ? "1 sessione" : `${sessionCount} sessioni`;
  const lastSets = lastEntry ? setsLabel(lastEntry) : null;
  const lastSchema = lastEntry ? schemaLabel(lastEntry) : null;
  const lastVolume = volumeLabel(lastEntry);

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
            <span className="progress-weight-item">
              <span className="progress-weight-label">Differenza</span>
              <span className="progress-weight-value">{weightDeltaLabel(lastEntry, previousEntry)}</span>
            </span>
          </div>
          {lastEntry && (
            <dl className="progress-card-latest">
              {lastSets && (
                <div>
                  <dt>Serie completate</dt>
                  <dd>{lastSets}</dd>
                </div>
              )}
              {lastSchema && (
                <div>
                  <dt>Schema</dt>
                  <dd>{lastSchema}</dd>
                </div>
              )}
              <div>
                <dt>Volume totale sollevato</dt>
                <dd>{lastVolume}</dd>
              </div>
            </dl>
          )}
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
              const duration =
                Number.isFinite(entry.durationSeconds) && entry.durationSeconds > 0
                  ? formatDuration(entry.durationSeconds)
                  : null;

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
                    <div className="progress-history-field">
                      <dt>Volume</dt>
                      <dd>{volumeLabel(entry)}</dd>
                    </div>
                    {duration && (
                      <div className="progress-history-field">
                        <dt>Tempo</dt>
                        <dd>{duration}</dd>
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
