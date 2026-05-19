"use strict";

require("dotenv").config();

const required = ["MONGODB_URI", "JWT_SECRET"];

for (const key of required) {
  if (!process.env[key]) {
    throw new Error(`Missing required environment variable: ${key}`);
  }
}

module.exports = {
  port: parseInt(process.env.PORT ?? "4000", 10),
  mongodbUri: process.env.MONGODB_URI,
  jwtSecret: process.env.JWT_SECRET,
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "7d",
  allowedOrigins: (process.env.ALLOWED_ORIGINS ?? "http://localhost:5173,https://gym-notes-teal.vercel.app")
    .split(",")
    .map((o) => o.trim()),
};
