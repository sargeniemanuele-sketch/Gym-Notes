import React from "react";

function AccountCard({ auth, onLogout }) {
  return (
    <section className="account-card" aria-label="Account">
      <h2>Account</h2>
      <p className="account-email">{auth.user.email}</p>
      <button className="text-danger-button" type="button" onClick={onLogout}>
        Logout
      </button>
    </section>
  );
}

export default AccountCard;
