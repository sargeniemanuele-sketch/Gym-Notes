import React, { useState } from "react";

function AuthScreen({ onLogin, onRegister }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  function switchMode(next) {
    setMode(next);
    setError("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (password.length < 8) {
      setError("La password deve avere almeno 8 caratteri.");
      return;
    }

    setLoading(true);
    try {
      if (mode === "login") {
        await onLogin(email, password);
      } else {
        await onRegister(email, password);
      }
    } catch (err) {
      setError(err.message ?? "Si è verificato un errore. Riprova.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="app-shell">
      <div className="auth-panel">
        <header className="auth-header">
          <img className="brand-mark" src="/icons/icon-192.png" alt="" aria-hidden="true" />
          <h1>Gym Notes</h1>
          <p className="subtitle">
            {mode === "login" ? "Accedi per continuare." : "Crea il tuo account."}
          </p>
        </header>

        <form className="auth-form" onSubmit={handleSubmit} noValidate>
          <div className="field-stack">
            <label htmlFor="auth-email">Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              autoComplete="email"
              required
              autoFocus
            />
          </div>

          <div className="field-stack">
            <label htmlFor="auth-password">Password</label>
            <input
              id="auth-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="minimo 8 caratteri"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              required
            />
          </div>

          {error && <p className="field-error">{error}</p>}

          <button className="auth-submit" type="submit" disabled={loading}>
            {loading ? "…" : mode === "login" ? "Accedi" : "Crea account"}
          </button>
        </form>

        <button
          className="auth-switch"
          type="button"
          onClick={() => switchMode(mode === "login" ? "register" : "login")}
        >
          {mode === "login" ? "Non hai un account? Registrati" : "Hai già un account? Accedi"}
        </button>
      </div>
    </main>
  );
}

export default AuthScreen;
