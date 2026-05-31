import assert from "node:assert/strict";
import test from "node:test";
import {
  CLOUD_SAVE_STATUS,
  getCloudSaveMessage,
  isCloudSaveBlockingUnload,
  shouldConfirmLogoutAfterFlush
} from "./cloudSaveState.js";

test("pending cloud save shows saving and not saved before backend OK", () => {
  assert.equal(getCloudSaveMessage(CLOUD_SAVE_STATUS.SAVING), "Salvataggio...");
  assert.notEqual(getCloudSaveMessage(CLOUD_SAVE_STATUS.SAVING), "Salvato nel cloud");
  assert.equal(getCloudSaveMessage(CLOUD_SAVE_STATUS.SAVED), "Salvato nel cloud");
});

test("pending or in-flight cloud save blocks beforeunload", () => {
  assert.equal(isCloudSaveBlockingUnload({ hasPendingChanges: true, isSaveInFlight: false }), true);
  assert.equal(isCloudSaveBlockingUnload({ hasPendingChanges: false, isSaveInFlight: true }), true);
  assert.equal(isCloudSaveBlockingUnload({ hasPendingChanges: false, isSaveInFlight: false }), false);
});

test("logout asks confirmation only when pending flush fails", () => {
  assert.equal(shouldConfirmLogoutAfterFlush({ hadPendingChanges: true, flushSucceeded: false }), true);
  assert.equal(shouldConfirmLogoutAfterFlush({ hadPendingChanges: true, flushSucceeded: true }), false);
  assert.equal(shouldConfirmLogoutAfterFlush({ hadPendingChanges: false, flushSucceeded: false }), false);
});
