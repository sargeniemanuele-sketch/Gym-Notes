"use strict";

const mongoose = require("mongoose");

const gymStateSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true
    },
    activePlanId: {
      type: String,
      default: null
    },
    activeSession: {
      type: mongoose.Schema.Types.Mixed,
      default: null
    },
    activeSessionUpdatedAt: {
      type: Date,
      default: null
    },
    completedActiveSessionIds: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    deletedPlanIds: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    resetAt: {
      type: Date,
      default: null
    },
    schemaVersion: {
      type: Number,
      default: 2
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model("GymState", gymStateSchema);
