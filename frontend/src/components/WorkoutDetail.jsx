import React, { Suspense, lazy, useEffect } from "react";
import ExerciseCard from "./ExerciseCard.jsx";
import ExerciseForm from "./ExerciseForm.jsx";
import SortableList from "./SortableList.jsx";
import WorkoutSessionControls from "./WorkoutSessionControls.jsx";

const PdfReferenceSection = lazy(() => import("./PdfReferenceSection.jsx"));

function WorkoutDetail({
  activePlan,
  activeSession,
  activeTimer,
  authToken,
  copiedExercise,
  editingWorkoutId,
  exerciseDraft,
  exerciseError,
  hasTimerBar,
  isEditing,
  isExerciseFormOpen,
  isPdfVisible,
  onAddExercise,
  onBack,
  onCancelExerciseForm,
  onCancelSession,
  onClearCopiedExercise,
  onCompleteSession,
  onCopyExercise,
  onDeleteExercise,
  onPasteExercise,
  onReorderExercises,
  onToggleEdit,
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
  saveWarning,
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
              <div className="page-header-top">
                <p className="eyebrow">Allenamento</p>
                <button
                  className={`edit-toggle-button${isEditing ? " edit-toggle-button--active" : ""}`}
                  type="button"
                  onClick={onToggleEdit}
                >
                  {isEditing ? "Salva" : "Modifica"}
                </button>
              </div>
              <h1>{selectedWorkout.name || "Allenamento senza nome"}</h1>
              <p className="detail-meta">
                Scheda: {activePlan.name || "Scheda senza nome"} · Oggi {todayLabel}
              </p>
              {isEditing && (
                <button className="inline-secondary-button" type="button" onClick={() => onStartEditingWorkout(selectedWorkout.id)}>
                  Rinomina allenamento
                </button>
              )}
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

        {activePlan.cloudPdf?.key && (
          <section className="content-section" aria-labelledby="pdf-reference-title">
            <div className="section-title-row">
              <h2 id="pdf-reference-title">Riferimento PDF</h2>
            </div>

            <Suspense fallback={<p className="pdf-viewer-message">Caricamento PDF...</p>}>
              <PdfReferenceSection
                isVisible={isPdfVisible}
                authToken={authToken}
                cloudPdf={activePlan.cloudPdf}
                onHide={onHidePdf}
                onPageChange={(pageNumber) => onWorkoutPdfPageChange(selectedWorkout.id, pageNumber)}
                onShow={onShowPdf}
                planId={activePlan.id}
                pdfName={activePlan.cloudPdf?.name}
                selectedPage={selectedWorkout.pdfPage}
              />
            </Suspense>
          </section>
        )}

        <section className="content-section" aria-labelledby="exercises-title">
          <div className="section-title-row">
            <h2 id="exercises-title">Esercizi</h2>
          </div>

          {selectedWorkoutExercises.length === 0 ? (
            <div className="empty-guide">
              <h3>Nessun esercizio</h3>
              <p>Aggiungi il primo esercizio con il pulsante <strong>+ Aggiungi esercizio</strong> qui sotto.</p>
            </div>
          ) : (
            <SortableList
              className="exercise-list"
              items={selectedWorkoutExercises}
              getKey={(exercise) => exercise.id}
              disabled={!isEditing}
              onReorder={onReorderExercises}
              renderItem={(exercise, dragHandleProps) => (
                <>
                  {isEditing && (
                    <button
                      className="drag-handle"
                      type="button"
                      aria-label="Trascina per riordinare"
                      {...dragHandleProps}
                    >
                      ⠿ Trascina
                    </button>
                  )}
                  <ExerciseCard
                    activeTimer={activeTimer}
                    completedSets={activeSession?.completedSetsByExercise?.[exercise.id] ?? []}
                    exercise={exercise}
                    isEditMode={isEditing}
                    isSessionActive={isSessionActive}
                    onCopy={onCopyExercise}
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
                </>
              )}
            />
          )}

          {copiedExercise && (
            <div className="paste-bar">
              <button className="paste-exercise-button" type="button" onClick={onPasteExercise}>
                Incolla "{copiedExercise.name?.trim() || "esercizio"}"
              </button>
              <button
                className="paste-clear-button"
                type="button"
                aria-label="Scarta esercizio copiato"
                onClick={onClearCopiedExercise}
              >
                ×
              </button>
            </div>
          )}

          {(isEditing || selectedWorkoutExercises.length === 0) &&
            (isExerciseFormOpen ? (
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
            ))}

          {saveWarning && <p className="warning">{saveWarning}</p>}
        </section>
      </section>
    </main>
  );
}

export default WorkoutDetail;
