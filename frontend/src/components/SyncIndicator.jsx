import React, { useEffect, useState } from "react";
import { CLOUD_SAVE_STATUS } from "../utils/cloudSaveState.js";

function SyncIndicator({ status }) {
  const [showSaved, setShowSaved] = useState(false);

  useEffect(() => {
    if (status !== CLOUD_SAVE_STATUS.SAVED) {
      return undefined;
    }

    setShowSaved(true);
    const id = window.setTimeout(() => setShowSaved(false), 1600);

    return () => window.clearTimeout(id);
  }, [status]);

  let tone = null;
  let label = "";

  if (status === CLOUD_SAVE_STATUS.SAVING) {
    tone = "saving";
    label = "Salvataggio…";
  } else if (status === CLOUD_SAVE_STATUS.ERROR) {
    tone = "error";
    label = "Non sincronizzato";
  } else if (showSaved) {
    tone = "saved";
    label = "Salvato";
  }

  if (!tone) {
    return null;
  }

  return (
    <div className={`sync-indicator sync-indicator--${tone}`} role="status" aria-live="polite">
      <span className="sync-indicator-dot" aria-hidden="true" />
      {label}
    </div>
  );
}

export default SyncIndicator;
