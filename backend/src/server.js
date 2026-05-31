"use strict";

const { connectDB } = require("./config/db");
const { port } = require("./config/env");
const app = require("./app");

async function start() {
  await connectDB();
  const server = app.listen(port, () => {
    console.log(`gym-notes-backend listening on port ${port}`);
  });

  server.on("error", (err) => {
    if (err.code === "EADDRINUSE") {
      console.error(`Porta ${port} già in uso. Libera la porta o imposta PORT su un valore diverso.`);
      process.exit(1);
    }

    throw err;
  });
}

start().catch((err) => {
  console.error(err.message ?? err);
  process.exit(1);
});
