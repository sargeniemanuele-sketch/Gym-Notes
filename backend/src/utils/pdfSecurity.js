"use strict";

function getUserPdfPrefix(userId) {
  return `${userId}/plans/`;
}

function isUserPdfKey(userId, key) {
  return typeof key === "string" && key.startsWith(getUserPdfPrefix(userId));
}

function hasPdfMagicBytes(buffer) {
  return Buffer.isBuffer(buffer) && buffer.subarray(0, 5).toString("utf8") === "%PDF-";
}

function hasPdfFileName(name) {
  return typeof name === "string" && name.toLowerCase().endsWith(".pdf");
}

function hasPdfMimeType(mimeType) {
  return mimeType === "application/pdf";
}

function isValidPdfUpload(file) {
  return !!file && hasPdfFileName(file.originalname) && hasPdfMimeType(file.mimetype) && hasPdfMagicBytes(file.buffer);
}

module.exports = {
  getUserPdfPrefix,
  hasPdfMagicBytes,
  hasPdfFileName,
  hasPdfMimeType,
  isUserPdfKey,
  isValidPdfUpload
};
