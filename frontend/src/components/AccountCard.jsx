import React, { useState } from "react";

function AccountCard({ auth, cloudStatus, onLogin, onRegister, onLogout, onUpload, onDownload }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [localError, setLocalError] = useState("");
  const [loading, setLoading] = useState(false);
  const [postLoginOffer, setPostLoginOffer] = useState(false);
  const [offerLoading, setOfferLoading] = useState(false);

  function switchMode(next) {
    setMode(next);
    setLocalError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setLocalError("");

    if (password.length < 8) {
      setLocalError("La password deve avere almeno 8 caratteri.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, password);
      }
      setEmail("");
      setPassword("");
      setPostLoginOffer(true);
    } catch (err) {
      setLocalError(err.message ?? "Si è verificato un errore. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  async function handleOfferSync() {
    setOfferLoading(true);
    await onUpload();
    setOfferLoading(false);
    setPostLoginOffer(false);
  }

  if (auth) {
    return (
      <section className="account-card" aria-label="Account">
        <h2>Account</h2>

        {postLoginOffer ? (
          <>
            <p className="account-intro">
              Accesso effettuato come <strong>{auth.user.email}</strong>.<br />
              Vuoi sincronizzare i dati locali nel cloud?
            </p>
            <div className="account-actions">
              <button type="button" disabled={offerLoading} onClick={handleOfferSync}>
                {offerLoading ? "Salvataggio…" : "Salva dati locali nel cloud"}
              </button>
              <button className="ghost-button" type="button" onClick={() => setPostLoginOffer(false)}>
                Non ora
              </button>
            </div>
          </>
        ) : (
          <>
            <p className="account-email">Connesso come {auth.user.email}</p>

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
          </>
        )}
      </section>
    );
  }

  return (
    <section className="account-card" aria-label="Account">
      <h2>Account</h2>
      <p className="account-intro">Accedi per salvare le tue schede nel cloud.</p>

      <form className="account-form" onSubmit={handleSubmit} noValidate>
        <label htmlFor="account-email">Email</label>
        <input
          id="account-email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="email@example.com"
          autoComplete="email"
          required
        />

        <label htmlFor="account-password">Password</label>
        <input
          id="account-password"
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="minimo 8 caratteri"
          autoComplete={mode === "login" ? "current-password" : "new-password"}
          required
        />

        {localError && <p className="account-error">{localError}</p>}

        <div className="account-form-actions">
          <button type="submit" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Accedi" : "Registrati"}
          </button>
          <button
            className="ghost-button"
            type="button"
            onClick={() => switchMode(mode === "login" ? "register" : "login")}
          >
            {mode === "login" ? "Registrati" : "Accedi"}
          </button>
        </div>
      </form>
    </section>
  );
}

export default AccountCard;
