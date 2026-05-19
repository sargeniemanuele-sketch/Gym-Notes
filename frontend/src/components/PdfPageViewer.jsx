import React, { useEffect, useRef, useState } from "react";
import * as pdfjsLib from "pdfjs-dist";

function PdfPageViewer({ pageNumber, pdfData }) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [viewerStatus, setViewerStatus] = useState("loading");
  const [viewerError, setViewerError] = useState("");

  useEffect(() => {
    let isCancelled = false;
    let loadingTask = null;
    let renderTask = null;

    async function renderPdfPage() {
      setViewerStatus("loading");
      setViewerError("");

      try {
        if (!pdfData) {
          throw new Error("missing-pdf-data");
        }

        loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(pdfData.slice(0)) });
        const pdfDocument = await loadingTask.promise;

        if (pageNumber < 1 || pageNumber > pdfDocument.numPages) {
          if (!isCancelled) {
            setViewerStatus("error");
            setViewerError("Pagina non disponibile per questo PDF.");
          }
          await pdfDocument.destroy();
          return;
        }

        const page = await pdfDocument.getPage(pageNumber);
        const baseViewport = page.getViewport({ scale: 1 });
        const containerWidth = containerRef.current?.clientWidth ?? baseViewport.width;
        const scale = Math.max(containerWidth / baseViewport.width, 0.1);
        const viewport = page.getViewport({ scale });
        const canvas = canvasRef.current;

        if (!canvas || isCancelled) {
          await pdfDocument.destroy();
          return;
        }

        const outputScale = window.devicePixelRatio || 1;
        canvas.width = Math.floor(viewport.width * outputScale);
        canvas.height = Math.floor(viewport.height * outputScale);
        canvas.style.width = `${Math.floor(viewport.width)}px`;
        canvas.style.height = `${Math.floor(viewport.height)}px`;

        const context = canvas.getContext("2d", { alpha: false });

        if (!context) {
          throw new Error("missing-canvas-context");
        }

        const transform = outputScale !== 1 ? [outputScale, 0, 0, outputScale, 0, 0] : null;
        renderTask = page.render({
          canvasContext: context,
          transform,
          viewport
        });

        await renderTask.promise;
        await pdfDocument.destroy();

        if (!isCancelled) {
          setViewerStatus("ready");
        }
      } catch (error) {
        if (isCancelled || error?.name === "RenderingCancelledException") {
          return;
        }

        setViewerStatus("error");
        setViewerError("Il PDF non può essere letto.");
      }
    }

    renderPdfPage();

    return () => {
      isCancelled = true;

      if (renderTask) {
        renderTask.cancel();
      }

      if (loadingTask) {
        loadingTask.destroy();
      }
    };
  }, [pageNumber, pdfData]);

  return (
    <div className="pdf-viewer" ref={containerRef}>
      {viewerStatus === "loading" && <p className="pdf-viewer-message">Caricamento PDF...</p>}
      {viewerStatus === "error" && <p className="field-error">{viewerError}</p>}
      <canvas className={viewerStatus === "ready" ? "pdf-canvas" : "pdf-canvas pdf-canvas-hidden"} ref={canvasRef} />
    </div>
  );
}

export default PdfPageViewer;
