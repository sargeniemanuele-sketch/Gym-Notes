"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { validateEmailPasswordBody } = require("./authValidation");

test("validateEmailPasswordBody rejects malformed login bodies", () => {
  assert.equal(validateEmailPasswordBody(null).error, "Email obbligatoria");
  assert.equal(validateEmailPasswordBody({ email: 42, password: "password123" }).error, "Email obbligatoria");
  assert.equal(validateEmailPasswordBody({ email: "user@example.com", password: [] }).error, "Password obbligatoria");
});

test("validateEmailPasswordBody normalizes valid login input", () => {
  assert.deepEqual(validateEmailPasswordBody({ email: " USER@Example.COM ", password: "password123" }), {
    email: "user@example.com",
    password: "password123"
  });
});
