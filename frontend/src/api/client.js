const BASE_URL =
  import.meta.env.VITE_API_BASE_URL ?? "https://gym-notes-backend.onrender.com";
const REQUEST_TIMEOUT_MS = 90000;

async function request(path, { method = "GET", token, body } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const isFormData = body instanceof FormData;
  const headers = isFormData ? {} : { "Content-Type": "application/json" };
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method,
      headers,
      signal: controller.signal,
      body: body !== undefined ? (isFormData ? body : JSON.stringify(body)) : undefined,
    });

    const json = await res.json().catch(() => ({}));

    if (!res.ok) {
      const err = new Error(json.error ?? `Errore ${res.status}`);
      err.status = res.status;
      err.payload = json;
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

async function requestArrayBuffer(path, { token } = {}) {
  const controller = new AbortController();
  const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  const headers = {};
  if (token) headers["Authorization"] = `Bearer ${token}`;

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      headers,
      signal: controller.signal
    });

    if (!res.ok) {
      const json = await res.json().catch(() => ({}));
      const err = new Error(json.error ?? `Errore ${res.status}`);
      err.status = res.status;
      throw err;
    }

    return res.arrayBuffer();
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

export function saveRemoteGymData(token, data, baseUpdatedAt) {
  return request("/api/sync/data", { method: "PUT", token, body: { data, baseUpdatedAt } });
}

export function uploadPlanPdf(token, planId, file) {
  const formData = new FormData();
  formData.append("pdf", file);
  return request(`/api/pdf/plans/${encodeURIComponent(planId)}`, {
    method: "POST",
    token,
    body: formData
  });
}

export function getPlanPdf(token, planId) {
  return requestArrayBuffer(`/api/pdf/plans/${encodeURIComponent(planId)}`, { token });
}

export function deletePlanPdf(token, planId) {
  return request(`/api/pdf/plans/${encodeURIComponent(planId)}`, {
    method: "DELETE",
    token
  });
}
