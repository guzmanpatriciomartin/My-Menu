import { initializeApp, getApps, cert, applicationDefault, type App, type Credential } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Server-only Firebase Admin initialization (F-1/F-2).
// The Admin SDK authenticates as a service account and legitimately bypasses Firestore
// security rules — so the rules can (and must) be locked deny-all: only this backend
// touches the database, and the browser goes exclusively through the /api layer.
//
// Credentials:
//   - FIREBASE_SERVICE_ACCOUNT: JSON of a service-account key (used for local/dev). It is
//     NEVER committed; see .env.example / .gitignore.
//   - Otherwise Application Default Credentials (ADC) — the normal path on Cloud Run /
//     AI Studio, where the runtime provides the identity and no key file is needed.
const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseId = process.env.FIRESTORE_DATABASE_ID;

function buildCredential(): Credential {
  const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
  if (raw) {
    return cert(JSON.parse(raw));
  }
  return applicationDefault();
}

const app: App = getApps().length
  ? getApps()[0]
  : initializeApp({
      credential: buildCredential(),
      projectId,
    });

// Use the explicitly provisioned Firestore database id when provided; otherwise default.
export const db = databaseId ? getFirestore(app, databaseId) : getFirestore(app);
