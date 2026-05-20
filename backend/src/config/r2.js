"use strict";

const { S3Client } = require("@aws-sdk/client-s3");
const { r2AccessKeyId, r2Bucket, r2Endpoint, r2SecretAccessKey } = require("./env");

function getR2Config() {
  if (!r2Endpoint || !r2AccessKeyId || !r2SecretAccessKey || !r2Bucket) {
    return null;
  }

  return {
    bucket: r2Bucket,
    client: new S3Client({
      endpoint: r2Endpoint,
      region: "auto",
      credentials: {
        accessKeyId: r2AccessKeyId,
        secretAccessKey: r2SecretAccessKey
      }
    })
  };
}

module.exports = { getR2Config };
