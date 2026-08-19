// Firestore access adapter for backend services and store.
// Uses Firebase SDK with databaseId and applet credentials.

import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getFirestore,
  collection,
  doc,
  setDoc,
  updateDoc,
  deleteDoc,
  getDoc,
  getDocs,
  query,
  limit,
  onSnapshot,
  writeBatch,
  DocumentReference,
  DocumentSnapshot,
  QuerySnapshot,
  Firestore,
  Unsubscribe,
} from 'firebase/firestore';
import appletConfig from '../../firebase-applet-config.json';

const PROBE_PATH = 'establishments/bodegon-palermo';
const PROBE_TIMEOUT_MS = 15_000;
const PROBE_ATTEMPTS = 2;

function resolveSetting(envVar: string, fallback: string): { value: string; source: string } {
  const fromEnv = (process.env[envVar] || '').trim();
  if (fromEnv) return { value: fromEnv, source: 'env' };
  return { value: fallback, source: 'firebase-applet-config.json' };
}

const project = resolveSetting('FIREBASE_PROJECT_ID', appletConfig.projectId);
const database = resolveSetting('FIRESTORE_DATABASE_ID', appletConfig.firestoreDatabaseId);

const app = getApps().length ? getApp() : initializeApp(appletConfig);
export const rawDb: Firestore = getFirestore(app, database.value);

console.log(
  `[Firestore] init: project=${project.value} (${project.source}) ` +
    `database=${database.value} (${database.source})`
);

export class DocSnapWrapper<T = any> {
  constructor(private rawSnap: DocumentSnapshot) {}

  get id(): string {
    return this.rawSnap.id;
  }

  get exists(): boolean {
    return typeof this.rawSnap.exists === 'function'
      ? this.rawSnap.exists()
      : Boolean((this.rawSnap as any).exists);
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
    const snap = await getDoc(this.rawRef);
    return new DocSnapWrapper(snap);
  }

  async set(data: any, options?: { merge?: boolean }): Promise<void> {
    if (options && options.merge) {
      await setDoc(this.rawRef, data, { merge: true });
    } else {
      await setDoc(this.rawRef, data);
    }
  }

  async update(data: any): Promise<void> {
    await updateDoc(this.rawRef, data);
  }

  async delete(): Promise<void> {
    await deleteDoc(this.rawRef);
  }

  onSnapshot(
    onNext: (snapshot: DocSnapWrapper) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    return onSnapshot(
      this.rawRef,
      (snap) => onNext(new DocSnapWrapper(snap)),
      (err) => {
        if (onError) onError(err);
      }
    );
  }
}

export class CollectionRefWrapper {
  constructor(private dbInstance: Firestore, public collectionName: string) {}

  doc(docId?: string): DocRefWrapper {
    if (docId) {
      return new DocRefWrapper(doc(this.dbInstance, this.collectionName, docId));
    }
    return new DocRefWrapper(doc(collection(this.dbInstance, this.collectionName)));
  }

  limit(n: number) {
    return {
      get: async (): Promise<QuerySnapWrapper> => {
        const q = query(collection(this.dbInstance, this.collectionName), limit(n));
        const snap = await getDocs(q);
        return new QuerySnapWrapper(snap);
      },
    };
  }

  async get(): Promise<QuerySnapWrapper> {
    const snap = await getDocs(collection(this.dbInstance, this.collectionName));
    return new QuerySnapWrapper(snap);
  }

  onSnapshot(
    onNext: (snapshot: QuerySnapWrapper) => void,
    onError?: (error: any) => void
  ): Unsubscribe {
    return onSnapshot(
      collection(this.dbInstance, this.collectionName),
      (snap) => onNext(new QuerySnapWrapper(snap)),
      (err) => {
        if (onError) onError(err);
      }
    );
  }
}

export class BatchWrapper {
  private rawBatch = writeBatch(rawDb);

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
  doc(path: string): DocRefWrapper {
    return new DocRefWrapper(doc(rawDb, path));
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
    clearTimeout(timer);
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
      `[Firestore] probe: connection ok, ${PROBE_PATH} ready in database=${database.value}.`
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

export const adminProbe: Promise<boolean> = runProbe();
