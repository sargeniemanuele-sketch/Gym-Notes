import React from "react";

function AccountCard({
  auth,
  onLogout,
  onSyncNow,
  saveStatus,
  saveWarning
}) {
  return (
    <section className="account-card" aria-label="Account">
      <h2>Account</h2>
      <p className="account-email">{auth.user.email}</p>
      {saveStatus && <p className="cloud-status cloud-status--ok">{saveStatus}</p>}
      {saveWarning && <p className="cloud-status cloud-status--error">{saveWarning}</p>}
      <p className="account-pdf-note">I PDF restano salvati solo su questo dispositivo.</p>

      <div className="account-actions">
        <button type="button" onClick={onSyncNow}>
          Sincronizza ora
        </button>
        <button className="text-danger-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </section>
  );
}

export default AccountCard;
