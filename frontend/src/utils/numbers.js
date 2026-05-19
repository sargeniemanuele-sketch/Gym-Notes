export function getNumericInputValue(value) {
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (!stringValue) {
    return "";
  }

  const numberMatch = stringValue.match(/^(\d+(?:[.,]\d+)?)(?:\s*(?:kg|sec))?$/i);

  if (!numberMatch) {
    return "";
  }

  return numberMatch[1].replace(",", ".");
}

export function normalizeNumericInputValue(value) {
  return getNumericInputValue(value);
}
