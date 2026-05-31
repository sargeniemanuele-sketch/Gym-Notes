"use strict";

const mongoose = require("mongoose");

const sessionSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true
    },
    activeSessionId: {
      type: String,
      default: null
    },
    planId: {
      type: String,
      default: ""
    },
    workoutId: {
      type: String,
      default: ""
    },
    workoutName: {
      type: String,
      default: ""
    },
    startedAt: {
      type: Date,
      required: true
    },
    completedAt: {
      type: Date,
      required: true
    },
    durationSeconds: {
      type: Number,
      default: 0
    },
    exercises: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  { timestamps: true }
);

sessionSchema.index({ userId: 1, sessionId: 1 }, { unique: true });

module.exports = mongoose.model("Session", sessionSchema);
