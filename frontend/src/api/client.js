const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://gym-notes-backend.onrender.com";

async function request(path, { method = "GET", token, body } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), 15000);
  const headers = { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(json.error ?? `Errore ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return json;
  } catch (err) {
    if (err.name === "AbortError") {
      throw new Error("Cloud non disponibile. Riprova tra poco.");
    }

    throw err;
  } finally {
    window.clearTimeout(timeoutId);
  }
}

export function register(email, password) {
  return request("/api/auth/register", { method: "POST", body: { email, password } });
}

export function login(email, password) {
  return request("/api/auth/login", { method: "POST", body: { email, password } });
}

export function getMe(token) {
  return request("/api/auth/me", { token });
}

export function getRemoteGymData(token) {
  return request("/api/sync/data", { token });
}

export function saveRemoteGymData(token, data) {
  return request("/api/sync/data", { method: "PUT", token, body: { data } });
}
