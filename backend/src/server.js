"use strict";

const { connectDB } = require("./config/db");
const { port } = require("./config/env");
const app = require("./app");

async function start() {
  await connectDB();
  app.listen(port, () => {
    console.log(`gym-notes-backend listening on port ${port}`);
  });
}

start();
