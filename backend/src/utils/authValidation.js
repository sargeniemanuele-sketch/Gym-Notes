"use strict";

function validateEmailPasswordBody(body) {
  const { email, password } = body ?? {};

  if (!email || typeof email !== "string") {
    return { error: "Email obbligatoria" };
  }

  if (!password || typeof password !== "string") {
    return { error: "Password obbligatoria" };
  }

  if (!email.trim() || !password) {
    return { error: "Email e password obbligatorie" };
  }

  return {
    email: email.toLowerCase().trim(),
    password
  };
}

module.exports = { validateEmailPasswordBody };
