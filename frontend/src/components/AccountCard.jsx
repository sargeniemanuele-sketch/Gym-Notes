import React from "react";

function AccountCard({
  auth,
  onLogout,
  saveStatus,
  saveWarning
}) {
  return (
    <section className="account-card" aria-label="Account">
      <h2>Account</h2>
      <p className="account-email">{auth.user?.email ?? "Account"}</p>
      {saveStatus && <p className="cloud-status cloud-status--ok">{saveStatus}</p>}
      {saveWarning && <p className="cloud-status cloud-status--error">{saveWarning}</p>}
      <p className="account-pdf-note">I PDF vengono sincronizzati nel cloud e restano in copia su questo dispositivo.</p>

      <div className="account-actions">
        <button className="text-danger-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>
    </section>
  );
}

export default AccountCard;
