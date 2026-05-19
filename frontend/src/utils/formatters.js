import { getNumericInputValue } from "./numbers.js";

const todayFormatter = new Intl.DateTimeFormat("it-IT");
const dateTimeFormatter = new Intl.DateTimeFormat("it-IT", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit"
});

export function getTodayLabel() {
  return todayFormatter.format(new Date());
}

export function formatDate(value) {
  return todayFormatter.format(new Date(value));
}

export function formatDateTimeItalian(isoString) {
  return dateTimeFormatter.format(new Date(isoString));
}

export function parseNumericWeight(value) {
  const str = typeof value === "string" ? value.trim().replace(",", ".") : "";

  if (!str) {
    return null;
  }

  const n = Number(str);

  return Number.isFinite(n) && n > 0 ? n : null;
}

export function formatWeightForDisplay(value) {
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (!stringValue) {
    return "Carico non impostato";
  }

  const numericValue = getNumericInputValue(stringValue);

  if (numericValue) {
    return `${numericValue} kg`;
  }

  return stringValue;
}

export function formatRestForDisplay(value) {
  const stringValue = typeof value === "string" ? value.trim() : "";

  if (!stringValue) {
    return "Recupero non impostato";
  }

  const numericValue = getNumericInputValue(stringValue);

  if (numericValue) {
    return `${numericValue} sec`;
  }

  return stringValue;
}
