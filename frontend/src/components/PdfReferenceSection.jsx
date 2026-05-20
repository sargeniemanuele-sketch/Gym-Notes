import React, { useEffect, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";
import { getPlanPdf } from "../api/client.js";
import { getPdfFile } from "../pdfStorage.js";
import PdfPageViewer from "./PdfPageViewer.jsx";

function PdfReferenceSection({ authToken, cloudPdf, isVisible, onHide, onPageChange, onShow, pdfId, pdfName, planId, selectedPage }) {
  const [pdfData, setPdfData] = useState(null);
  const [numPages, setNumPages] = useState(null);
  const [referenceStatus, setReferenceStatus] = useState("loading");
  const [referenceError, setReferenceError] = useState("");
  const [pageNotice, setPageNotice] = useState("");
  const effectivePage = Number.isFinite(selectedPage) && selectedPage >= 1 ? selectedPage : 1;
  const visiblePage = numPages ? Math.min(effectivePage, numPages) : effectivePage;

  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;

    async function loadPdfReference() {
      setReferenceStatus("loading");
      setReferenceError("");
      setPageNotice("");
      setPdfData(null);
      setNumPages(null);

      try {
        const savedPdf = pdfId ? await getPdfFile(pdfId) : null;
        let arrayBuffer = null;

        if (savedPdf?.file) {
          arrayBuffer = await savedPdf.file.arrayBuffer();
        } else if (cloudPdf?.key && authToken && planId) {
          arrayBuffer = await getPlanPdf(authToken, planId);
        }

        if (!arrayBuffer) {
          throw new Error("missing-pdf");
        }

        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer.slice(0)) });
        const pdfDocument = await loadingTask.promise;
        const totalPages = pdfDocument.numPages;
        await pdfDocument.destroy();

        if (!totalPages) {
          throw new Error("missing-pages");
        }

        if (!isCancelled) {
          setPdfData(arrayBuffer);
          setNumPages(totalPages);
          setReferenceStatus("ready");
        }
      } catch {
        if (!isCancelled) {
          setReferenceStatus("error");
          setReferenceError("Il PDF non può essere caricato.");
        }
      }
    }

    loadPdfReference();

    return () => {
      isCancelled = true;

      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [authToken, cloudPdf?.key, pdfId, planId]);

  useEffect(() => {
    if (!numPages) {
      return;
    }

    if (!Number.isFinite(selectedPage) || selectedPage < 1) {
      onPageChange(1);
      return;
    }

    if (selectedPage > numPages) {
      setPageNotice("Pagina non disponibile per questo PDF. Mostro la pagina disponibile più vicina.");
      onPageChange(numPages);
      return;
    }

    setPageNotice("");
  }, [numPages, onPageChange, selectedPage]);

  if (!isVisible) {
    return (
      <div className="pdf-reference-card">
        <p className="pdf-reference-copy">Scheda originale caricata{pdfName ? `: ${pdfName}` : ""}</p>
        <button className="secondary-action pdf-show-button" type="button" onClick={onShow}>
          Mostra riferimento PDF
        </button>
      </div>
    );
  }

  return (
    <div className="pdf-reference-card">
      <p className="pdf-reference-copy">Scheda originale caricata{pdfName ? `: ${pdfName}` : ""}</p>

      {referenceStatus === "loading" && <p className="pdf-viewer-message">Caricamento PDF...</p>}
      {referenceStatus === "error" && <p className="field-error">{referenceError}</p>}

      {referenceStatus === "ready" && numPages && (
        <>
          <div className="pdf-page-control" aria-label="Seleziona pagina PDF">
            <span>Pagina</span>
            <div className="pdf-page-buttons">
              {Array.from({ length: numPages }, (_, index) => {
                const pageNumber = index + 1;
                const isSelected = pageNumber === visiblePage;

                return (
                  <button
                    aria-pressed={isSelected}
                    className={isSelected ? "pdf-page-button pdf-page-button-active" : "pdf-page-button"}
                    key={pageNumber}
                    type="button"
                    onClick={() => onPageChange(pageNumber)}
                  >
                    {pageNumber}
                  </button>
                );
              })}
            </div>
          </div>

          {pageNotice && <p className="pdf-page-notice">{pageNotice}</p>}

          <PdfPageViewer pageNumber={visiblePage} pdfData={pdfData} />
        </>
      )}

      <button className="ghost-button pdf-hide-button" type="button" onClick={onHide}>
        Nascondi PDF
      </button>
    </div>
  );
}

export default PdfReferenceSection;
