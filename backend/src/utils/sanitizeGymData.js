"use strict";

const { isUserPdfKey } = require("./pdfSecurity");

const PDF_FIELDS = ["pdfId", "pdfName", "pdfSize", "pdfUpdatedAt"];

function sanitizeGymData(data, options = {}) {
  const sanitized = sanitizeValue(data);

  if (!sanitized || typeof sanitized !== "object" || Array.isArray(sanitized)) {
    return sanitized;
  }

  return restoreServerPdfMetadata(sanitized, options);
}

function sanitizeValue(data) {
  if (Array.isArray(data)) {
    return data.map(sanitizeValue);
  }

  if (!data || typeof data !== "object") return data;

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !PDF_FIELDS.includes(key) && key !== "cloudPdf")
      .map(([key, value]) => [key, sanitizeValue(value)])
  );
}

function restoreServerPdfMetadata(data, { existingData = null, userId = null } = {}) {
  if (!Array.isArray(data.plans) || !Array.isArray(existingData?.plans) || !userId) {
    return data;
  }

  const existingPlansById = new Map(existingData.plans.map((plan) => [plan?.id, plan]));

  return {
    ...data,
    plans: data.plans.map((plan) => {
      if (!plan || typeof plan !== "object") {
        return plan;
      }

      const existingPlan = existingPlansById.get(plan.id);
      const existingCloudPdf = existingPlan?.cloudPdf;

      if (!isSafeExistingCloudPdf(userId, existingCloudPdf)) {
        return plan;
      }

      return {
        ...plan,
        cloudPdf: existingCloudPdf
      };
    })
  };
}

function isSafeExistingCloudPdf(userId, cloudPdf) {
  return (
    cloudPdf &&
    typeof cloudPdf === "object" &&
    isUserPdfKey(userId, cloudPdf.key) &&
    typeof cloudPdf.name === "string" &&
    typeof cloudPdf.updatedAt === "string"
  );
}

module.exports = sanitizeGymData;
