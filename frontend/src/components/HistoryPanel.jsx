import React from "react";
import SessionCard from "./SessionCard.jsx";

function HistoryPanel({ sessions }) {
  const sorted = [...(sessions ?? [])].sort(
    (a, b) => new Date(b.completedAt).getTime() - new Date(a.completedAt).getTime()
  );

  return (
    <section className="content-section history-panel" aria-labelledby="history-title">
      <div className="section-title-row">
        <h2 id="history-title">Storico allenamenti</h2>
      </div>

      {sorted.length === 0 ? (
        <div className="history-empty">
          <p className="empty-state">Nessun allenamento completato.</p>
          <p className="empty-state">Completa un allenamento per vedere lo storico.</p>
        </div>
      ) : (
        <div className="session-card-list">
          {sorted.map((session) => (
            <SessionCard key={session.id} session={session} />
          ))}
        </div>
      )}
    </section>
  );
}

export default HistoryPanel;
