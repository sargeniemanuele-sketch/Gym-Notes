import React from "react";
import { formatTimerTime } from "../utils/timer.js";

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

export default RestTimer;
