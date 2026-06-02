import React from "react";

function PlanCard({ isEditing = false, onDelete, onDuplicate, onOpen, plan }) {
  const workoutCount = plan.workouts.length;
  const workoutLabel = workoutCount === 1 ? "1 allenamento" : `${workoutCount} allenamenti`;
  const pdfLabel = plan.cloudPdf?.key ? "PDF salvato nel cloud" : "Nessun PDF";

  return (
    <article className="plan-card">
      <div>
        <h2>{plan.name || "Scheda senza nome"}</h2>
        <p>
          {workoutLabel} · {pdfLabel}
        </p>
      </div>

      <div className="plan-card-actions">
        <button type="button" onClick={() => onOpen(plan.id)}>
          Apri
        </button>
        {isEditing && (
          <>
            <button className="ghost-button plan-duplicate-button" type="button" onClick={() => onDuplicate(plan.id)}>
              Duplica
            </button>
            <button className="text-danger-button" type="button" onClick={() => onDelete(plan.id)}>
              Elimina
            </button>
          </>
        )}
      </div>
    </article>
  );
}

export default PlanCard;
