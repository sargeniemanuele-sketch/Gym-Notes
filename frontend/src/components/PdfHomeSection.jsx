import React from "react";

function PdfHomeSection({ activePlan, onFileChange, onOpenFilePicker, onRemovePdf, pdfError, pdfInputRef, saveStatus }) {
  const hasPdf = activePlan.pdfId || activePlan.cloudPdf?.key;
  const pdfName = activePlan.cloudPdf?.name ?? activePlan.pdfName;

  return (
    <section className="content-section pdf-support-section" aria-labelledby="original-pdf-title">
      <div className="section-title-row">
        <h2 id="original-pdf-title">Scheda originale PDF</h2>
        {saveStatus && <span className="save-status">{saveStatus}</span>}
      </div>

      <div className="pdf-home-card">
        {hasPdf ? (
          <div className="pdf-file-copy">
            <span>PDF caricato</span>
            <p>{pdfName}</p>
          </div>
        ) : (
          <p>Nessun PDF caricato</p>
        )}

        <input
          className="sr-only"
          ref={pdfInputRef}
          type="file"
          accept="application/pdf"
          onChange={onFileChange}
        />

        <div className="pdf-actions">
          <button type="button" onClick={onOpenFilePicker}>
            {hasPdf ? "Sostituisci" : "Carica PDF"}
          </button>
          {hasPdf && (
            <button className="outline-danger-button pdf-danger-button" type="button" onClick={onRemovePdf}>
              Rimuovi
            </button>
          )}
        </div>

        {pdfError && <p className="field-error">{pdfError}</p>}
      </div>
    </section>
  );
}

export default PdfHomeSection;
