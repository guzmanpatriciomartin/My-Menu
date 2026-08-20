// Firestore + Auth adapter — backend only, Admin SDK exclusively (ADR-006 Paso 3).
// The Admin SDK bypasses firestore.rules (IAM-authorized). Using the client SDK here was
// the regression: it evaluated the deny-all rules and blocked the server, while also
// treating firebase-applet-config.json as a server credential.

import {
  getApps as getAdminApps,
  initializeApp as initializeAdminApp,
  cert,
  App as AdminApp,
} from 'firebase-admin/app';
import {
  getFirestore,
  Firestore as AdminFirestore,
  DocumentReference,
  DocumentSnapshot,
  QuerySnapshot,
} from 'firebase-admin/firestore';
import { getAuth, CreateRequest, UpdateRequest } from 'firebase-admin/auth';
import * as fs from 'fs';
import * as path from 'path';
import appletConfig from '../../firebase-applet-config.json';

const PROBE_PATH = 'establishments/bodegon-palermo';
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_ATTEMPTS = 2;

// Admin SDK onSnapshot returns () => void directly; no need to import Unsubscribe.
type Unsubscribe = () => void;

function resolveSetting(envVar: string, fallback: string): { value: string; source: string } {
  const fromEnv = (process.env[envVar] || '').trim();
  if (fromEnv) return { value: fromEnv, source: 'env' };
  return { value: fallback, source: 'firebase-applet-config.json' };
}

const project = resolveSetting('FIREBASE_PROJECT_ID', appletConfig.projectId);
const database = resolveSetting('FIRESTORE_DATABASE_ID', appletConfig.firestoreDatabaseId);

// getAdminApp must be declared before rawDb is assigned because rawDb calls it at module init.
let adminAppInstance: AdminApp | null = null;

export function getAdminApp(): AdminApp {
  if (adminAppInstance) return adminAppInstance;
  const apps = getAdminApps();
  if (apps.length > 0 && apps[0]) {
    adminAppInstance = apps[0];
    return adminAppInstance;
  }

  const serviceAccountPath = path.join(process.cwd(), 'firebase-service-account.json');
  if (fs.existsSync(serviceAccountPath)) {
    try {
      const sa = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
      adminAppInstance = initializeAdminApp({
        credential: cert(sa),
        projectId: sa.project_id || appletConfig.projectId,
      });
      return adminAppInstance;
    } catch (e) {
      console.warn('[Firebase Admin] Error loading service account:', e);
    }
  }

  // ADC path: Cloud Run injects the credential automatically via GOOGLE_APPLICATION_CREDENTIALS
  // or the metadata server. appletConfig is only used for projectId fallback, never for auth.
  adminAppInstance = initializeAdminApp({ projectId: appletConfig.projectId });
  return adminAppInstance;
}

const databaseId = database.value;

// Admin SDK: getFirestore(app) for the default database, getFirestore(app, id) for named ones.
// appletConfig.firestoreDatabaseId is the fallback — its value is the named database ID in
// AI Studio, so it is almost always non-default and takes the second branch.
export const rawDb: AdminFirestore =
  !databaseId || databaseId === '(default)'
    ? getFirestore(getAdminApp())
    : (getFirestore as any)(getAdminApp(), databaseId);

console.log(
  `[Firestore] init (Admin SDK): project=${project.value} (${project.source}) ` +
    `database=${databaseId || '(default)'} (${database.source})`
);

export class DocSnapWrapper<T = any> {
  constructor(private rawSnap: DocumentSnapshot) {}

  get id(): string {
    return this.rawSnap.id;
  }

  // Admin SDK: exists is a boolean property, not a function (unlike the client SDK).
  get exists(): boolean {
    return this.rawSnap.exists;
  }

  data(): T | undefined {
    return this.rawSnap.data() as T;
  }
}

export class QuerySnapWrapper<T = any> {
  constructor(private rawSnap: QuerySnapshot) {}

  get empty(): boolean {
    return this.rawSnap.empty;
  }

  get size(): number {
    return this.rawSnap.size;
  }

  get docs(): DocSnapWrapper<T>[] {
    return this.rawSnap.docs.map((d) => new DocSnapWrapper(d));
  }
}

export class DocRefWrapper {
  constructor(public rawRef: DocumentReference) {}

  get id(): string {
    return this.rawRef.id;
  }

  get path(): string {
    return this.rawRef.path;
  }

  async get(): Promise<DocSnapWrapper> {
    const snap = await this.rawRef.get();
    return new DocSnapWrapper(snap);
  }

  async set(data: any, options?: { merge?: boolean }): Promise<void> {
    if (options && options.merge) {
      await this.rawRef.set(data, { merge: true });
    } else {
      await this.rawRef.set(data);
    }
  }

  async update(data: any): Promise<void> {
    await this.rawRef.update(data);
  }

  async delete(): Promise<void> {
    await this.rawRef.delete();
  }

  onSnapshot(
    onNext: (snapshot: DocSnapWrapper) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    return this.rawRef.onSnapshot(
      (snap) => onNext(new DocSnapWrapper(snap)),
      (err) => {
        if (onError) onError(err);
      }
    );
  }
}

export class CollectionRefWrapper {
  constructor(private dbInstance: AdminFirestore, public collectionName: string) {}

  doc(docId?: string): DocRefWrapper {
    if (docId) {
      return new DocRefWrapper(this.dbInstance.collection(this.collectionName).doc(docId));
    }
    // No arg: Admin SDK generates a random ID, same behavior as the client SDK.
    return new DocRefWrapper(this.dbInstance.collection(this.collectionName).doc());
  }

  limit(n: number) {
    return {
      get: async (): Promise<QuerySnapWrapper> => {
        const snap = await this.dbInstance.collection(this.collectionName).limit(n).get();
        return new QuerySnapWrapper(snap);
      },
    };
  }

  async get(): Promise<QuerySnapWrapper> {
    const snap = await this.dbInstance.collection(this.collectionName).get();
    return new QuerySnapWrapper(snap);
  }

  onSnapshot(
    onNext: (snapshot: QuerySnapWrapper) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    return this.dbInstance.collection(this.collectionName).onSnapshot(
      (snap) => onNext(new QuerySnapWrapper(snap)),
      (err) => {
        if (onError) onError(err);
      }
    );
  }
}

export class BatchWrapper {
  // Admin SDK: db.batch() instead of writeBatch(db).
  private rawBatch = rawDb.batch();

  set(docRef: DocRefWrapper, data: any, options?: { merge?: boolean }): this {
    if (options && options.merge) {
      this.rawBatch.set(docRef.rawRef, data, { merge: true });
    } else {
      this.rawBatch.set(docRef.rawRef, data);
    }
    return this;
  }

  update(docRef: DocRefWrapper, data: any): this {
    this.rawBatch.update(docRef.rawRef, data);
    return this;
  }

  delete(docRef: DocRefWrapper): this {
    this.rawBatch.delete(docRef.rawRef);
    return this;
  }

  async commit(): Promise<void> {
    await this.rawBatch.commit();
  }
}

export const adminDb: any = {
  collection(name: string): CollectionRefWrapper {
    return new CollectionRefWrapper(rawDb, name);
  },
  doc(docPath: string): DocRefWrapper {
    return new DocRefWrapper(rawDb.doc(docPath));
  },
  batch(): BatchWrapper {
    return new BatchWrapper();
  },
  async getAll(...refs: DocRefWrapper[]): Promise<DocSnapWrapper[]> {
    return Promise.all(refs.map((r) => r.get()));
  },
};

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
    clearTimeout(timer!);
  }
}

async function runProbe(): Promise<boolean> {
  let lastError = '';

  for (let attempt = 1; attempt <= PROBE_ATTEMPTS; attempt++) {
    try {
      const snap: DocSnapWrapper = await withProbeTimeout(adminDb.doc(PROBE_PATH).get());
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
    console.log(
      `[Firestore] probe: connection ok, ${PROBE_PATH} not found in database=${databaseId || '(default)'}.`
    );
    return true;
  }
  console.log(`[Firestore] probe ok: ${PROBE_PATH}`);
  return true;
}

function reportProbeFailure(detail: string): boolean {
  console.warn(`[Firestore] probe notice: ${detail}`);
  return false;
}

export const adminAuth = {
  async verifyIdToken(idToken: string) {
    const auth = getAuth(getAdminApp());
    return auth.verifyIdToken(idToken);
  },
  async createUser(properties: CreateRequest) {
    const auth = getAuth(getAdminApp());
    return auth.createUser(properties);
  },
  async updateUser(uid: string, properties: UpdateRequest) {
    const auth = getAuth(getAdminApp());
    return auth.updateUser(uid, properties);
  },
  async deleteUser(uid: string) {
    const auth = getAuth(getAdminApp());
    return auth.deleteUser(uid);
  },
  async getUser(uid: string) {
    const auth = getAuth(getAdminApp());
    return auth.getUser(uid);
  },
  async getUserByEmail(email: string) {
    const auth = getAuth(getAdminApp());
    return auth.getUserByEmail(email);
  },
};

export const adminProbe: Promise<boolean> = runProbe();
