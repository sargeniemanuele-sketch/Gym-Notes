import React, { useState } from "react";
import HistoryPanel from "./HistoryPanel.jsx";
import PdfHomeSection from "./PdfHomeSection.jsx";
import PlanTabs from "./PlanTabs.jsx";
import ProgressPanel from "./ProgressPanel.jsx";
import WorkoutCard from "./WorkoutCard.jsx";

function PlanDetail({
  activePlan,
  editingWorkoutId,
  hasTimerBar,
  isNewWorkoutFormOpen,
  isRenamingPlan,
  onBackToPlans,
  onCancelCreateWorkout,
  onCreateWorkout,
  onDeleteWorkout,
  onFileChange,
  onCancelPlanRename,
  onCancelWorkoutRename,
  onFinishPlanRename,
  onFinishWorkoutRename,
  onOpenFilePicker,
  onOpenWorkout,
  onPlanNameChange,
  onRemovePdf,
  onStartPlanRename,
  onShowNewWorkoutForm,
  onStartWorkoutRename,
  onWorkoutNameChange,
  onWorkoutNameInputChange,
  pdfError,
  pdfInputRef,
  saveWarning,
  todayLabel,
  workoutName
}) {
  const [activeTab, setActiveTab] = useState("workouts");

  return (
    <main className={`app-shell${hasTimerBar ? " app-shell--with-bar" : ""}`}>
      <section className="screen-panel">
        <button className="back-button plans-back-button" type="button" onClick={onBackToPlans}>
          ← Le tue schede
        </button>

        <header className="page-header">
          {isRenamingPlan ? (
            <div className="rename-panel">
              <div className="field-stack">
                <label htmlFor="plan-name-edit">Nome scheda</label>
                <input
                  id="plan-name-edit"
                  type="text"
                  value={activePlan.name}
                  onChange={(event) => onPlanNameChange(event.target.value)}
                  placeholder="Nome scheda"
                  autoComplete="off"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={onFinishPlanRename}>
                  Fine
                </button>
                <button className="ghost-button" type="button" onClick={onCancelPlanRename}>
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="eyebrow">Scheda</p>
              <h1>{activePlan.name || "Scheda senza nome"}</h1>
              <p className="detail-meta">Scheda attiva · Oggi {todayLabel}</p>
              <button className="inline-secondary-button" type="button" onClick={onStartPlanRename}>
                Rinomina scheda
              </button>
            </>
          )}
        </header>

        <PlanTabs activeTab={activeTab} onTabChange={setActiveTab} />

        {activeTab === "workouts" && (
          <>
            <section className="content-section" aria-labelledby="workouts-title">
              <div className="section-title-row">
                <h2 id="workouts-title">I tuoi allenamenti</h2>
              </div>

              {activePlan.workouts.length === 0 ? (
                <div className="empty-guide">
                  <h3>Nessun allenamento</h3>
                  <p>Crea il tuo primo allenamento con il pulsante <strong>+ Nuovo allenamento</strong> qui sotto.</p>
                </div>
              ) : (
                <div className="card-list">
                  {activePlan.workouts.map((workout) => (
                    <WorkoutCard
                      editingWorkoutId={editingWorkoutId}
                      key={workout.id}
                      onDelete={onDeleteWorkout}
                      onCancelRename={onCancelWorkoutRename}
                      onFinishRename={onFinishWorkoutRename}
                      onOpen={onOpenWorkout}
                      onRename={onWorkoutNameChange}
                      onStartRename={onStartWorkoutRename}
                      workout={workout}
                    />
                  ))}
                </div>
              )}

              {isNewWorkoutFormOpen ? (
                <form className="form-stack workout-form" onSubmit={onCreateWorkout}>
                  <label htmlFor="workout-name">Nome allenamento</label>
                  <input
                    id="workout-name"
                    type="text"
                    value={workoutName}
                    onChange={(event) => onWorkoutNameInputChange(event.target.value)}
                    placeholder="Es. Petto e tricipiti"
                    autoComplete="off"
                  />
                  <div className="form-actions">
                    <button type="submit">Crea allenamento</button>
                    <button className="ghost-button" type="button" onClick={onCancelCreateWorkout}>
                      Annulla
                    </button>
                  </div>
                </form>
              ) : (
                <button className="secondary-action workout-new-button" type="button" onClick={onShowNewWorkoutForm}>
                  + Nuovo allenamento
                </button>
              )}

              {saveWarning && <p className="warning">{saveWarning}</p>}
            </section>

            <PdfHomeSection
              activePlan={activePlan}
              onFileChange={onFileChange}
              onOpenFilePicker={onOpenFilePicker}
              onRemovePdf={onRemovePdf}
              pdfError={pdfError}
              pdfInputRef={pdfInputRef}
            />
          </>
        )}

        {activeTab === "history" && (
          <HistoryPanel sessions={activePlan.sessions} />
        )}

        {activeTab === "progress" && (
          <ProgressPanel sessions={activePlan.sessions} />
        )}
      </section>
    </main>
  );
}

export default PlanDetail;
