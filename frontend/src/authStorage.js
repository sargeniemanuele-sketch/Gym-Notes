const TOKEN_KEY = "gym-notes-auth-token-v1";
const USER_KEY = "gym-notes-auth-user-v1";

export function loadAuth() {
  try {
    const token = localStorage.getItem(TOKEN_KEY);
    const userRaw = localStorage.getItem(USER_KEY);
    if (!token || !userRaw) return null;
    const user = JSON.parse(userRaw);

    if (!user || typeof user !== "object" || typeof user.email !== "string") {
      clearAuth();
      return null;
    }

    return { token, user };
  } catch {
    clearAuth();
    return null;
  }
}

export function saveAuth({ token, user }) {
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearAuth() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
