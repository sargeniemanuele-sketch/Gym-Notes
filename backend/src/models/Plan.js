"use strict";

const mongoose = require("mongoose");

const planSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true
    },
    planId: {
      type: String,
      required: true
    },
    name: {
      type: String,
      default: "Scheda"
    },
    sortIndex: {
      type: Number,
      default: 0
    },
    createdAt: {
      type: Date,
      required: true
    },
    updatedAt: {
      type: Date,
      required: true
    },
    deletedAt: {
      type: Date,
      default: null
    },
    deletedWorkoutIds: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    },
    pdfDeletedAt: {
      type: Date,
      default: null
    },
    cloudPdf: {
      type: mongoose.Schema.Types.Mixed,
      default: undefined
    },
    pendingPdfDeleteKey: {
      type: String,
      default: undefined
    },
    workouts: {
      type: [mongoose.Schema.Types.Mixed],
      default: []
    }
  },
  { timestamps: { createdAt: "docCreatedAt", updatedAt: "docUpdatedAt" } }
);

planSchema.index({ userId: 1, planId: 1 }, { unique: true });

module.exports = mongoose.model("Plan", planSchema);
