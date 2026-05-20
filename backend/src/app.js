"use strict";

const express = require("express");
const helmet = require("helmet");
const cors = require("cors");
const { allowedOrigins } = require("./config/env");
const errorHandler = require("./middleware/errorHandler");
const healthRoutes = require("./routes/health.routes");
const authRoutes = require("./routes/auth.routes");
const syncRoutes = require("./routes/sync.routes");
const pdfRoutes = require("./routes/pdf.routes");

const app = express();

app.use(
  helmet({
    crossOriginResourcePolicy: { policy: "cross-origin" }
  })
);

app.use(
  cors({
    origin: (origin, cb) => {
      if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
      cb(new Error(`Origin non consentita: ${origin}`));
    },
    credentials: true,
  })
);

app.use(express.json({ limit: "2mb" }));

app.use("/api/health", healthRoutes);
app.use("/api/auth", authRoutes);
app.use("/api/sync", syncRoutes);
app.use("/api/pdf", pdfRoutes);

app.use(errorHandler);

module.exports = app;
