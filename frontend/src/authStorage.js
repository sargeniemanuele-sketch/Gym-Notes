const TOKEN_KEY = "gym-notes-auth-token-v1";
const USER_KEY = "gym-notes-auth-user-v1";

export function loadAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    if (!token) return null;
    localStorage.removeItem(USER_KEY);
    return { token, user: null };
  } catch {
    clearAuth();
    return null;
  }
}

export function saveAuth({ token }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.removeItem(USER_KEY);
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
