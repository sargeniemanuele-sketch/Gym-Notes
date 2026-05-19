"use strict";

const PDF_FIELDS = ["pdfId", "pdfName", "pdfSize", "pdfUpdatedAt"];

function sanitizeGymData(data) {
  if (Array.isArray(data)) {
    return data.map(sanitizeGymData);
  }

  if (!data || typeof data !== "object") return data;

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !PDF_FIELDS.includes(key))
      .map(([key, value]) => [key, sanitizeGymData(value)])
  );
}

module.exports = sanitizeGymData;
