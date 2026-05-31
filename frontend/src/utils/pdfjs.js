import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";

let pdfjsPromise = null;

export async function loadPdfJs() {
  if (!pdfjsPromise) {
    pdfjsPromise = import("pdfjs-dist").then((pdfjsLib) => {
      pdfjsLib.GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
      return pdfjsLib;
    });
  }

  return pdfjsPromise;
}
