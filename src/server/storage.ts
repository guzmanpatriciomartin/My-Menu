import { randomUUID } from 'crypto';
import { getStorage } from 'firebase-admin/storage';
import { getAdminApp } from '../lib/firebase-admin';
import appletConfig from '../../firebase-applet-config.json';
import { logger } from './logger';

export function sanitizeFilename(filename: string): string {
  return filename
    .replace(/[^a-zA-Z0-9._-]/g, '_')
    .slice(0, 100);
}

export interface UploadUrlResult {
  uploadUrl: string;
  publicUrl: string;
}

export async function getSignedUploadUrl(
  establishmentId: string,
  filename: string,
  contentType: string
): Promise<UploadUrlResult> {
  const sanitized = sanitizeFilename(filename);
  const fileKey = `${establishmentId}/${Date.now()}-${randomUUID().slice(0, 8)}-${sanitized}`;
  const bucketName = appletConfig.storageBucket || `${appletConfig.projectId}.appspot.com`;

  try {
    const bucket = getStorage(getAdminApp()).bucket(bucketName);
    const file = bucket.file(fileKey);

    const [signedUrl] = await file.getSignedUrl({
      action: 'write',
      expires: Date.now() + 5 * 60 * 1000, // 5 minutes
      contentType,
    });

    const publicUrl = `https://storage.googleapis.com/${bucketName}/${fileKey}`;
    return { uploadUrl: signedUrl, publicUrl };
  } catch (err) {
    logger.warn({ event: 'signed_url_fallback', error: err });
    // Safe API proxy fallback for environments where service account signed URL IAM is unavailable:
    const uploadUrl = `/api/my/uploads/direct?key=${encodeURIComponent(fileKey)}`;
    const publicUrl = `/api/uploads/${encodeURIComponent(fileKey)}`;
    return { uploadUrl, publicUrl };
  }
}
