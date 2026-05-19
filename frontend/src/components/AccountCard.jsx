import React from "react";

function AccountCard({ auth, cloudStatus, onLogout, onUpload, onDownload }) {
  return (
    <section className="account-card" aria-label="Account">
      <h2>Account</h2>
      <p className="account-email">{auth.user.email}</p>

      {cloudStatus && (
        <p className={`cloud-status${cloudStatus.isError ? " cloud-status--error" : " cloud-status--ok"}`}>
          {cloudStatus.message}
        </p>
      )}

      <div className="account-actions">
        <button type="button" onClick={onUpload}>
          Sincronizza ora
        </button>
        <button className="ghost-button" type="button" onClick={onDownload}>
          Scarica dal cloud
        </button>
        <button className="text-danger-button" type="button" onClick={onLogout}>
          Logout
        </button>
      </div>

      <p className="account-pdf-note">
        I PDF restano salvati solo su questo dispositivo e non vengono sincronizzati.
      </p>
    </section>
  );
}

export default AccountCard;
