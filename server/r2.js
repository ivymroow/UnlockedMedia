const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const fs = require('fs');
const crypto = require('crypto');

const R2_ENDPOINT = process.env.R2_ENDPOINT || '';
const R2_KEY = process.env.R2_KEY || '';
const R2_SECRET = process.env.R2_SECRET || '';
const R2_BUCKET = process.env.R2_BUCKET || '';
const R2_PUBLIC = process.env.R2_PUBLIC || '';

function configured() { return !!(R2_ENDPOINT && R2_KEY && R2_SECRET && R2_BUCKET); }

async function uploadFile(filePath, hash) {
  if (!configured()) return null;
  const s3 = new S3Client({
    region: 'auto',
    endpoint: R2_ENDPOINT,
    credentials: { accessKeyId: R2_KEY, secretAccessKey: R2_SECRET },
    forcePathStyle: true,
  });
  const ext = '.mp4';
  const key = `streams/${hash}${ext}`;
  const body = fs.createReadStream(filePath);
  await s3.send(new PutObjectCommand({ Bucket: R2_BUCKET, Key: key, Body: body, ContentType: 'video/mp4' }));
  const url = R2_PUBLIC ? `${R2_PUBLIC.replace(/\/$/, '')}/${key}` : `${R2_ENDPOINT}/${R2_BUCKET}/${key}`;
  return url;
}

module.exports = { uploadFile, configured };
