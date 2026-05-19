import { getNumericInputValue } from "./numbers.js";

export function formatDuration(totalSeconds) {
  const h = Math.floor(totalSeconds / 3600);
  const m = Math.floor((totalSeconds % 3600) / 60);
  const s = totalSeconds % 60;

  if (h > 0) {
    return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  }

  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

export function getRestDurationSeconds(value) {
  const numericValue = getNumericInputValue(value);

  if (!numericValue) {
    return null;
  }

  const durationSeconds = Number.parseInt(numericValue, 10);

  if (!Number.isFinite(durationSeconds) || durationSeconds <= 0) {
    return null;
  }

  return durationSeconds;
}

export function formatTimerTime(milliseconds) {
  const totalSeconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const minutes = Math.floor(totalSeconds / 60).toString().padStart(2, "0");
  const seconds = (totalSeconds % 60).toString().padStart(2, "0");

  return `${minutes}:${seconds}`;
}
