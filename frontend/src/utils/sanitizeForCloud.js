const PDF_FIELDS = ["pdfId", "pdfName", "pdfSize", "pdfUpdatedAt"];

export function sanitizeForCloud(data) {
  if (Array.isArray(data)) {
    return data.map(sanitizeForCloud);
  }

  if (!data || typeof data !== "object") return data;

  return Object.fromEntries(
    Object.entries(data)
      .filter(([key]) => !PDF_FIELDS.includes(key))
      .map(([key, value]) => [key, sanitizeForCloud(value)])
  );
}
