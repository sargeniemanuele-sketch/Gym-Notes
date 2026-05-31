"use strict";

async function savePdfMetadataAfterUpload({ uploadObject, saveMetadata, cleanupUploadedObject }) {
  await uploadObject();

  try {
    return await saveMetadata();
  } catch (err) {
    await cleanupUploadedObject().catch((cleanupErr) => {
      console.warn("R2 cleanup after failed PDF upload DB update failed", cleanupErr);
    });
    throw err;
  }
}

function shouldCleanupUploadedPdfAfterMongoFailure({ usedMongoTransaction, mongoPdfKey, uploadedKey }) {
  if (usedMongoTransaction) {
    return true;
  }

  return !uploadedKey || mongoPdfKey !== uploadedKey;
}

async function removePdfMetadataBeforeStorageDelete({ removeMetadata, deleteObject, markPendingDelete }) {
  const result = await removeMetadata();

  if (!result?.deleteKey) {
    return result;
  }

  try {
    await deleteObject(result.deleteKey);

    if (markPendingDelete) {
      await markPendingDelete(null);
    }

    return { ...result, storageDeleted: true };
  } catch (err) {
    console.warn("PDF R2 delete failed after DB update", err);

    if (markPendingDelete) {
      await markPendingDelete(result.deleteKey);
    }

    return { ...result, storageDeleted: false, storageDeleteError: err };
  }
}

module.exports = {
  removePdfMetadataBeforeStorageDelete,
  savePdfMetadataAfterUpload,
  shouldCleanupUploadedPdfAfterMongoFailure
};
