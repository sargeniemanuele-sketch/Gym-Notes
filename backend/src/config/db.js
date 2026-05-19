"use strict";

const mongoose = require("mongoose");
const { mongodbUri } = require("./env");

let dbState = "disconnected";

async function connectDB() {
  try {
    await mongoose.connect(mongodbUri);
    dbState = "connected";
    console.log("MongoDB connected");
  } catch (err) {
    dbState = "disconnected";
    console.error("MongoDB connection error:", err.message);
    process.exit(1);
  }
}

function getDbState() {
  return dbState;
}

module.exports = { connectDB, getDbState };
