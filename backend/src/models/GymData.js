"use strict";

const mongoose = require("mongoose");

const gymDataSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
    },
    data: {
      type: mongoose.Schema.Types.Mixed,
      required: true,
    },
    schemaVersion: {
      type: Number,
      default: 1,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("GymData", gymDataSchema);
