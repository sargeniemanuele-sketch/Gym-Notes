import React, { useEffect, useState } from "react";
import { formatDuration } from "../utils/timer.js";

function WorkoutSessionControls({ workout, planId, activeSession, onStart, onComplete, onCancel, sessionFeedback }) {
  const isActiveForThis = activeSession?.workoutId === workout.id;
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  useEffect(() => {
    if (!isActiveForThis || !activeSession?.startedAt) {
      setElapsedSeconds(0);
      return undefined;
    }

    const startMs = new Date(activeSession.startedAt).getTime();

    const tick = () => {
      setElapsedSeconds(Math.floor((Date.now() - startMs) / 1000));
    };

    tick();
    const id = window.setInterval(tick, 1000);

    return () => window.clearInterval(id);
  }, [isActiveForThis, activeSession?.startedAt]);

  if (isActiveForThis) {
    return (
      <section className="session-controls session-active" aria-label="Sessione in corso">
        <div className="session-status">
          <span className="session-label">Allenamento in corso</span>
          <span className="session-timer">{formatDuration(elapsedSeconds)}</span>
        </div>
        <div className="session-actions">
          <button className="session-complete-button" type="button" onClick={onComplete}>
            Completa allenamento
          </button>
          <button className="session-cancel-button" type="button" onClick={onCancel}>
            Annulla sessione
          </button>
        </div>
      </section>
    );
  }

  return (
    <section className="session-controls" aria-label="Sessione allenamento">
      {sessionFeedback && <p className="session-feedback">{sessionFeedback}</p>}
      <button className="session-start-button" type="button" onClick={() => onStart(workout.id, planId)}>
        Inizia allenamento
      </button>
    </section>
  );
}

export default WorkoutSessionControls;
