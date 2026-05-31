"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const {
  removePdfMetadataBeforeStorageDelete,
  savePdfMetadataAfterUpload,
  shouldCleanupUploadedPdfAfterMongoFailure
} = require("./pdfConsistency");

test("savePdfMetadataAfterUpload cleans up R2 when DB update fails after upload", async () => {
  const calls = [];
  const dbError = new Error("mongo failed");

  await assert.rejects(
    () =>
      savePdfMetadataAfterUpload({
        uploadObject: async () => calls.push("upload"),
        saveMetadata: async () => {
          calls.push("save");
          throw dbError;
        },
        cleanupUploadedObject: async () => calls.push("cleanup")
      }),
    dbError
  );

  assert.deepEqual(calls, ["upload", "save", "cleanup"]);
});

test("removePdfMetadataBeforeStorageDelete keeps DB delete result when R2 delete fails", async () => {
  const calls = [];
  const originalWarn = console.warn;
  console.warn = () => {};

  try {
    const result = await removePdfMetadataBeforeStorageDelete({
      removeMetadata: async () => {
        calls.push("db");
        return { deleteKey: "user-1/plans/plan-1/file.pdf", updatedAt: "now" };
      },
      deleteObject: async () => {
        calls.push("r2");
        throw new Error("r2 down");
      },
      markPendingDelete: async (key) => calls.push(`pending:${key}`)
    });

    assert.equal(result.updatedAt, "now");
    assert.equal(result.storageDeleted, false);
    assert.deepEqual(calls, ["db", "r2", "pending:user-1/plans/plan-1/file.pdf"]);
  } finally {
    console.warn = originalWarn;
  }
});

test("shouldCleanupUploadedPdfAfterMongoFailure allows cleanup when Mongo transaction rolls back", () => {
  assert.equal(
    shouldCleanupUploadedPdfAfterMongoFailure({
      usedMongoTransaction: true,
      mongoPdfKey: "user-1/plans/plan-1/new.pdf",
      uploadedKey: "user-1/plans/plan-1/new.pdf"
    }),
    true
  );
});

test("shouldCleanupUploadedPdfAfterMongoFailure skips cleanup when non-transactional Mongo points at uploaded PDF", () => {
  assert.equal(
    shouldCleanupUploadedPdfAfterMongoFailure({
      usedMongoTransaction: false,
      mongoPdfKey: "user-1/plans/plan-1/new.pdf",
      uploadedKey: "user-1/plans/plan-1/new.pdf"
    }),
    false
  );
});

test("upload failure path does not delete R2 when a non-transactional Plan already points to the new PDF", async () => {
  const uploadedKey = "user-1/plans/plan-1/new.pdf";
  const plan = {};
  const calls = [];

  await assert.rejects(
    () =>
      savePdfMetadataAfterUpload({
        uploadObject: async () => calls.push("upload"),
        saveMetadata: async () => {
          calls.push("save-plan");
          plan.cloudPdf = { key: uploadedKey };
          throw new Error("legacy failed after plan save");
        },
        cleanupUploadedObject: async () => {
          if (
            shouldCleanupUploadedPdfAfterMongoFailure({
              usedMongoTransaction: false,
              mongoPdfKey: plan.cloudPdf?.key,
              uploadedKey
            })
          ) {
            calls.push("cleanup-r2");
          }
        }
      }),
    /legacy failed/
  );

  assert.deepEqual(calls, ["upload", "save-plan"]);
  assert.equal(plan.cloudPdf.key, uploadedKey);
});
