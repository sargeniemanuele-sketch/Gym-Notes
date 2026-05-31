import React from "react";

function AccountCard({
  auth,
  onLogout,
  onResetData,
  saveWarning
}) {
  return (
    <section className="account-card" aria-label="Account">
      <h2>Account</h2>
      <p className="account-email">{auth.user?.email ?? "Account"}</p>
      {saveWarning && <p className="cloud-status cloud-status--error">{saveWarning}</p>}

      <div className="account-actions">
        <button className="text-danger-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>

      {onResetData && (
        <div className="account-danger-zone">
          <p className="account-danger-note">Azione irreversibile: elimina tutte le schede e lo storico dal cloud.</p>
          <button className="reset-button" type="button" onClick={onResetData}>
            Cancella tutti i dati
          </button>
        </div>
      )}
    </section>
  );
}

export default AccountCard;
