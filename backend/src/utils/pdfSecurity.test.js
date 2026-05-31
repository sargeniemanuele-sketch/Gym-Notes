"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { isUserPdfKey, isValidPdfUpload } = require("./pdfSecurity");

test("isUserPdfKey only accepts keys under the current user's PDF prefix", () => {
  assert.equal(isUserPdfKey("user-1", "user-1/plans/plan-1/file.pdf"), true);
  assert.equal(isUserPdfKey("user-1", "user-2/plans/plan-1/file.pdf"), false);
  assert.equal(isUserPdfKey("user-1", "user-10/plans/plan-1/file.pdf"), false);
});

test("isValidPdfUpload validates extension, MIME type, and magic bytes", () => {
  assert.equal(
    isValidPdfUpload({
      originalname: "scheda.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n")
    }),
    true
  );

  assert.equal(
    isValidPdfUpload({
      originalname: "scheda.pdf",
      mimetype: "application/pdf",
      buffer: Buffer.from("not a pdf")
    }),
    false
  );

  assert.equal(
    isValidPdfUpload({
      originalname: "scheda.txt",
      mimetype: "application/pdf",
      buffer: Buffer.from("%PDF-1.7\n")
    }),
    false
  );
});
