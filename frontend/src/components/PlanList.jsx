import React from "react";
import AccountCard from "./AccountCard.jsx";
import PlanCard from "./PlanCard.jsx";

function PlanList({
  auth,
  cloudStatus,
  hasTimerBar,
  isNewPlanFormOpen,
  onCancelCreatePlan,
  onCreatePlan,
  onDeletePlan,
  onDownloadFromCloud,
  onDuplicatePlan,
  onLogin,
  onLogout,
  onOpenNewPlanForm,
  onOpenPlan,
  onPlanNameChange,
  onRegister,
  onUploadToCloud,
  planName,
  plans,
  saveWarning,
  storageAvailable
}) {
  return (
    <main className={`app-shell${hasTimerBar ? " app-shell--with-bar" : ""}`}>
      <section className="plans-panel" aria-labelledby="app-title">
        <header className="plans-header">
          <p className="eyebrow">Scheda locale sul tuo dispositivo</p>
          <div className="brand-title-row">
            <img className="brand-mark" src="/icons/icon-192.png" alt="" aria-hidden="true" />
            <h1 id="app-title">Gym Notes</h1>
          </div>
          <p className="subtitle">Le tue schede</p>
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
                  onDelete={onDeletePlan}
                  onDuplicate={onDuplicatePlan}
                  onOpen={onOpenPlan}
                  plan={plan}
                />
              ))}
            </div>

            {isNewPlanFormOpen ? (
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
                    Annulla
                  </button>
                </div>
              </form>
            ) : (
              <button className="secondary-action plan-new-button" type="button" onClick={onOpenNewPlanForm}>
                + Nuova scheda
              </button>
            )}
          </>
        )}

        {!storageAvailable && (
          <p className="warning">
            Il salvataggio locale non è disponibile su questo browser. I dati potrebbero non essere mantenuti.
          </p>
        )}
        {saveWarning && <p className="warning">{saveWarning}</p>}

        <AccountCard
          auth={auth}
          cloudStatus={cloudStatus}
          onLogin={onLogin}
          onRegister={onRegister}
          onLogout={onLogout}
          onUpload={onUploadToCloud}
          onDownload={onDownloadFromCloud}
        />
      </section>
    </main>
  );
}

export default PlanList;
