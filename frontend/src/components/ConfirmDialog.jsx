import React, { useEffect, useRef, useState } from "react";

function ConfirmDialog({
  open,
  title,
  message,
  confirmLabel = "Conferma",
  cancelLabel = "Annulla",
  tone = "default",
  requireText = null,
  onConfirm,
  onCancel
}) {
  const [typed, setTyped] = useState("");
  const confirmRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    setTyped("");

    const focusTarget = requireText ? inputRef.current : confirmRef.current;
    const focusId = window.setTimeout(() => focusTarget?.focus(), 30);

    const handleKeyDown = (event) => {
      if (event.key === "Escape") {
        onCancel();
      }
    };

    document.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusId);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open, requireText, onCancel]);

  if (!open) {
    return null;
  }

  const confirmDisabled = !!requireText && typed.trim().toUpperCase() !== requireText.toUpperCase();

  return (
    <div className="dialog-overlay" role="presentation" onClick={onCancel}>
      <div
        className={`dialog-card${tone === "danger" ? " dialog-card--danger" : ""}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="dialog-title"
        onClick={(event) => event.stopPropagation()}
      >
        <h2 id="dialog-title" className="dialog-title">
          {title}
        </h2>
        {message && <p className="dialog-message">{message}</p>}

        {requireText && (
          <input
            ref={inputRef}
            className="dialog-input"
            type="text"
            value={typed}
            onChange={(event) => setTyped(event.target.value)}
            placeholder={requireText}
            autoComplete="off"
            aria-label={`Digita ${requireText} per confermare`}
          />
        )}

        <div className="dialog-actions">
          <button className="ghost-button" type="button" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={tone === "danger" ? "dialog-confirm dialog-confirm--danger" : "dialog-confirm"}
            type="button"
            disabled={confirmDisabled}
            onClick={onConfirm}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmDialog;
