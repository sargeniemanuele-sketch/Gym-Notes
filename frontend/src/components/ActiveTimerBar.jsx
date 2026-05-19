import React from "react";
import { formatTimerTime } from "../utils/timer.js";

function ActiveTimerBar({ activeTimer, onNavigate, onPause, onResume, onReset }) {
  if (!activeTimer) {
    return null;
  }

  const { exerciseName, workoutName, remainingMs, status } = activeTimer;
  const isRunning = status === "running";
  const isPaused = status === "paused";
  const isFinished = status === "finished";

  const label = [exerciseName, workoutName].filter(Boolean).join(" · ");

  return (
    <div
      className={`active-timer-bar${isFinished ? " active-timer-bar--finished" : ""}${isPaused ? " active-timer-bar--paused" : ""}`}
    >
      <button
        className="active-timer-bar-info"
        type="button"
        title="Vai all'esercizio"
        onClick={onNavigate}
      >
        {label && <span className="active-timer-bar-label">{label}</span>}
        <span className="active-timer-bar-time" aria-live="polite" aria-atomic="true">
          {formatTimerTime(remainingMs)}
          {isFinished && <span className="active-timer-bar-done"> · Recupero finito</span>}
          {isPaused && <span className="active-timer-bar-paused-label"> · In pausa</span>}
        </span>
      </button>

      <div className="active-timer-bar-actions">
        {isRunning && (
          <button className="active-timer-bar-btn" type="button" onClick={onPause}>
            Pausa
          </button>
        )}
        {isPaused && (
          <button className="active-timer-bar-btn" type="button" onClick={onResume}>
            Riprendi
          </button>
        )}
        <button className="active-timer-bar-btn active-timer-bar-btn--ghost" type="button" onClick={onReset}>
          Reset
        </button>
      </div>
    </div>
  );
}

export default ActiveTimerBar;
