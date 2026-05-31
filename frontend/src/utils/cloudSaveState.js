export const CLOUD_SAVE_STATUS = {
  IDLE: "idle",
  SAVING: "saving",
  SAVED: "saved",
  ERROR: "error"
};

export function getCloudSaveMessage(status) {
  if (status === CLOUD_SAVE_STATUS.SAVING) {
    return "Salvataggio...";
  }

  if (status === CLOUD_SAVE_STATUS.SAVED) {
    return "Salvato nel cloud";
  }

  if (status === CLOUD_SAVE_STATUS.ERROR) {
    return "Cloud non disponibile. Modifiche in memoria, ritento più avanti.";
  }

  return "";
}

export function isCloudSaveBlockingUnload({ hasPendingChanges, isSaveInFlight }) {
  return !!hasPendingChanges || !!isSaveInFlight;
}

export function shouldConfirmLogoutAfterFlush({ hadPendingChanges, flushSucceeded }) {
  return !!hadPendingChanges && !flushSucceeded;
}
