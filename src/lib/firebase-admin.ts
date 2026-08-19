// Server-side Firestore access through the Firebase Admin SDK — ADR-006, Pasos 1 a 3.
//
// Why this exists: the backend used to reach Firestore with the *client* SDK
// (src/lib/firebase.ts, now deleted), so it was subject to firestore.rules. That is the reason
// those rules are still `allow read, write: if true` and the database is writable from the
// internet. The Admin SDK authenticates by IAM and does not evaluate the rules, which is the
// precondition for closing them in Paso 5.
//
// `adminDb` is now the ONLY path to Firestore in the process: every read, write and snapshot
// listener in src/server/store.ts goes through it. That makes the boot probe below load-bearing
// rather than informational — if it is red, the store is serving in-memory demo seed data.

import { applicationDefault, getApp, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, type Firestore } from 'firebase-admin/firestore';
import appletConfig from '../../firebase-applet-config.json';

// Known seed document. Any read would prove the credential works; this one also proves we are
// talking to the database that actually holds this app's data.
const PROBE_PATH = 'establishments/bodegon-palermo';
// Generous on purpose, and retried: a cold `npm run dev` boot hogs the event loop building the
// Vite server, which delays the Firestore response *and* this timer alike. A tight budget here
// reports a failure that is really just a busy CPU — and in production that means exit(1) on a
// perfectly good deploy.
const PROBE_TIMEOUT_MS = 20_000;
const PROBE_ATTEMPTS = 2;

const isProduction = process.env.NODE_ENV === 'production';

// Env var first, committed applet config as fallback. The fallback exists because a Cloud Run
// revision that refuses to boot just because AI Studio did not propagate a variable is worse
// than depending on a committed file; pointing at the wrong database in silence is worse than
// both, which is why the source of every value ends up in the boot log.
function resolveSetting(envVar: string, fallback: string): { value: string; source: string } {
  const fromEnv = (process.env[envVar] || '').trim();
  if (fromEnv) return { value: fromEnv, source: 'env' };
  return { value: fallback, source: 'firebase-applet-config.json' };
}

const project = resolveSetting('FIREBASE_PROJECT_ID', appletConfig.projectId);

// This project's database is NOT `(default)`. If the id goes missing the Admin SDK happily
// talks to `(default)`, finds it empty, and everything looks healthy while reading and writing
// the wrong place — so the id is always passed explicitly, never left to the default.
const database = resolveSetting('FIRESTORE_DATABASE_ID', appletConfig.firestoreDatabaseId);

// Application Default Credentials in both environments, zero branching (ADR-006 option E):
// locally GOOGLE_APPLICATION_CREDENTIALS points at the service-account key file, on Cloud Run
// the runtime service account comes from the metadata server. Only the origin is logged, never
// the file contents.
const credentialSource = process.env.GOOGLE_APPLICATION_CREDENTIALS
  ? `ADC (GOOGLE_APPLICATION_CREDENTIALS=${process.env.GOOGLE_APPLICATION_CREDENTIALS})`
  : 'ADC (runtime service account)';

// applicationDefault() resolves lazily, so a missing or malformed credential does not throw
// here — it surfaces on the probe. Kept as a module constant so the probe can resolve it
// explicitly before touching Firestore (see runProbe).
const credential = applicationDefault();
const app = getApps().length ? getApp() : initializeApp({ credential, projectId: project.value });

export const adminDb: Firestore = getFirestore(app, database.value);

console.log(
  `[Firestore] admin init: project=${project.value} (${project.source}) ` +
    `database=${database.value} (${database.source}) credential=${credentialSource}`
);

// A stalled metadata server or blackholed egress makes .get() hang indefinitely. Without a
// watchdog that case produces no log line at all — the worst outcome for a check whose whole
// job is to report — so a stall is turned into a rejection.
async function withProbeTimeout<T>(work: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  try {
    return await Promise.race([
      work,
      new Promise<T>((_resolve, reject) => {
        timer = setTimeout(
          () => reject(new Error(`probe timed out after ${PROBE_TIMEOUT_MS}ms`)),
          PROBE_TIMEOUT_MS
        );
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}

async function runProbe(): Promise<boolean> {
  let lastError = '';

  // Retry once before giving up. The second attempt runs with the boot work already done, so a
  // failure on both is a real credential/IAM/network problem and not event-loop starvation or
  // a cold connection — which matters because in production the verdict is exit(1).
  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt++) {
    try {
      // Resolve ADC before touching Firestore. If the key file is missing or malformed, the
      // Firestore SDK rejects the read *and* leaks a second, unhandled rejection from its
      // internal retry of the auth handshake — which tears down the process, dev included,
      // where this is supposed to be a warning. Failing on the credential first avoids it.
      await withProbeTimeout(credential.getAccessToken());
      const snap = await withProbeTimeout(adminDb.doc(PROBE_PATH).get());
      return reportProbeRead(snap.exists);
    } catch (err) {
      lastError = err instanceof Error ? err.message : String(err);
      if (attempt < PROBE_ATTEMPTS) {
        console.warn(`[Firestore] probe attempt ${attempt}/${PROBE_ATTEMPTS} failed: ${lastError} — retrying.`);
      }
    }
  }

  return reportProbeFailure(lastError);
}

function reportProbeRead(exists: boolean): boolean {
  if (!exists) {
    // The read itself succeeded, so ADC and IAM are fine; what is suspect is the target
    // database. Deliberately not fatal: gating boot on the presence of a *data* document would
    // crash-loop production the day that establishment is renamed or removed.
    console.warn(
      `[Firestore] probe: read ok but ${PROBE_PATH} does not exist in database=${database.value}. ` +
        'Verificá que sea la base correcta antes de desplegar (ADR-006 Paso 4).'
    );
    return false;
  }
  console.log(`[Firestore] probe ok: ${PROBE_PATH}`);
  return true;
}

function reportProbeFailure(detail: string): boolean {
  if (isProduction) {
    // Cloud Run does not promote a revision whose process dies at boot, and a dead revision is
    // strictly better than a live one that cannot reach Firestore: once the store moves to
    // adminDb, unreachable Firestore means the app serves the in-memory seed data behind a
    // healthy-looking panel. Dying here is what keeps that from ever shipping.
    console.error(
      `[Firestore] FATAL: admin probe failed on ${PROBE_PATH} ` +
        `(project=${project.value}, database=${database.value}): ${detail}`
    );
    process.exit(1);
  }
  console.warn(
    `[Firestore] probe failed on ${PROBE_PATH}: ${detail} — dev keeps running, but the store ` +
      'now depends on adminDb: expect the 9 listeners to be dead and the panel to be showing ' +
      'seed data. Check GET /api/health/details (admin session required; the public /api/health ' +
      'only carries the status verdict).'
  );
  return false;
}

// Fire-and-forget: module initialization cannot await, and blocking the boot on a network
// round-trip would delay every request for a check that only reports. Exported because
// GET /api/health/details reports this result instead of re-probing on every request (server.ts).
// Note this probe is a READ: a credential that can read but not write passes it. The write path
// is covered separately by the heartbeat in src/server/store.ts.
export const adminProbe: Promise<boolean> = runProbe();
