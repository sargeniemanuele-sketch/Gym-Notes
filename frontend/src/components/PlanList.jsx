import React from "react";
import AccountCard from "./AccountCard.jsx";
import PlanCard from "./PlanCard.jsx";

function PlanList({
  auth,
  hasTimerBar,
  isEditing,
  isNewPlanFormOpen,
  onCancelCreatePlan,
  onCreatePlan,
  onDeletePlan,
  onDuplicatePlan,
  onLogout,
  onOpenNewPlanForm,
  onOpenPlan,
  onPlanNameChange,
  onResetData,
  onToggleEdit,
  planName,
  plans,
  saveWarning
}) {
  return (
    <main className={`app-shell${hasTimerBar ? " app-shell--with-bar" : ""}`}>
      <section className="plans-panel" aria-labelledby="app-title">
        <header className="plans-header">
          <div className="page-header-top">
            <p className="eyebrow">Le tue schede</p>
            {plans.length > 0 && (
              <button
                className={`edit-toggle-button${isEditing ? " edit-toggle-button--active" : ""}`}
                type="button"
                onClick={onToggleEdit}
              >
                {isEditing ? "Salva" : "Modifica"}
              </button>
            )}
          </div>
          <div className="brand-title-row">
            <img className="brand-mark" src="/icons/icon-192.png" alt="" aria-hidden="true" />
            <h1 id="app-title">Gym Notes</h1>
          </div>
        </header>

        {plans.length === 0 ? (
          <>
            <div className="plans-empty">
              <h2>Nessuna scheda creata</h2>
              <p className="empty-state">Crea la tua prima scheda palestra.</p>
            </div>

            <form className="form-stack plan-create-form" onSubmit={onCreatePlan}>
              <label htmlFor="plan-name">Nome scheda</label>
              <input
                id="plan-name"
                type="text"
                value={planName}
                onChange={(event) => onPlanNameChange(event.target.value)}
                placeholder="Es. Scheda massa"
                autoComplete="off"
              />
              <button type="submit">Crea scheda</button>
            </form>
          </>
        ) : (
          <>
            <div className="plan-list" aria-label="Le tue schede">
              {plans.map((plan) => (
                <PlanCard
                  key={plan.id}
                  isEditing={isEditing}
                  onDelete={onDeletePlan}
                  onDuplicate={onDuplicatePlan}
                  onOpen={onOpenPlan}
                  plan={plan}
                />
              ))}
            </div>

            {isEditing &&
              (isNewPlanFormOpen ? (
                <form className="form-stack plan-create-form" onSubmit={onCreatePlan}>
                  <label htmlFor="plan-name">Nome scheda</label>
                  <input
                    id="plan-name"
                    type="text"
                    value={planName}
                    onChange={(event) => onPlanNameChange(event.target.value)}
                    placeholder="Es. Scheda massa"
                    autoComplete="off"
                  />
                  <div className="form-actions">
                    <button type="submit">Crea scheda</button>
                    <button className="ghost-button" type="button" onClick={onCancelCreatePlan}>
                      Chiudi
                    </button>
                  </div>
                </form>
              ) : (
                <button className="secondary-action plan-new-button" type="button" onClick={onOpenNewPlanForm}>
                  + Nuova scheda
                </button>
              ))}
          </>
        )}

        <AccountCard
          auth={auth}
          onLogout={onLogout}
          onResetData={isEditing ? onResetData : undefined}
          saveWarning={saveWarning}
        />
      </section>
    </main>
  );
}

export default PlanList;
