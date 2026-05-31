import React, { useEffect, useState } from "react";

function formatElapsed(startedAt) {
  const startMs = new Date(startedAt).getTime();
  if (Number.isNaN(startMs)) {
    return "";
  }

  const totalSeconds = Math.max(0, Math.floor((Date.now() - startMs) / 1000));
  const minutes = Math.floor(totalSeconds / 60);
  const hours = Math.floor(minutes / 60);
  const mm = String(minutes % 60).padStart(2, "0");
  const ss = String(totalSeconds % 60).padStart(2, "0");

  return hours > 0 ? `${hours}:${mm}:${ss}` : `${mm}:${ss}`;
}

function ActiveSessionBar({ startedAt, workoutName, planName, onResume }) {
  const [elapsed, setElapsed] = useState(() => formatElapsed(startedAt));

  useEffect(() => {
    setElapsed(formatElapsed(startedAt));
    const id = window.setInterval(() => {
      setElapsed(formatElapsed(startedAt));
    }, 1000);

    return () => window.clearInterval(id);
  }, [startedAt]);

  const label = [workoutName, planName].filter(Boolean).join(" · ");

  return (
    <div className="active-session-bar">
      <button
        className="active-session-bar-info"
        type="button"
        title="Riprendi allenamento"
        onClick={onResume}
      >
        <span className="active-session-bar-eyebrow">
          <span className="active-session-bar-pulse" aria-hidden="true" />
          Sessione in corso
        </span>
        {label && <span className="active-session-bar-label">{label}</span>}
      </button>

      <div className="active-session-bar-actions">
        {elapsed && (
          <span className="active-session-bar-time" aria-live="off">
            {elapsed}
          </span>
        )}
        <button className="active-session-bar-btn" type="button" onClick={onResume}>
          Riprendi
        </button>
      </div>
    </div>
  );
}

export default ActiveSessionBar;
