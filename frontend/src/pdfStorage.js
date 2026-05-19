const DB_NAME = "gym-notes-files-v1";
const DB_VERSION = 2;
const PDF_STORE = "pdfs";
const PLAN_PDF_REF_STORE = "planPdfRefs";

function openPdfDatabase() {
  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = () => {
      const db = request.result;

      if (!db.objectStoreNames.contains(PDF_STORE)) {
        db.createObjectStore(PDF_STORE, { keyPath: "id" });
      }

      if (!db.objectStoreNames.contains(PLAN_PDF_REF_STORE)) {
        db.createObjectStore(PLAN_PDF_REF_STORE, { keyPath: "planId" });
      }
    };
  });
}

function runPdfTransaction(mode, operation, storeName = PDF_STORE) {
  return openPdfDatabase().then(
    (db) =>
      new Promise((resolve, reject) => {
        const transaction = db.transaction(storeName, mode);
        const store = transaction.objectStore(storeName);
        const request = operation(store);

        request.onerror = () => reject(request.error);
        request.onsuccess = () => resolve(request.result);
        transaction.oncomplete = () => db.close();
        transaction.onerror = () => {
          db.close();
          reject(transaction.error);
        };
        transaction.onabort = () => {
          db.close();
          reject(transaction.error);
        };
      })
  );
}

export function savePdfFile(id, file) {
  const updatedAt = new Date().toISOString();

  return runPdfTransaction("readwrite", (store) =>
    store.put({
      id,
      file,
      name: file.name,
      size: file.size,
      type: file.type,
      updatedAt
    })
  );
}

export function getPdfFile(id) {
  return runPdfTransaction("readonly", (store) => store.get(id));
}

export function deletePdfFile(id) {
  return runPdfTransaction("readwrite", (store) => store.delete(id));
}

export function savePlanPdfReference(planId, reference) {
  return runPdfTransaction(
    "readwrite",
    (store) =>
      store.put({
        ...reference,
        planId
      }),
    PLAN_PDF_REF_STORE
  );
}

export function deletePlanPdfReference(planId) {
  return runPdfTransaction("readwrite", (store) => store.delete(planId), PLAN_PDF_REF_STORE);
}

export function getAllPlanPdfReferences() {
  return runPdfTransaction("readonly", (store) => store.getAll(), PLAN_PDF_REF_STORE);
}
