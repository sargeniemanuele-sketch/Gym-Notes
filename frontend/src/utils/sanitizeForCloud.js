const PDF_FIELDS = ["pdfId", "pdfName", "pdfSize", "pdfUpdatedAt"];

function sanitizePlan(plan) {
  if (!plan || typeof plan !== "object") return plan;
  const clean = { ...plan };
  for (const field of PDF_FIELDS) delete clean[field];
  return clean;
}

export function sanitizeForCloud(data) {
  if (!data || typeof data !== "object") return data;
  const clean = { ...data };
  if (Array.isArray(clean.plans)) {
    clean.plans = clean.plans.map(sanitizePlan);
  }
  return clean;
}
