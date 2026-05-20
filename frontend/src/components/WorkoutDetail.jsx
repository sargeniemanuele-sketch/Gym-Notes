import React, { useEffect } from "react";
import ExerciseCard from "./ExerciseCard.jsx";
import ExerciseForm from "./ExerciseForm.jsx";
import PdfReferenceSection from "./PdfReferenceSection.jsx";
import WorkoutSessionControls from "./WorkoutSessionControls.jsx";

function WorkoutDetail({
  activePlan,
  activeSession,
  activeTimer,
  authToken,
  editingWorkoutId,
  exerciseDraft,
  exerciseError,
  hasTimerBar,
  isExerciseFormOpen,
  isPdfVisible,
  onAddExercise,
  onBack,
  onCancelExerciseForm,
  onCancelSession,
  onCompleteSession,
  onDeleteExercise,
  onExerciseDraftChange,
  onHidePdf,
  onPauseRestTimer,
  onResetRestTimer,
  onResumeRestTimer,
  onShowExerciseForm,
  onShowPdf,
  onCancelEditingWorkout,
  onStartEditingWorkout,
  onStartRestTimer,
  onStartSession,
  onStopEditingWorkout,
  onToggleExerciseSet,
  onUpdateExercise,
  onWorkoutNameChange,
  onWorkoutPdfPageChange,
  saveStatus,
  selectedWorkout,
  sessionFeedback,
  todayLabel
}) {
  const selectedWorkoutExercises = selectedWorkout?.exercises ?? [];
  const isSessionActive = activeSession?.workoutId === selectedWorkout.id;

  useEffect(() => {
    if (!activeTimer?.exerciseId) {
      return undefined;
    }

    const id = window.setTimeout(() => {
      const el = document.getElementById(`exercise-${activeTimer.exerciseId}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 80);

    return () => window.clearTimeout(id);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // intenzionale: scroll solo al montaggio, non ad ogni cambio di timer

  return (
    <main className={`app-shell${hasTimerBar ? " app-shell--with-bar" : ""}`}>
      <section className="screen-panel">
        <button className="back-button plans-back-button" type="button" onClick={onBack}>
          ← Torna alla scheda
        </button>

        <header className="page-header">
          {editingWorkoutId === selectedWorkout.id ? (
            <div className="rename-panel">
              <div className="field-stack">
                <label htmlFor="detail-workout-name">Nome allenamento</label>
                <input
                  id="detail-workout-name"
                  type="text"
                  value={selectedWorkout.name}
                  onChange={(event) => onWorkoutNameChange(selectedWorkout.id, event.target.value)}
                  placeholder="Nome allenamento"
                  autoComplete="off"
                />
              </div>
              <div className="form-actions">
                <button type="button" onClick={onStopEditingWorkout}>
                  Fine
                </button>
                <button className="ghost-button" type="button" onClick={onCancelEditingWorkout}>
                  Annulla
                </button>
              </div>
            </div>
          ) : (
            <>
              <h1>{selectedWorkout.name || "Allenamento senza nome"}</h1>
              <p className="detail-meta">
                Scheda: {activePlan.name || "Scheda senza nome"} · Oggi {todayLabel}
              </p>
              <button className="inline-secondary-button" type="button" onClick={() => onStartEditingWorkout(selectedWorkout.id)}>
                Rinomina allenamento
              </button>
            </>
          )}
        </header>

        <WorkoutSessionControls
          activeSession={activeSession}
          onCancel={onCancelSession}
          onComplete={onCompleteSession}
          onStart={onStartSession}
          planId={activePlan.id}
          sessionFeedback={sessionFeedback}
          workout={selectedWorkout}
        />

        {(activePlan.pdfId || activePlan.cloudPdf?.key) && (
          <section className="content-section" aria-labelledby="pdf-reference-title">
            <div className="section-title-row">
              <h2 id="pdf-reference-title">Riferimento PDF</h2>
              {saveStatus && <span className="save-status">{saveStatus}</span>}
            </div>

            <PdfReferenceSection
              isVisible={isPdfVisible}
              authToken={authToken}
              cloudPdf={activePlan.cloudPdf}
              onHide={onHidePdf}
              onPageChange={(pageNumber) => onWorkoutPdfPageChange(selectedWorkout.id, pageNumber)}
              onShow={onShowPdf}
              planId={activePlan.id}
              pdfId={activePlan.pdfId}
              pdfName={activePlan.cloudPdf?.name ?? activePlan.pdfName}
              selectedPage={selectedWorkout.pdfPage}
            />
          </section>
        )}

        <section className="content-section" aria-labelledby="exercises-title">
          <div className="section-title-row">
            <h2 id="exercises-title">Esercizi</h2>
            {saveStatus && <span className="save-status">{saveStatus}</span>}
          </div>

          {selectedWorkoutExercises.length === 0 ? (
            <p className="empty-state">Non hai ancora aggiunto esercizi.</p>
          ) : (
            <div className="exercise-list">
              {selectedWorkoutExercises.map((exercise) => (
                <ExerciseCard
                  activeTimer={activeTimer}
                  completedSets={activeSession?.completedSetsByExercise?.[exercise.id] ?? []}
                  exercise={exercise}
                  isSessionActive={isSessionActive}
                  key={exercise.id}
                  onDelete={onDeleteExercise}
                  onPauseTimer={onPauseRestTimer}
                  onResetTimer={onResetRestTimer}
                  onResumeTimer={onResumeRestTimer}
                  onStartTimer={(exerciseId, durationSeconds, exerciseName) =>
                    onStartRestTimer(exerciseId, durationSeconds, exerciseName, selectedWorkout.name, selectedWorkout.id, activePlan.id)
                  }
                  onToggleSet={onToggleExerciseSet}
                  onUpdate={onUpdateExercise}
                />
              ))}
            </div>
          )}

          {isExerciseFormOpen ? (
            <ExerciseForm
              draft={exerciseDraft}
              error={exerciseError}
              onCancel={onCancelExerciseForm}
              onChange={onExerciseDraftChange}
              onSubmit={onAddExercise}
            />
          ) : (
            <button className="secondary-action" type="button" onClick={onShowExerciseForm}>
              + Aggiungi esercizio
            </button>
          )}
        </section>
      </section>
    </main>
  );
}

export default WorkoutDetail;
