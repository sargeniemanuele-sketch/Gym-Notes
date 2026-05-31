"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const sanitizeGymData = require("./sanitizeGymData");

test("sanitizeGymData strips malicious cloudPdf keys from client data", () => {
  const sanitized = sanitizeGymData(
    {
      activePlanId: "plan-1",
      plans: [
        {
          id: "plan-1",
          cloudPdf: {
            key: "other-user/plans/plan-1/file.pdf",
            name: "file.pdf",
            updatedAt: "2026-05-03T10:00:00.000Z"
          }
        }
      ]
    },
    { userId: "user-1" }
  );

  assert.equal(sanitized.plans[0].cloudPdf, undefined);
});

test("sanitizeGymData preserves existing server-owned cloudPdf metadata", () => {
  const existingData = {
    plans: [
      {
        id: "plan-1",
        cloudPdf: {
          key: "user-1/plans/plan-1/file.pdf",
          name: "file.pdf",
          size: 123,
          contentType: "application/pdf",
          updatedAt: "2026-05-03T10:00:00.000Z"
        }
      }
    ]
  };

  const sanitized = sanitizeGymData(
    {
      activePlanId: "plan-1",
      plans: [
        {
          id: "plan-1",
          cloudPdf: {
            key: "user-1/plans/plan-1/tampered.pdf",
            name: "tampered.pdf",
            updatedAt: "2026-05-04T10:00:00.000Z"
          }
        }
      ]
    },
    { existingData, userId: "user-1" }
  );

  assert.deepEqual(sanitized.plans[0].cloudPdf, existingData.plans[0].cloudPdf);
});

test("sanitizeGymData does not let sync tombstones remove existing server PDF metadata", () => {
  const existingData = {
    plans: [
      {
        id: "plan-1",
        cloudPdf: {
          key: "user-1/plans/plan-1/file.pdf",
          name: "file.pdf",
          updatedAt: "2026-05-03T10:00:00.000Z"
        }
      }
    ]
  };

  const sanitized = sanitizeGymData(
    {
      plans: [
        {
          id: "plan-1",
          pdfDeletedAt: "2026-05-03T10:05:00.000Z"
        }
      ]
    },
    { existingData, userId: "user-1" }
  );

  assert.deepEqual(sanitized.plans[0].cloudPdf, existingData.plans[0].cloudPdf);
  assert.equal(sanitized.plans[0].pdfDeletedAt, "2026-05-03T10:05:00.000Z");
});
