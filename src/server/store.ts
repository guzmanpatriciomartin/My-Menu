import { randomUUID } from 'crypto';
// One SDK against Firestore: `adminDb` (Admin SDK) serves every read, write and listener —
// ADR-006 Paso 3 completed the migration and the client SDK is gone from the project. The
// Admin SDK authenticates by IAM and does NOT evaluate firestore.rules, which is what lets
// those rules be closed in Paso 5. Until that deploy happens the database is still writable
// from the internet, so nothing here may be treated as the real security boundary yet.
import { adminDb } from '../lib/firebase-admin';
import {
  initialEstablishments,
  initialCategories,
  initialMenuItems,
  initialTables,
  generateSeedOrders,
  generateSeedTableCalls,
  generateSeedCashCloses,
  generateSeedCashRegisters,
} from '../db/seedData';
import {
  Establishment,
  Category,
  MenuItem,
  Table,
  Order,
  OrderItem,
  OrderStatus,
  TableCall,
  CashClose,
  CashRegisterSession,
  CashClosePreview,
  CashCloseTotals,
  MetricsSummary,
  ProductLine,
  TableLine,
  TableCloseReceipt,
  UserRole,
} from '../types';
import {
  computeByHour,
  computeByTable,
  computeComparison,
  computeTopProducts,
  computeTotals,
  deliveredInRange,
  isRevenueOrder,
  saleTimestamp,
} from './metrics';
import { dayBounds, elapsedInDay, isToday, shiftDay, venueDay } from './time';

interface DbSchema {
  establishments: Establishment[];
  categories: Category[];
  menuItems: MenuItem[];
  tables: Table[];
  orders: Order[];
}

// Minimal SSE sink so the store does not depend on express types.
interface SseSink {
  write(chunk: string): void;
}

// A connected SSE subscriber, tagged with its delivery scope (F-6).
//  - 'admin': receives every event of its own tenant.
//  - 'diner': receives only MENU_CHANGED and status changes for its own table.
interface SseClient {
  res: SseSink;
  scope: 'admin' | 'diner';
  establishmentId: string;
  tableId?: string;
}

// What the diner actually sends to create an order. name/price are NEVER trusted
// from the client — they are recomputed server-side from the catalog (F-3).
export interface OrderDraftItem {
  menuItemId: string;
  quantity: number;
  comment?: string;
}

export interface CreateOrderInput {
  establishmentId: string;
  tableId: string;
  dinerName?: string;
  items: OrderDraftItem[];
}

// Firestore rejects `undefined` as a field value outright — the whole write throws with
// `Cannot use "undefined" as a Firestore value` on the Admin SDK. Our documents are built
// from interfaces with optional fields (cancellationReason, deliveredAt, note, dinerName…),
// and an unset optional serializes to exactly that. Without this, a perfectly ordinary order
// with no cancellation reason could not be saved at all: the write failed, the error was
// swallowed, memory looked updated, and the next snapshot silently rolled it back.
// Dropping the key makes "absent" mean absent, which is what Firestore expects.
// It is generic over any object, so partial .update() payloads go through it unchanged —
// .update() rejects undefined exactly like .set(), and there "absent" additionally means
// "leave the stored value alone", which is what the partial mutations below rely on.
// The Admin SDK's `ignoreUndefinedProperties` would cover the same invariant, and is left OFF
// on purpose (ADR-006): two mechanisms enforcing one rule is how one of them rots unnoticed.
function forFirestore<T extends object>(value: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue !== undefined) out[key] = fieldValue;
  }
  return out;
}

// Same optional-field result shape used across this store (the project compiles with
// strictNullChecks off, so discriminated unions do not narrow on a boolean).
// 'storage_error' means nothing was written and a retry is safe. 'partial_close' means the
// opposite and must never be collapsed into it: the close document, the closed register and part
// of the order stamps did land, so the tenant's state is inconsistent and retrying would count
// the unstamped orders a second time (ADR-005 point 4).
export interface CashCloseResult {
  ok: boolean;
  close?: CashClose;
  reason?: 'empty' | 'not_open' | 'storage_error' | 'partial_close';
}

export interface CashCloseActor {
  email: string;
  name: string;
  role: UserRole;
}

// Result of a create attempt. A single shape (rather than a discriminated union)
// because this project compiles with strictNullChecks OFF, where boolean-discriminant
// narrowing is unreliable. The endpoint maps each outcome to a status code:
// ok -> 201, reason 'invalid_table' -> 400, reason 'unavailable_items' -> 409.
export interface CreateOrderResult {
  ok: boolean;
  order?: Order;
  reason?: 'invalid_table' | 'unavailable_items' | 'storage_error';
  unavailableItems?: string[];
}

// CASH_CLOSED and CASH_OPENED are admin-only by construction: shouldDeliver() whitelists what a diner
// may receive, so anything not listed there (this included) never reaches that channel.
type NotifyType =
  | 'ORDER_CREATED'
  | 'ORDER_STATUS_CHANGED'
  | 'MENU_CHANGED'
  | 'TABLES_CHANGED'
  | 'TABLE_CALL_CREATED'
  | 'TABLE_CALL_UPDATED'
  | 'TABLE_SESSION_CLOSED'
  | 'CASH_CLOSED'
  | 'CASH_OPENED';

interface NotifyPayload {
  establishmentId: string;
  tableId?: string;
  closedAt?: string;
  order?: Order;
}

// The collections mirrored into the in-memory projection. Declared as a constant (rather than
// counted from whatever managed to subscribe) for two reasons: it is the denominator that
// /api/health reports, so an attachListeners() that throws halfway must read as a degraded
// "4/9" instead of a healthy-looking "4/4"; and it makes the collection name a checked type,
// so the copy-paste typo that watch() exists to prevent becomes a compile error.
const WATCHED_COLLECTIONS = [
  'establishments',
  'categories',
  'menuItems',
  'tables',
  'orders',
  'tableCalls',
  'cashCloses',
  'cashRegisters',
  'tableCloses',
] as const;

type WatchedCollection = (typeof WATCHED_COLLECTIONS)[number];

// --- Write-path heartbeat (follow-up to the ADR-006 Paso 3 audit) ---
//
// Everything the health endpoint used to report is a READ: the boot probe is a .get() and the
// nine listeners are streams of reads. Two failures therefore read as perfectly healthy:
//
//  - A credential with read but not write access (roles/datastore.viewer where the deploy
//    expects roles/datastore.user). 9/9 listeners live, probe ok, and every write in this file
//    rejected. Twelve of those writes only `catch { console.error }` and then update memory and
//    emit SSE anyway, so the operator watches the change apply — status change, menu CRUD, table
//    close — and loses it on the next snapshot or the next restart. Only createOrder,
//    openCashRegister and the cash close report the failure upwards.
//  - A watch stream that freezes without ever calling its error callback. `subscribed` only
//    returns to false from that callback, so the listener keeps counting as live with a stale
//    lastSnapshotAt. Observed, not hypothetical: booting against a nonexistent
//    FIRESTORE_DATABASE_ID never invoked the error handler at all, because the Admin SDK retries
//    internally. That is exactly why an empty `errors` array is not evidence of life.
//
// One write covers both. Write a document on a fixed period, then wait for our own listener to
// hand it back: rejected write means the write path is broken, accepted write whose snapshot
// never returns means the stream is stalled — error callback or not.
//
// What it does NOT cover, so nobody reads more into it than it says:
//  - It proves ONE watch stream is alive, not nine. If the `orders` stream freezes silently while
//    this one keeps delivering, `orders` still reads as live with a stale lastSnapshotAt. Closing
//    that would need a heartbeat document inside each business collection, which means writing
//    non-tenant rows into tenant collections and teaching every getter and every metric to skip
//    them — a worse trade than the gap.
//  - It proves the write path for this document, not per-collection authorization. A denial scoped
//    to one collection would still read green.
//  - With more than one instance, another instance's beat lands in our listener and refreshes the
//    lag, so `heartbeatStream` can read 'ok' on an instance whose own stream is dead (`writePath`
//    is our own write result and is not maskable this way). Fixing it means one document per
//    instance, which then accumulates a dead document per retired revision. Left as-is because
//    this project already assumes a single process everywhere.
//
// Its own collection, deliberately NOT a tenth entry in WATCHED_COLLECTIONS: that array is the
// constant denominator /api/health reports, so adding to it would turn a healthy mirror into
// "9/10", and watch() would apply its id-vs-docId check and its `assign` to the business
// projection for a document that is not tenant data. A dedicated document listener costs a few
// lines and keeps both invariants intact. `_health` has no rule in firestore.rules and needs
// none: the Admin SDK does not evaluate rules. Today that also makes it the one collection the
// still-open rules do not expose, and after Paso 5 the catch-all denies it like the rest.
const HEARTBEAT_PATH = '_health/heartbeat';

// 60s, which is where three bounds meet:
//  - Far above the cost of the write it schedules: a Firestore write round-trip is ~100-500ms,
//    so the period is two orders of magnitude larger than the work, and two beats cannot overlap
//    in practice (there is an in-flight guard anyway, for when they do).
//  - Far below any traffic that matters: 1440 writes plus 1440 single-document reads per day per
//    instance. That is a rounding error next to a venue's own orders and the nine collection
//    streams, so buying a shorter detection window with a faster period is not worth it — and a
//    slower one buys savings nobody can measure.
//  - Below the operator's reaction budget: a broken write path has to surface within a service
//    shift and has to be visible inside the Paso 4 observation gate, not the next morning.
const HEARTBEAT_INTERVAL_MS = 60_000;

// Three periods. A single missed beat is a slow snapshot or a busy event loop — the boot probe
// already budgets 20s for exactly that on a cold `npm run dev` — while three consecutive misses
// are not explainable that way. Tolerating two is what keeps this from flapping, and a health
// field that flaps is a health field the operator learns to ignore.
const HEARTBEAT_STALE_MS = HEARTBEAT_INTERVAL_MS * 3;

// Liveness of a single listener. This state exists because a listener that dies does so in
// silence: neither SDK resubscribes after a terminal error (permission-denied, bad credential,
// missing database), the projection freezes on the demo seed data loaded in the constructor,
// and the panel keeps serving it as if it were real. Before Paso 3 the 9 error handlers only
// did console.error, so the only trace was a log line nobody reads.
interface ListenerState {
  // False until the subscription is created, and back to false once the error handler fires —
  // that callback means "this stream is over", not "retrying".
  subscribed: boolean;
  lastSnapshotAt?: string;
  lastErrorCode?: string;
  lastErrorAt?: string;
}

// Liveness of the heartbeat. Both halves start unknown on purpose: for the first moments of a
// boot no beat has settled yet, and reporting that as a failure would train whoever reads this
// endpoint to ignore the field.
interface HeartbeatState {
  subscribed: boolean;
  // Result of the LAST write attempt, not a sticky flag: a write path that recovers has to clear
  // its own alarm, the same way a snapshot clears a listener's lastErrorCode above.
  writeOk?: boolean;
  // When our own listener last handed the document back — the thing that tells "write rejected"
  // apart from "write accepted and the stream is dead".
  lastSnapshotMs?: number;
  // Oldest write known to have landed that no snapshot has confirmed yet; cleared on every
  // snapshot. It has to be the OLDEST rather than the most recent, otherwise a permanently dead
  // stream with a working write path would keep pushing the reference forward and never go stale.
  pendingSinceMs?: number;
  writeErrorCode?: string;
  writeErrorAt?: string;
  streamErrorCode?: string;
}

// What /api/health reports about the Firestore mirror. `listeners` is "live/total", where live
// means subscribed AND having delivered at least one snapshot: a subscription that never
// delivers is exactly the failure mode this is here to expose.
export interface FirestoreHealth {
  listeners: string;
  live: number;
  total: number;
  lastSnapshotAt?: string;
  down: string[];
  errors: Array<{ collection: string; code: string; at: string }>;
  // Heartbeat verdicts, as enums and numbers rather than prose so a monitor can alert on them.
  // 'pending' is the boot state for both and must never count as degraded.
  writePath: 'pending' | 'ok' | 'failing';
  heartbeatStream: 'pending' | 'ok' | 'stalled';
  // Age of the last confirmed write→snapshot round-trip. Undefined until the first one lands.
  heartbeatLagMs?: number;
  // Reported so a reader can judge the two above without knowing this file's constants.
  heartbeatIntervalMs: number;
  heartbeatStaleAfterMs: number;
  heartbeatErrorCode?: string;
}

// Only a coarse code travels to /api/health. That endpoint is unauthenticated, and a raw
// Firestore error message carries project/database ids and internal paths; the full error is
// logged server-side by the error handler in watch().
function listenerErrorCode(err: unknown): string {
  const code = (err as { code?: unknown })?.code;
  if (typeof code === 'number' || typeof code === 'string') return String(code);
  if (err instanceof Error && err.name) return err.name;
  return 'error';
}

function getSeedCollections(): Array<{ name: string; items: Array<{ id: string }> }> {
  return [
    { name: 'establishments', items: initialEstablishments },
    { name: 'categories', items: initialCategories },
    { name: 'menuItems', items: initialMenuItems },
    { name: 'tables', items: initialTables },
    { name: 'orders', items: generateSeedOrders() },
    { name: 'tableCalls', items: generateSeedTableCalls() },
    { name: 'cashCloses', items: generateSeedCashCloses() },
    { name: 'cashRegisters', items: generateSeedCashRegisters() },
    // tableCloses is deliberately NOT seeded. The database is past its demo stage and holds
    // real usage, so injecting a demo receipt into the venue's own closing history would be
    // indistinguishable from a real one in the admin panel. The collection fills up from
    // actual table closes instead. (The generator that used to sit here always returned an
    // empty array anyway: it filtered on tableId 'tbl-palermo-1', which never existed — the
    // seed tables are 'tab-pal-1'..'tab-pal-5'. So nothing is being lost by dropping it.)
  ];
}

class Store {
  // In-memory projection of Firestore. Reads (getters) are served synchronously from
  // here; it is kept current by the onSnapshot listeners below. Seeded with the demo
  // data so the API still responds before the first snapshot arrives.
  private data: DbSchema = {
    establishments: initialEstablishments,
    categories: initialCategories,
    menuItems: initialMenuItems,
    tables: initialTables,
    orders: generateSeedOrders(),
  };

  private sseClients: SseClient[] = [];
  private tableCalls: TableCall[] = generateSeedTableCalls();
  private cashCloses: CashClose[] = generateSeedCashCloses();
  private cashRegisters: CashRegisterSession[] = generateSeedCashRegisters();
  // Starts empty and is populated by its onSnapshot listener; there is no demo seed for it.
  private tableCloses: TableCloseReceipt[] = [];
  private closedSessions: Map<string, { closedAt: string; timestamp: number }> = new Map();

  // Serializes cash closes per tenant: two waiters hitting "Cerrar caja" at the same
  // instant must not both stamp the same orders. The second one waits, then finds an
  // empty pending set and gets a 409. Single-process only — with several instances this
  // needs a Firestore runTransaction instead.
  private cashClosesInFlight: Map<string, Promise<CashCloseResult>> = new Map();

  // Pre-populated with every watched collection so a listener that never even subscribed still
  // shows up as down in /api/health, instead of vanishing from both numerator and denominator.
  private listenerStates: Map<WatchedCollection, ListenerState> = new Map(
    WATCHED_COLLECTIONS.map((name) => [name, { subscribed: false }] as [WatchedCollection, ListenerState])
  );

  private heartbeat: HeartbeatState = { subscribed: false };
  private heartbeatTimer: ReturnType<typeof setInterval>;
  private heartbeatInFlight = false;
  private heartbeatBeats = 0;

  constructor() {
    this.initFirebaseSync();
  }

  private async initFirebaseSync() {
    try {
      this.attachListeners();
      // Before the seed, and outside the await: seedIfEmpty() is the first write of the boot and
      // it throws on an unreachable or read-only backend, which would skip the one signal that
      // exists to report that.
      this.startHeartbeat();
      // Idempotent boot seed: write ONLY collections that are empty; never overwrite
      // existing data and never seed from inside a snapshot handler (F-6/point 6).
      await this.seedIfEmpty();
      console.log('[Firestore] Admin store synchronized.');
    } catch (err) {
      console.error('[Firestore Sync Error]:', err);
    }
  }

  // Snapshot listeners keep this.data current. They ONLY mutate memory — they do NOT
  // call notifyClients. SSE notifications are emitted by the mutations themselves,
  // which carry the establishmentId needed for tenant/table segmentation (point 7).
  //
  // One line per collection: everything else is identical across the nine, and it used to be
  // nine copies of the same ten lines (ADR-006 Paso 3). The point of collapsing them is not
  // brevity — it is that a copy-paste block is where a wrong collection name or a field
  // assigned to the wrong array hides, and nine copies means nine chances of it.
  private attachListeners() {
    this.watch<Establishment>('establishments', (rows) => (this.data.establishments = rows));
    this.watch<Category>('categories', (rows) => (this.data.categories = rows));
    this.watch<MenuItem>('menuItems', (rows) => (this.data.menuItems = rows));
    this.watch<Table>('tables', (rows) => (this.data.tables = rows));
    this.watch<Order>('orders', (rows) => (this.data.orders = rows));
    this.watch<TableCall>('tableCalls', (rows) => (this.tableCalls = rows));
    this.watch<CashClose>('cashCloses', (rows) => (this.cashCloses = rows));
    this.watch<CashRegisterSession>('cashRegisters', (rows) => (this.cashRegisters = rows));
    this.watch<TableCloseReceipt>('tableCloses', (rows) => (this.tableCloses = rows));
  }

  // Mirrors one collection into memory and records its liveness. `assign` receives the whole
  // deduplicated array, matching the previous behaviour: each snapshot replaces the field
  // outright rather than applying docChanges, so a delete or an out-of-band edit can never
  // leave a stale row behind.
  private watch<T extends { id: string }>(name: WatchedCollection, assign: (rows: T[]) => void) {
    const state = this.listenerStates.get(name);
    state.subscribed = true;

    adminDb.collection(name).onSnapshot(
      (snap) => {
        // Gate on the invariant every write in this store upholds: the `id` FIELD equals the
        // document id. Each mutation passes the same value to .doc() that it stores in `id`
        // (cashRegisters uses establishmentId for both, so it satisfies this too), which means a
        // row that breaks the invariant did not come from here — it was written straight into
        // Firestore, which is still possible from the internet until firestore.rules is closed.
        //
        // Two concrete failures this closes, both of which the projection alone could not tell
        // apart from real data, because every ownership check in the project reads memory:
        //  - Document displacement across tenants: a doc carrying the `id` field of a victim's
        //    menu item plus the attacker's own establishmentId lands in memory under the
        //    victim's id. Dedup order is snapshot order (document id), so the attacker picks
        //    who wins — and an authenticated DELETE /api/menu-items/:id, whose ownership check
        //    passed against the injected row, deletes the victim's real document by that id.
        //  - `id` pointing at a document that does not exist (POST to the REST API without
        //    documentId gets a random one): runCashClose stamps orders by that field, and a
        //    batch.update against a missing document aborts the whole batch, which would wedge
        //    cash closes for the tenant permanently.
        //
        // One choke point for all nine collections. Before Paso 3 collapsed the listeners this
        // same check would have had to be repeated nine times.
        const rows = new Map<string, T>();
        for (const d of snap.docs) {
          const row = d.data() as T;
          if (!row || row.id !== d.id) {
            console.warn(
              `[Firestore ${name}] discarding document with mismatched id: docId=${d.id} field id=${
                row ? String(row.id) : 'undefined'
              }`
            );
            continue;
          }
          rows.set(row.id, row);
        }
        // Keyed by id even though the check above makes collisions impossible: the map is what
        // guarantees it, and dropping it would restore the duplicate-row exposure (two copies of
        // one order counted twice by the cash close) the moment the check is relaxed.
        assign(Array.from(rows.values()));

        state.lastSnapshotAt = new Date().toISOString();
        // A snapshot proves the stream recovered, so a previous error stops counting against
        // this listener. Business-day logic goes through ./time; this is a wall-clock instant
        // for an operator to read, which is why new Date() is right here.
        state.lastErrorCode = undefined;
        state.lastErrorAt = undefined;
      },
      (err) => {
        // Terminal error: the SDK will NOT resubscribe. Memory is now frozen at whatever it
        // last held while the API keeps answering, so this has to survive as state and not just
        // as a log line — /api/health reads it.
        state.subscribed = false;
        state.lastErrorCode = listenerErrorCode(err);
        state.lastErrorAt = new Date().toISOString();
        console.error(`[Firestore ${name} listener]`, err);
      }
    );
  }

  // Subscribes to the heartbeat document and beats once immediately, then on a fixed period.
  // The immediate beat is what makes the deploy gate usable: making the health endpoint say
  // nothing about the write path for a whole minute after boot would push the Paso 4 check out
  // for no reason, and "pending" is precisely the answer an operator cannot act on.
  private startHeartbeat() {
    this.watchHeartbeat();
    void this.beat();
    this.heartbeatTimer = setInterval(() => void this.beat(), HEARTBEAT_INTERVAL_MS);
    // This timer must never be the reason the process stays alive: the Express server is what
    // keeps the event loop busy, and a ref'd interval would hold a shutdown open for a minute.
    this.heartbeatTimer.unref?.();
  }

  // Document listener, not watch(): see HEARTBEAT_PATH. Nothing is mirrored into the projection —
  // the only thing the payload is used for is the fact that it arrived.
  private watchHeartbeat() {
    this.heartbeat.subscribed = true;

    adminDb.doc(HEARTBEAT_PATH).onSnapshot(
      (snap) => {
        // Only an existing document counts. Subscribing to a missing document delivers a snapshot
        // immediately, before the first beat has written anything, and taking that as "the stream
        // delivered" would report a healthy stream on top of a dead write path — the exact
        // false-green this whole mechanism exists to remove.
        if (!snap.exists) return;
        this.heartbeat.lastSnapshotMs = Date.now();
        // Round-trip confirmed, so nothing is outstanding and a previous stream error stops
        // counting — same contract as a snapshot clearing lastErrorCode in watch().
        this.heartbeat.pendingSinceMs = undefined;
        this.heartbeat.streamErrorCode = undefined;
      },
      (err) => {
        // Terminal, like every other listener here: the SDK will not resubscribe, so from now on
        // nothing can confirm a write ever came back.
        this.heartbeat.subscribed = false;
        this.heartbeat.streamErrorCode = listenerErrorCode(err);
        console.error('[Firestore heartbeat listener]', err);
      }
    );
  }

  // One beat: write, and let the listener above prove the write came back.
  private async beat() {
    // A beat still in flight when the next tick fires means Firestore is answering slower than
    // the period. Skipping avoids piling up overlapping writes against a backend that is already
    // struggling; the lag below reads the missing snapshots as a stalled stream regardless.
    if (this.heartbeatInFlight) return;
    this.heartbeatInFlight = true;
    const startedMs = Date.now();

    try {
      // Full .set() of a tiny document: no read, no transaction, and idempotent, so a retry can
      // never leave a shape the listener misreads. `at` and `beat` exist to make the document
      // actually change — Firestore delivers no snapshot for a write that changes nothing, and an
      // unchanged document would be indistinguishable from a stalled stream.
      await adminDb.doc(HEARTBEAT_PATH).set(
        forFirestore({ id: 'heartbeat', at: new Date(startedMs).toISOString(), beat: ++this.heartbeatBeats })
      );
      this.heartbeat.writeOk = true;
      this.heartbeat.writeErrorCode = undefined;
      this.heartbeat.writeErrorAt = undefined;
      // Start the outstanding-write clock only if nothing is outstanding yet. The snapshot for
      // this very write can land before the await resolves, in which case this records a
      // round-trip that is already complete; harmless, because it is cleared by the next beat's
      // snapshot well inside the three-period tolerance.
      if (!this.heartbeat.pendingSinceMs) this.heartbeat.pendingSinceMs = startedMs;
    } catch (err) {
      // The point of the exercise: the twelve `catch { console.error }` mutations in this file
      // cannot report a rejected write to anyone, so this one reports for all of them.
      this.heartbeat.writeOk = false;
      this.heartbeat.writeErrorCode = listenerErrorCode(err);
      this.heartbeat.writeErrorAt = new Date().toISOString();
      console.error('[Firestore] heartbeat write error:', err);
    } finally {
      this.heartbeatInFlight = false;
    }
  }

  // Liveness snapshot for GET /api/health. Note what this can and cannot tell you:
  // `lastSnapshotAt` only moves when a document changes, so an idle venue legitimately shows an
  // old timestamp — treat it as "the mirror was alive at least until then", never as a
  // staleness alarm. That is what `heartbeatLagMs` is for: it moves on a fixed period whether the
  // venue is busy or not, because we generate the change ourselves. What means trouble is
  // `listeners` below total, a non-empty `errors`, `writePath: 'failing'`, or
  // `heartbeatStream: 'stalled'`.
  public getFirestoreHealth(): FirestoreHealth {
    const down: string[] = [];
    const errors: FirestoreHealth['errors'] = [];
    let lastSnapshotAt: string;
    let live = 0;

    for (const [name, state] of this.listenerStates) {
      // Subscribed but never delivered counts as down on purpose: that is the shape of a
      // listener killed at boot, and it is indistinguishable from healthy by any other signal.
      if (state.subscribed && state.lastSnapshotAt) live++;
      else down.push(name);

      // Same-format UTC ISO strings, so lexicographic order is chronological order.
      if (state.lastSnapshotAt && (!lastSnapshotAt || state.lastSnapshotAt > lastSnapshotAt)) {
        lastSnapshotAt = state.lastSnapshotAt;
      }
      if (state.lastErrorCode) {
        errors.push({ collection: name, code: state.lastErrorCode, at: state.lastErrorAt });
      }
    }

    const total = this.listenerStates.size;
    return {
      listeners: `${live}/${total}`,
      live,
      total,
      lastSnapshotAt,
      down,
      errors,
      ...this.heartbeatHealth(),
    };
  }

  // The two heartbeat verdicts. Both answer 'pending' while nothing has been proven either way,
  // which is the correct reading for the first seconds of a boot: there is no heartbeat yet and
  // that is not a failure. Only 'failing' and 'stalled' are failures.
  private heartbeatHealth(): Pick<
    FirestoreHealth,
    'writePath' | 'heartbeatStream' | 'heartbeatLagMs' | 'heartbeatIntervalMs' | 'heartbeatStaleAfterMs' | 'heartbeatErrorCode'
  > {
    const hb = this.heartbeat;
    const now = Date.now();

    const writePath: FirestoreHealth['writePath'] =
      hb.writeOk === undefined ? 'pending' : hb.writeOk ? 'ok' : 'failing';

    let heartbeatStream: FirestoreHealth['heartbeatStream'];
    if (!hb.subscribed) {
      // The error callback fired: nothing will ever confirm a write again.
      heartbeatStream = 'stalled';
    } else if (hb.pendingSinceMs && now - hb.pendingSinceMs > HEARTBEAT_STALE_MS) {
      // A write landed and no snapshot came back for three periods. This is the freeze-without-
      // error case, and it is also what a failing write path degrades into once there is nothing
      // left to prove the stream alive — so read `writePath` first: if it says 'failing', that is
      // the actionable half and this one is only reporting the absence of fresh evidence.
      heartbeatStream = 'stalled';
    } else {
      heartbeatStream = hb.lastSnapshotMs ? 'ok' : 'pending';
    }

    return {
      writePath,
      heartbeatStream,
      heartbeatLagMs: hb.lastSnapshotMs ? now - hb.lastSnapshotMs : undefined,
      heartbeatIntervalMs: HEARTBEAT_INTERVAL_MS,
      heartbeatStaleAfterMs: HEARTBEAT_STALE_MS,
      // A rejected write wins over a dead stream: it is the more actionable of the two (IAM role
      // on the service account) and it is usually the cause of the other. Coarse code only, same
      // reason as listenerErrorCode — the full error is in the server log.
      heartbeatErrorCode: hb.writeErrorCode || hb.streamErrorCode,
    };
  }

  // Writes initial demo data ONLY into collections that are currently empty. Safe to
  // run on every boot: it never touches a collection that already has documents.
  private async seedIfEmpty() {
    const seedCols = getSeedCollections();
    for (const { name, items } of seedCols) {
      // The client SDK's `fromCache` guard that used to sit here is gone, and its intent is now
      // satisfied for free: the Admin SDK has no local cache and no offline write queue, so this
      // .get() either reached the server or threw. An empty snapshot therefore means "the
      // collection is empty", never "we could not reach Firestore" — the exact ambiguity the
      // guard existed to catch. On an unreachable backend this throws, initFirebaseSync logs it
      // and nothing is seeded: fail-closed, which is the behaviour we wanted anyway (ADR-006).
      const snap = await adminDb.collection(name).limit(1).get();

      if (snap.empty) {
        console.log(`[Firestore] Seeding empty collection "${name}"...`);
        for (let i = 0; i < items.length; i += 400) {
          const batch = adminDb.batch();
          const chunk = items.slice(i, i + 400);
          for (const item of chunk) {
            batch.set(adminDb.collection(name).doc(item.id), forFirestore(item));
          }
          await batch.commit();
        }
      }
    }
  }

  // Force (re)seed of all demo data — overwrites existing docs. Exposed ONLY through the
  // admin-guarded, env-gated POST /api/seed endpoint (F-9). Does not emit SSE events;
  // clients pick up the refreshed data via their normal polling.
  public async seedAllDemoData(): Promise<boolean> {
    console.log('[Firestore] Force-seeding all demo data...');
    const seedCols = getSeedCollections();
    for (const { name, items } of seedCols) {
      for (let i = 0; i < items.length; i += 400) {
        const batch = adminDb.batch();
        const chunk = items.slice(i, i + 400);
        for (const item of chunk) {
          batch.set(adminDb.collection(name).doc(item.id), forFirestore(item));
        }
        await batch.commit();
      }
    }
    this.data = {
      establishments: [...initialEstablishments],
      categories: [...initialCategories],
      menuItems: [...initialMenuItems],
      tables: [...initialTables],
      orders: generateSeedOrders(),
    };
    this.tableCalls = generateSeedTableCalls();
    this.cashCloses = generateSeedCashCloses();
    this.cashRegisters = generateSeedCashRegisters();
    this.closedSessions.clear();
    console.log('[Firestore] Force-seed complete.');
    return true;
  }

  // Getters (synchronous — read the in-memory projection)
  public getEstablishments(): Establishment[] {
    return this.data.establishments;
  }

  public getCategories(establishmentId: string): Category[] {
    return this.data.categories
      .filter((c) => c.establishmentId === establishmentId)
      .sort((a, b) => a.order - b.order);
  }

  public getMenuItems(establishmentId: string): MenuItem[] {
    return this.data.menuItems.filter((m) => m.establishmentId === establishmentId);
  }

  public getTables(establishmentId: string): Table[] {
    const establishmentTables = this.data.tables.filter((t) => t.establishmentId === establishmentId);
    const map = new Map<string, Table>();
    establishmentTables.forEach((t) => map.set(t.id, t));

    return Array.from(map.values()).map((table) => {
      const sessionKey = `${establishmentId}_${table.id}`;
      const closed = this.closedSessions.get(sessionKey);
      const closedAtStr = table.lastClosedAt || closed?.closedAt;
      const closedAtMs = closedAtStr ? new Date(closedAtStr).getTime() : 0;

      // Active session orders: must belong to this table, not cancelled, not archived in cash close,
      // and created strictly after the last closed timestamp.
      const sessionOrders = this.data.orders.filter((o) => {
        if (o.establishmentId !== establishmentId || o.tableId !== table.id) return false;
        if (o.status === 'Cancelado') return false;
        if (o.cashCloseId) return false;
        if (closedAtMs > 0 && new Date(o.createdAt).getTime() <= closedAtMs) return false;
        return true;
      });

      const pendingCalls = this.tableCalls.filter(
        (c) =>
          c.establishmentId === establishmentId &&
          c.tableId === table.id &&
          c.status === 'pending'
      );

      const isOccupied = sessionOrders.length > 0 || pendingCalls.length > 0;

      return {
        ...table,
        isOccupied,
        activeOrdersCount: sessionOrders.length,
        lastClosedAt: closedAtStr,
      };
    });
  }

  public getOrders(establishmentId: string): Order[] {
    return this.data.orders.filter((o) => o.establishmentId === establishmentId);
  }

  public getOrder(orderId: string): Order | undefined {
    return this.data.orders.find((o) => o.id === orderId);
  }

  // Scoped diner lookup (F-4): only orders that belong to the given tenant AND table
  // AND whose id was explicitly presented by the caller AND created during current open session.
  public lookupOrders(establishmentId: string, tableId: string, orderIds: string[]): Order[] {
    const table = this.data.tables.find((t) => t.id === tableId && t.establishmentId === establishmentId);
    const sessionKey = `${establishmentId}_${tableId}`;
    const closed = this.closedSessions.get(sessionKey);
    const closedAtStr = table?.lastClosedAt || closed?.closedAt;
    const closedAtMs = closedAtStr ? new Date(closedAtStr).getTime() : 0;
    const idSet = new Set(orderIds);

    return this.data.orders.filter(
      (o) =>
        o.establishmentId === establishmentId &&
        o.tableId === tableId &&
        idSet.has(o.id) &&
        !o.cashCloseId &&
        (closedAtMs === 0 || new Date(o.createdAt).getTime() > closedAtMs)
    );
  }

  // Order Mutations
  // Prices and names are recomputed from the catalog; the client's name/price are
  // ignored entirely (F-3). If ANY requested item is missing/foreign/unavailable, the
  // WHOLE order is rejected atomically (no Firestore write happens).
  public async createOrder(input: CreateOrderInput): Promise<CreateOrderResult> {
    const { establishmentId, tableId, items } = input;

    const table = this.data.tables.find(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (!table || !table.active) {
      return { ok: false, reason: 'invalid_table' };
    }

    const resolvedItems: OrderItem[] = [];
    const unavailableItems: string[] = [];

    for (const draft of items) {
      const menuItem = this.data.menuItems.find(
        (m) => m.id === draft.menuItemId && m.establishmentId === establishmentId
      );
      if (!menuItem || menuItem.available === false) {
        unavailableItems.push(draft.menuItemId);
        continue;
      }

      // Client-supplied quantity is clamped to a sane positive integer (cap 99);
      // comment is truncated to 200 chars. Name/price come from the catalog.
      const quantity = Math.min(Math.max(Math.floor(draft.quantity), 1), 99);
      const comment = draft.comment ? draft.comment.slice(0, 200) : undefined;

      resolvedItems.push({
        id: 'orditem-' + randomUUID(),
        menuItemId: menuItem.id,
        name: menuItem.name,
        price: menuItem.price,
        quantity,
        ...(comment ? { comment } : {}),
      });
    }

    if (unavailableItems.length > 0) {
      return { ok: false, reason: 'unavailable_items', unavailableItems };
    }

    const now = new Date().toISOString();
    const newOrder: Order = {
      id: 'ord-' + randomUUID(),
      establishmentId,
      tableId,
      tableName: table.name, // derived server-side, never trusted from the client
      dinerName: input.dinerName ? input.dinerName.slice(0, 100) : undefined,
      items: resolvedItems,
      status: 'Recibido', // server-authoritative initial status
      createdAt: now,
      updatedAt: now,
      paymentStatus: null,
    };

    // Clear any previous closed session flag when a new order is placed
    this.clearTableSession(establishmentId, tableId);

    try {
      await adminDb.collection('orders').doc(newOrder.id).set(forFirestore(newOrder));
    } catch (err) {
      console.error('[Firestore] Order save error:', err);
      return { ok: false, reason: 'storage_error' };
    }
    this.data.orders.push(newOrder);
    this.notifyClients('ORDER_CREATED', { establishmentId, order: newOrder });
    return { ok: true, order: newOrder };
  }

  // Partial update by design: this mutation must never rewrite the whole order document.
  // `current` is read before the await, and runCashClose can stamp `cashCloseId` on the
  // same order while our write is in flight. A full-document .set() rebuilt from `current`
  // would carry no stamp and erase it in Firestore for good — the order would drop back
  // into pendingCashCloseOrders and be counted a second time in the next close, and the
  // 409 freeze would silently stop applying (ADR-005). Sending only the fields we own
  // keeps `cashCloseId` out of the payload, so it cannot be clobbered.
  public async updateOrderStatus(orderId: string, establishmentId: string, status: OrderStatus, cancellationReason?: string): Promise<Order | null> {
    const current = this.data.orders.find(
      (o) => o.id === orderId && o.establishmentId === establishmentId
    );
    if (!current) return null;

    // Defense in depth: an order already counted in a cash close is frozen, otherwise
    // cancelling it afterwards would silently unbalance an issued receipt. The endpoint
    // checks this first and answers 409; this guard covers any other caller. (ADR-005)
    if (current.cashCloseId) return null;

    const now = new Date().toISOString();
    // Keys are added conditionally instead of being set to undefined: with .update() an
    // absent key means "leave the stored value alone", which is exactly the old
    // `cancellationReason || current.cancellationReason` semantics without having to read
    // the (possibly stale) current value back into the payload.
    const changes: Partial<Order> = {
      status,
      updatedAt: now,
      ...(cancellationReason ? { cancellationReason } : {}),
      // Stamped exactly once, on the first transition to delivered. Re-delivering must
      // not move the sale into a later period.
      ...(status === 'Entregado' && !current.deliveredAt ? { deliveredAt: now } : {}),
    };

    try {
      await adminDb.collection('orders').doc(current.id).update(forFirestore(changes));
    } catch (e) {
      console.error('[Firestore] Order status write error:', e);
    }

    // Re-locate by id after the await instead of reusing a pre-await index: the orders
    // listener replaces the whole array on every snapshot and its order follows
    // snap.docs (document id), so one inserted `ord-<uuid>` shifts every later index —
    // a stored index would overwrite a different order (duplicating one, losing another).
    const index = this.data.orders.findIndex((o) => o.id === current.id);
    // Merge onto the freshest record, not onto the pre-await copy, so anything a snapshot
    // brought in meanwhile (notably cashCloseId) survives in memory too.
    const latest = index === -1 ? current : this.data.orders[index];
    // The old check compared updatedAt, which never trips for the case that matters:
    // runCashClose does not touch updatedAt. Watch for the stamp itself instead.
    if (latest.cashCloseId) {
      console.warn('[Store] Concurrency warning: order', orderId, 'was stamped by a cash close while this update was in flight; the change was applied to an order that is now frozen.');
    }
    const updated: Order = { ...latest, ...changes };
    // index === -1 means a snapshot dropped the order while we were writing. The snapshot
    // is authoritative, so do not resurrect it in memory — just report what we wrote.
    if (index !== -1) this.data.orders[index] = updated;
    this.notifyClients('ORDER_STATUS_CHANGED', { establishmentId: updated.establishmentId, order: updated });
    return updated;
  }

  // Cancel or reduce quantity of an individual dish from an order
  public async cancelOrderItem(
    orderId: string,
    establishmentId: string,
    orderItemId: string,
    quantityToCancel?: number,
    cancellationReason?: string
  ): Promise<{ order: Order | null; error?: string; status?: number }> {
    const current = this.data.orders.find(
      (o) => o.id === orderId && o.establishmentId === establishmentId
    );
    if (!current) return { order: null, error: 'Order not found', status: 404 };

    if (current.cashCloseId) {
      return { order: null, error: 'El pedido pertenece a un cierre de caja y no puede modificarse', status: 409 };
    }

    if (current.status === 'Cancelado') {
      return { order: null, error: 'El pedido ya se encuentra cancelado', status: 400 };
    }

    const itemIndex = current.items.findIndex((it) => it.id === orderItemId);
    if (itemIndex === -1) {
      return { order: null, error: 'Item not found in order', status: 404 };
    }

    const targetItem = current.items[itemIndex];
    const now = new Date().toISOString();

    let updatedItems: OrderItem[];
    if (quantityToCancel && quantityToCancel > 0 && quantityToCancel < targetItem.quantity) {
      // Partially reduce quantity
      updatedItems = current.items.map((it, idx) =>
        idx === itemIndex
          ? { ...it, quantity: it.quantity - quantityToCancel }
          : it
      );
    } else {
      // Remove item completely
      updatedItems = current.items.filter((_, idx) => idx !== itemIndex);
    }

    const allCancelled = updatedItems.length === 0;
    // Same reasoning as updateOrderStatus: only the fields this mutation owns travel to
    // Firestore, so a cashCloseId stamped by a concurrent cash close cannot be erased by
    // a full-document write rebuilt from the pre-await copy (ADR-005). Untouched keys are
    // omitted rather than re-sent with their stale values.
    const changes: Partial<Order> = {
      items: updatedItems,
      updatedAt: now,
      ...(allCancelled
        ? {
            status: 'Cancelado' as OrderStatus,
            cancellationReason: cancellationReason || `Cancelado plato: ${targetItem.name}`,
          }
        : {}),
    };

    try {
      await adminDb.collection('orders').doc(current.id).update(forFirestore(changes));
    } catch (e) {
      console.error('[Firestore] Cancel order item write error:', e);
    }

    // Re-locate by id after the await (see updateOrderStatus): a snapshot landing during
    // the write shifts every index in this.data.orders.
    const index = this.data.orders.findIndex((o) => o.id === current.id);
    const latest = index === -1 ? current : this.data.orders[index];
    if (latest.cashCloseId) {
      console.warn('[Store] Concurrency warning: order', orderId, 'was stamped by a cash close while this item cancellation was in flight; it modified an order that is now frozen.');
    }
    const updated: Order = { ...latest, ...changes };
    if (index !== -1) this.data.orders[index] = updated;
    this.notifyClients('ORDER_STATUS_CHANGED', { establishmentId: updated.establishmentId, order: updated });
    return { order: updated };
  }

  // MenuItem CRUD
  public async saveMenuItem(item: MenuItem): Promise<MenuItem> {
    const existingIndex = this.data.menuItems.findIndex(
      (m) => m.id === item.id && m.establishmentId === item.establishmentId
    );
    if (existingIndex === -1) {
      const globalIndex = this.data.menuItems.findIndex((m) => m.id === item.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
    }

    try {
      await adminDb.collection('menuItems').doc(item.id).set(forFirestore(item));
    } catch (e) {
      console.error('[Firestore] saveMenuItem error:', e);
    }
    // Re-locate by id after the await: the menuItems listener replaces the whole array on
    // every snapshot, so the index found above may now point at a different item.
    const index = this.data.menuItems.findIndex((m) => m.id === item.id);
    if (index !== -1) {
      this.data.menuItems[index] = item;
    } else {
      this.data.menuItems.push(item);
    }
    this.notifyClients('MENU_CHANGED', { establishmentId: item.establishmentId });
    return item;
  }

  public async deleteMenuItem(itemId: string, establishmentId: string): Promise<boolean> {
    const exists = this.data.menuItems.some(
      (m) => m.id === itemId && m.establishmentId === establishmentId
    );
    if (!exists) return false;

    try {
      await adminDb.collection('menuItems').doc(itemId).delete();
    } catch (e) {
      console.error('[Firestore] deleteMenuItem error:', e);
    }
    // Re-locate by id after the await: splicing a pre-await index would delete whichever
    // item a snapshot moved into that slot, not this one.
    const index = this.data.menuItems.findIndex(
      (m) => m.id === itemId && m.establishmentId === establishmentId
    );
    if (index !== -1) this.data.menuItems.splice(index, 1);
    this.notifyClients('MENU_CHANGED', { establishmentId });
    return true;
  }

  // Category CRUD
  public async saveCategory(category: Category): Promise<Category> {
    const existingIndex = this.data.categories.findIndex(
      (c) => c.id === category.id && c.establishmentId === category.establishmentId
    );
    if (existingIndex === -1) {
      const globalIndex = this.data.categories.findIndex((c) => c.id === category.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
    }

    try {
      await adminDb.collection('categories').doc(category.id).set(forFirestore(category));
    } catch (e) {
      console.error('[Firestore] saveCategory error:', e);
    }
    // Re-locate by id after the await (snapshots replace the whole array).
    const index = this.data.categories.findIndex((c) => c.id === category.id);
    if (index !== -1) {
      this.data.categories[index] = category;
    } else {
      this.data.categories.push(category);
    }
    this.notifyClients('MENU_CHANGED', { establishmentId: category.establishmentId });
    return category;
  }

  public async deleteCategory(categoryId: string, establishmentId: string): Promise<boolean> {
    const exists = this.data.categories.some(
      (c) => c.id === categoryId && c.establishmentId === establishmentId
    );
    if (!exists) return false;

    // Cascade: delete the category and its menu items within the same tenant.
    const cascadingItems = this.data.menuItems.filter(
      (m) => m.categoryId === categoryId && m.establishmentId === establishmentId
    );

    try {
      const batch = adminDb.batch();
      batch.delete(adminDb.collection('categories').doc(categoryId));
      for (const m of cascadingItems) {
        batch.delete(adminDb.collection('menuItems').doc(m.id));
      }
      await batch.commit();
    } catch (e) {
      console.error('[Firestore] deleteCategory error:', e);
    }

    // Re-locate by id after the await: splicing a pre-await index could remove a different
    // category. The menuItems cascade below is already id-based, so it needs no fix.
    const index = this.data.categories.findIndex(
      (c) => c.id === categoryId && c.establishmentId === establishmentId
    );
    if (index !== -1) this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(
      (m) => !(m.categoryId === categoryId && m.establishmentId === establishmentId)
    );
    this.notifyClients('MENU_CHANGED', { establishmentId });
    return true;
  }

  // Table CRUD
  public async saveTable(table: Table): Promise<Table> {
    const existingIndex = this.data.tables.findIndex(
      (t) => t.id === table.id && t.establishmentId === table.establishmentId
    );
    if (existingIndex === -1) {
      const globalIndex = this.data.tables.findIndex((t) => t.id === table.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
    }

    try {
      await adminDb.collection('tables').doc(table.id).set(forFirestore(table));
    } catch (e) {
      console.error('[Firestore] saveTable error:', e);
    }

    // Re-locate by id after the await (snapshots replace the whole array). Looking the id
    // up again also subsumes the previous alreadyInList duplicate guard.
    const index = this.data.tables.findIndex((t) => t.id === table.id);
    if (index !== -1) {
      this.data.tables[index] = table;
    } else {
      this.data.tables.push(table);
    }
    this.notifyClients('TABLES_CHANGED', { establishmentId: table.establishmentId });
    return table;
  }

  public async deleteTable(tableId: string, establishmentId: string): Promise<boolean> {
    const exists = this.data.tables.some(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (!exists) return false;

    try {
      await adminDb.collection('tables').doc(tableId).delete();
    } catch (e) {
      console.error('[Firestore] deleteTable error:', e);
    }
    // Re-locate by id after the await: splicing a pre-await index would drop whichever
    // table a snapshot moved into that slot.
    const index = this.data.tables.findIndex(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (index !== -1) this.data.tables.splice(index, 1);
    this.notifyClients('TABLES_CHANGED', { establishmentId });
    return true;
  }

  // Table Calls & Notifications
  public getTableCalls(establishmentId: string): TableCall[] {
    const sortedCalls = this.tableCalls
      .filter((c) => c.establishmentId === establishmentId)
      .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

    // Filter duplicate pending calls for the same table and call type (keep the newest)
    const seenPending = new Set<string>();
    return sortedCalls.filter((call) => {
      if (call.status === 'pending') {
        const key = `${call.tableId}_${call.type}`;
        if (seenPending.has(key)) return false;
        seenPending.add(key);
      }
      return true;
    });
  }

  public async createTableCall(input: {
    establishmentId: string;
    tableId: string;
    dinerName?: string;
    type: 'waiter_call' | 'bill_request';
  }): Promise<TableCall | null> {
    const table = this.data.tables.find(
      (t) => t.id === input.tableId && t.establishmentId === input.establishmentId
    );
    if (!table || !table.active) return null;

    // Check if an active pending call already exists for this table and call type
    const existingIndex = this.tableCalls.findIndex(
      (c) =>
        c.establishmentId === input.establishmentId &&
        c.tableId === input.tableId &&
        c.type === input.type &&
        c.status === 'pending'
    );

    if (existingIndex !== -1) {
      // Reuse existing pending call to avoid creating duplicate requests
      const existingCall = this.tableCalls[existingIndex];
      const updatedCall: TableCall = {
        ...existingCall,
        tableName: table.name,
        dinerName: input.dinerName || existingCall.dinerName,
        createdAt: new Date().toISOString(),
      };

      try {
        await adminDb.collection('tableCalls').doc(updatedCall.id).set(forFirestore(updatedCall));
      } catch (e) {
        console.error('[Firestore] createTableCall update existing error:', e);
      }

      this.tableCalls[existingIndex] = updatedCall;
      this.notifyClients('TABLE_CALL_CREATED', { establishmentId: input.establishmentId });
      return updatedCall;
    }

    const newCall: TableCall = {
      id: 'call-' + randomUUID(),
      establishmentId: input.establishmentId,
      tableId: input.tableId,
      tableName: table.name,
      dinerName: input.dinerName || 'Comensal',
      type: input.type,
      status: 'pending',
      createdAt: new Date().toISOString(),
    };

    try {
      await adminDb.collection('tableCalls').doc(newCall.id).set(forFirestore(newCall));
    } catch (e) {
      console.error('[Firestore] createTableCall error:', e);
    }
    // A new diner call activates the table session
    this.clearTableSession(input.establishmentId, input.tableId);
    this.tableCalls.push(newCall);
    this.notifyClients('TABLE_CALL_CREATED', { establishmentId: input.establishmentId });
    return newCall;
  }

  public async updateTableCallStatus(
    callId: string,
    establishmentId: string,
    status: 'pending' | 'attended'
  ): Promise<TableCall | null> {
    const index = this.tableCalls.findIndex(
      (c) => c.id === callId && c.establishmentId === establishmentId
    );
    if (index === -1) return null;

    const targetCall = this.tableCalls[index];
    const updatedTarget: TableCall = { ...targetCall, status };

    // Find all matching calls for the same table and type in pending status to clear duplicates together
    const matchingCalls = this.tableCalls.filter(
      (c) =>
        c.establishmentId === establishmentId &&
        c.tableId === targetCall.tableId &&
        c.type === targetCall.type &&
        (c.id === callId || c.status === 'pending')
    );

    try {
      for (const call of matchingCalls) {
        await adminDb.collection('tableCalls').doc(call.id).set(forFirestore({ ...call, status }));
      }
    } catch (e) {
      console.error('[Firestore] updateTableCallStatus error:', e);
    }

    for (const call of matchingCalls) {
      const idx = this.tableCalls.findIndex((c) => c.id === call.id);
      if (idx !== -1) {
        this.tableCalls[idx] = { ...this.tableCalls[idx], status };
      }
    }

    this.notifyClients('TABLE_CALL_UPDATED', { establishmentId });
    return updatedTarget;
  }

  // Close Table Session (Admin / Staff Action)
  public async closeTableSession(
    establishmentId: string,
    tableId: string,
    closedByName?: string,
    closedByEmail?: string
  ): Promise<{ ok: boolean; closedAt?: string; ordersClosedCount?: number; tableClose?: TableCloseReceipt; reason?: string; error?: string }> {
    const tableIndex = this.data.tables.findIndex(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (tableIndex === -1) {
      return { ok: false, reason: 'table_not_found', error: 'Mesa no encontrada' };
    }

    const table = this.data.tables[tableIndex];
    const sessionKey = `${establishmentId}_${tableId}`;
    const closed = this.closedSessions.get(sessionKey);
    const closedAtStr = table.lastClosedAt || closed?.closedAt;
    const closedAtMs = closedAtStr ? new Date(closedAtStr).getTime() : 0;

    // Session orders that belong to the open session (created after previous closedAt and not archived in cash close)
    const currentSessionOrders = this.data.orders.filter(
      (o) =>
        o.establishmentId === establishmentId &&
        o.tableId === tableId &&
        o.status !== 'Cancelado' &&
        !o.cashCloseId &&
        (closedAtMs === 0 || new Date(o.createdAt).getTime() > closedAtMs)
    );

    const pendingCalls = this.tableCalls.filter(
      (c) => c.establishmentId === establishmentId && c.tableId === tableId && c.status === 'pending'
    );

    const closedAt = new Date().toISOString();
    this.closedSessions.set(sessionKey, { closedAt, timestamp: Date.now() });

    // Update table in-memory and in Firestore
    const updatedTable: Table = {
      ...table,
      lastClosedAt: closedAt,
      isOccupied: false,
      activeOrdersCount: 0,
    };
    this.data.tables[tableIndex] = updatedTable;

    try {
      await adminDb.collection('tables').doc(table.id).set(forFirestore(updatedTable), { merge: true });
    } catch (e) {
      console.error('[Firestore] closeTableSession table update error:', e);
    }

    // 1. Mark all active non-finalized orders for this table as 'Entregado' so they are archived as delivered sales
    let ordersClosedCount = 0;
    const finalizedOrders: Order[] = [];
    for (const order of currentSessionOrders) {
      if (order.status !== 'Entregado') {
        const result = await this.updateOrderStatus(order.id, establishmentId, 'Entregado');
        if (result !== null) {
          ordersClosedCount++;
          finalizedOrders.push(result);
        } else {
          finalizedOrders.push(order);
        }
      } else {
        ordersClosedCount++;
        finalizedOrders.push(order);
      }
    }

    // 2. Mark pending calls for this table as 'attended'
    for (const call of pendingCalls) {
      await this.updateTableCallStatus(call.id, establishmentId, 'attended');
    }

    // 3. Create TableCloseReceipt record if there were orders in this session
    let tableClose: TableCloseReceipt | undefined;
    if (finalizedOrders.length > 0) {
      const totalAmount = finalizedOrders.reduce(
        (sum, o) => sum + o.items.reduce((s, i) => s + i.price * i.quantity, 0),
        0
      );
      const dinerNames = [
        ...new Set(finalizedOrders.map((o) => o.dinerName).filter(Boolean) as string[]),
      ];

      tableClose = {
        id: `tclose_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        establishmentId,
        tableId,
        tableName: table.name,
        closedAt,
        closedByName: closedByName || 'Personal de Salón',
        closedByEmail: closedByEmail || '',
        openedAt: finalizedOrders[0]?.createdAt || closedAt,
        orders: finalizedOrders,
        totalAmount,
        orderCount: finalizedOrders.length,
        dinerNames,
      };

      this.tableCloses.unshift(tableClose);

      try {
        await adminDb.collection('tableCloses').doc(tableClose.id).set(forFirestore(tableClose));
      } catch (e) {
        console.error('[Firestore] save tableClose receipt error:', e);
      }
    }

    this.notifyClients('TABLE_SESSION_CLOSED', { establishmentId, tableId, closedAt });
    this.notifyClients('TABLES_CHANGED', { establishmentId });
    return { ok: true, closedAt, ordersClosedCount, tableClose };
  }

  // Get historical table close receipts for a venue (scoped by tenant)
  public getTableCloses(establishmentId: string): TableCloseReceipt[] {
    return this.tableCloses
      .filter((tc) => tc.establishmentId === establishmentId)
      .sort((a, b) => new Date(b.closedAt).getTime() - new Date(a.closedAt).getTime());
  }

  public clearTableSession(establishmentId: string, tableId: string): void {
    // Keep lastClosedAt in place to prevent resurrection of historical orders.
  }

  public getTableSessionStatus(establishmentId: string, tableId: string): { closedAt?: string } {
    this.purgeOldSessions();
    const table = this.data.tables.find((t) => t.id === tableId && t.establishmentId === establishmentId);
    const sessionKey = `${establishmentId}_${tableId}`;
    const entry = this.closedSessions.get(sessionKey);
    return { closedAt: table?.lastClosedAt || entry?.closedAt };
  }

  private purgeOldSessions(): void {
    const TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
    const now = Date.now();
    for (const [key, entry] of this.closedSessions) {
      if (now - entry.timestamp > TTL_MS) {
        this.closedSessions.delete(key);
      }
    }
  }

  // --- Cash close & metrics (ADR-005) ---

  // Orders that will go into the next close: delivered, belonging to this tenant, and
  // not yet stamped. Membership is by stamp rather than by time window, which is what
  // guarantees an order is never counted twice and never dropped — even if it was
  // delivered late, or the server restarted between closes.
  private pendingCashCloseOrders(establishmentId: string): Order[] {
    return this.data.orders.filter(
      (o) => o.establishmentId === establishmentId && isRevenueOrder(o) && !o.cashCloseId
    );
  }

  // Start of the open period. Descriptive only — it never decides which orders count.
  private openPeriodStart(establishmentId: string, pending: Order[]): string {
    const lastClose = this.getCashCloses(establishmentId, 1)[0];
    if (lastClose) return lastClose.periodEnd;

    // First close ever: start at the earliest sale we are about to count...
    if (pending.length > 0) {
      return pending
        .map(saleTimestamp)
        .reduce((earliest, at) => (at < earliest ? at : earliest));
    }
    // ...or, with nothing pending, at the start of the current business day.
    return dayBounds(venueDay()).from;
  }

  public getCashCloses(establishmentId: string, max = 30): CashClose[] {
    return this.cashCloses
      .filter((c) => c.establishmentId === establishmentId)
      .sort((a, b) => (a.periodEnd < b.periodEnd ? 1 : -1))
      .slice(0, max);
  }

  public getCashRegister(establishmentId: string): CashRegisterSession {
    const reg = this.cashRegisters.find((r) => r.establishmentId === establishmentId);
    if (reg) return reg;
    return {
      id: establishmentId,
      establishmentId,
      isOpen: false,
      initialAmount: 0,
    };
  }

  public async openCashRegister(
    establishmentId: string,
    actor: CashCloseActor,
    initialAmount = 0,
    note?: string
  ): Promise<{ ok: boolean; register?: CashRegisterSession; error?: string }> {
    const current = this.getCashRegister(establishmentId);
    if (current.isOpen) {
      return { ok: false, error: 'La caja ya se encuentra abierta para este establecimiento.' };
    }

    const now = new Date().toISOString();
    const updated: CashRegisterSession = {
      id: establishmentId,
      establishmentId,
      isOpen: true,
      openedAt: now,
      openedByEmail: actor.email,
      openedByName: actor.name,
      initialAmount,
      openNote: note?.trim() || undefined,
    };

    // The register is money state: if the write does not land, memory must not claim the
    // shift is open. Reporting the failure beats an opaque 500. The likely cause changed with
    // ADR-006 Paso 2: firestore.rules no longer applies to this write (the Admin SDK bypasses
    // them), so a rejection now points at the credential/IAM of the service account or at
    // Firestore being unreachable.
    try {
      await adminDb.collection('cashRegisters').doc(establishmentId).set(forFirestore(updated));
    } catch (err) {
      console.error('[Firestore] openCashRegister write error:', err);
      return {
        ok: false,
        error:
          'No se pudo guardar la apertura de caja: la base de datos rechazó la escritura. ' +
          'Revisá los logs del servidor: el acceso a Firestore del backend puede estar mal configurado.',
      };
    }

    const idx = this.cashRegisters.findIndex((r) => r.establishmentId === establishmentId);
    if (idx !== -1) {
      this.cashRegisters[idx] = updated;
    } else {
      this.cashRegisters.push(updated);
    }

    this.notifyClients('CASH_OPENED', { establishmentId });
    return { ok: true, register: updated };
  }

  // What the waiter sees before pressing the button. Same arithmetic as the close, but
  // writes nothing.
  public previewCashClose(establishmentId: string): CashClosePreview {
    const register = this.getCashRegister(establishmentId);
    const pending = register.isOpen ? this.pendingCashCloseOrders(establishmentId) : [];
    return {
      isOpen: register.isOpen,
      openedAt: register.openedAt,
      openedByEmail: register.openedByEmail,
      openedByName: register.openedByName,
      initialAmount: register.initialAmount ?? 0,
      openNote: register.openNote,
      periodStart: register.openedAt || this.openPeriodStart(establishmentId, pending),
      periodEnd: new Date().toISOString(),
      totals: computeTotals(pending),
      topProducts: computeTopProducts(pending),
      byTable: computeByTable(pending),
    };
  }

  public async executeCashClose(
    establishmentId: string,
    actor: CashCloseActor,
    note?: string
  ): Promise<CashCloseResult> {
    // Chain onto any close already running for this tenant so the two cannot select the
    // same orders; the loser sees an empty set and gets 'empty'.
    const previous = this.cashClosesInFlight.get(establishmentId);
    const run = (previous ?? Promise.resolve<CashCloseResult>({ ok: false })).then(
      () => this.runCashClose(establishmentId, actor, note),
      () => this.runCashClose(establishmentId, actor, note)
    );

    this.cashClosesInFlight.set(establishmentId, run);
    try {
      return await run;
    } finally {
      if (this.cashClosesInFlight.get(establishmentId) === run) {
        this.cashClosesInFlight.delete(establishmentId);
      }
    }
  }

  // Narrows a list of orders taken from the projection down to the ones that still have a
  // Firestore document, keeping the input order (the close totals are computed from the result,
  // so a reordering would only make the logs harder to read, but stability is free here).
  // Reads are chunked because getAll() sends one request carrying every document name.
  private async existingOrders(candidates: Order[]): Promise<Order[]> {
    const READ_CHUNK = 300;
    const found = new Set<string>();

    for (let i = 0; i < candidates.length; i += READ_CHUNK) {
      const refs = candidates
        .slice(i, i + READ_CHUNK)
        .map((order) => adminDb.collection('orders').doc(order.id));
      // No duplicate refs can reach here: watch() keys the projection by id, so two orders in
      // memory never share one. getAll rejects repeated document names.
      const snaps = await adminDb.getAll(...refs);
      for (const snap of snaps) {
        if (snap.exists) found.add(snap.id);
      }
    }

    return candidates.filter((order) => found.has(order.id));
  }

  private async runCashClose(
    establishmentId: string,
    actor: CashCloseActor,
    note?: string
  ): Promise<CashCloseResult> {
    const register = this.getCashRegister(establishmentId);
    if (!register.isOpen) {
      return { ok: false, reason: 'not_open' };
    }

    const candidates = this.pendingCashCloseOrders(establishmentId);
    // Refusing to record an empty close keeps the history meaningful and makes a
    // double-submit harmless.
    if (candidates.length === 0) return { ok: false, reason: 'empty' };

    // Re-read the documents we are about to stamp. The batch below uses .update(), which aborts
    // the ENTIRE batch with NOT_FOUND if any target is missing, so a single pending order whose
    // document does not exist would make every cash close for this tenant fail forever — not once.
    // watch() now refuses to mirror a row whose `id` field disagrees with its document id, which
    // removes the way that state could be injected, but it is not the only way to reach it: a
    // document deleted out of band between the snapshot and this call lands in the same place.
    // Excluding the ghosts (instead of aborting) keeps the close possible; they are logged because
    // an order in memory with no document behind it is a real anomaly, not routine.
    let pending: Order[];
    try {
      pending = await this.existingOrders(candidates);
    } catch (err) {
      // Read failure: nothing has been written yet, so a retry is safe.
      console.error('[Firestore] runCashClose pre-read error:', err);
      return { ok: false, reason: 'storage_error' };
    }

    if (pending.length !== candidates.length) {
      const kept = new Set(pending.map((o) => o.id));
      const missing = candidates.filter((o) => !kept.has(o.id)).map((o) => o.id);
      console.error(
        `[CashClose] establishment ${establishmentId}: excluding ${missing.length} pending order(s) ` +
          `with no Firestore document: ${missing.join(', ')}`
      );
    }

    // Every candidate was a ghost: there is nothing real to close, and recording a zero-total
    // close over phantom orders would corrupt the history. Same answer as no pending orders.
    if (pending.length === 0) return { ok: false, reason: 'empty' };

    const now = new Date().toISOString();
    const close: CashClose = {
      id: 'close-' + randomUUID(),
      establishmentId,
      closedByEmail: actor.email,
      closedByName: actor.name,
      closedByRole: actor.role,
      periodStart: register.openedAt || this.openPeriodStart(establishmentId, pending),
      periodEnd: now,
      totals: computeTotals(pending),
      orderIds: pending.map((o) => o.id),
      topProducts: computeTopProducts(pending),
      byTable: computeByTable(pending),
      initialAmount: register.initialAmount ?? 0,
      openNote: register.openNote,
      note,
      createdAt: now,
    };

    const updatedRegister: CashRegisterSession = {
      id: establishmentId,
      establishmentId,
      isOpen: false,
      closedAt: now,
      initialAmount: 0,
    };

    // Atomic only WITHIN a batch. Firestore caps a batch at 500 writes, so a close of more than
    // ~490 orders is several commits, and atomicity does not span them: chunk 0 carries the close
    // document and the closed register, so once it lands the close is a fact even if a later chunk
    // fails. That is why the failure below is reported as 'partial_close' rather than as a clean
    // storage error — the pre-read above removes the most likely cause of a mid-loop failure, not
    // all of them (quota, network, a concurrent delete).
    const BATCH_LIMIT = 490;
    const chunks: Order[][] = [];
    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
      chunks.push(pending.slice(i, i + BATCH_LIMIT));
    }

    // A failed commit must leave memory untouched: claiming the close happened would
    // strand the orders with no cashCloseId and let the next close count them again.
    for (let i = 0; i < chunks.length; i++) {
      const batch = adminDb.batch();
      if (i === 0) {
        batch.set(adminDb.collection('cashCloses').doc(close.id), forFirestore(close));
        batch.set(adminDb.collection('cashRegisters').doc(establishmentId), forFirestore(updatedRegister));
      }
      for (const order of chunks[i]) {
        // Stamp only, never a full-document set: `order` is a pre-await copy taken from
        // memory, so rewriting the whole document here would revert a status change or
        // an item cancellation that landed while this batch was being built — the mirror
        // image of the race that updateOrderStatus/cancelOrderItem now avoid.
        // batch.update fails the whole batch if the document is missing (unlike set), which is
        // the safer direction for a stamp; the pre-read is what keeps that strictness from
        // turning a stray document into a permanent denial of cash closes.
        batch.update(adminDb.collection('orders').doc(order.id), { cashCloseId: close.id });
      }

      try {
        await batch.commit();
      } catch (err) {
        console.error(`[Firestore] runCashClose batch error (chunk ${i + 1}/${chunks.length}):`, err);

        // Chunk 0 failed: nothing at all was written, memory is untouched, retrying is safe.
        if (i === 0) return { ok: false, reason: 'storage_error' };

        // Anything past chunk 0: the close document, the closed register and the stamps of every
        // previous chunk ARE persisted. Memory is deliberately left alone here — the snapshot
        // listeners will mirror whatever actually landed, which is more accurate than anything we
        // could reconstruct. What must not happen is telling the operator it is safe to retry:
        // the orders in the chunks that never committed have no cashCloseId, so a second close
        // would count them again on top of a close that already exists (ADR-005 point 4). Fixing
        // this needs the missing stamps applied by hand (or by a repair task) against close.id.
        console.error(
          `[CashClose] PARTIAL CLOSE ${close.id} for establishment ${establishmentId}: ` +
            `${i * BATCH_LIMIT} of ${pending.length} orders stamped, close and register already ` +
            `persisted. Remaining order ids: ${chunks
              .slice(i)
              .flat()
              .map((o) => o.id)
              .join(', ')}`
        );
        return { ok: false, reason: 'partial_close', close };
      }
    }

    // Memory after the write succeeded, mirroring the write-then-memory order used by
    // the rest of the store.
    this.cashCloses.push(close);
    const regIdx = this.cashRegisters.findIndex((r) => r.establishmentId === establishmentId);
    if (regIdx !== -1) {
      this.cashRegisters[regIdx] = updatedRegister;
    } else {
      this.cashRegisters.push(updatedRegister);
    }

    const stamped = new Set(close.orderIds);
    this.data.orders = this.data.orders.map((o) =>
      stamped.has(o.id) ? { ...o, cashCloseId: close.id } : o
    );

    this.notifyClients('CASH_CLOSED', { establishmentId });
    return { ok: true, close };
  }

  // Metrics are recomputed on demand from the in-memory projection: the data is already
  // here, the getters are sync, and a venue does tens or hundreds of orders a day. A
  // cached/persisted rollup would only add invalidation bugs at this scale.
  public getMetrics(establishmentId: string, day?: string): MetricsSummary {
    const targetDay = day ?? venueDay();
    const { from, to } = dayBounds(targetDay);

    const tenantOrders = this.data.orders.filter((o) => o.establishmentId === establishmentId);
    const dayOrders = deliveredInRange(tenantOrders, from, to);
    const totals = computeTotals(dayOrders);

    // For the day in progress, compare like-for-like: yesterday up to this same point in
    // the day. For a past day, compare full days.
    const elapsedMs = isToday(targetDay) ? elapsedInDay(targetDay) : 86_400_000;

    const comparison = computeComparison(
      totals.totalRevenue,
      dayBounds(shiftDay(targetDay, -1)),
      // Previous 7 days, excluding the target day itself.
      Array.from({ length: 7 }, (_, i) => dayBounds(shiftDay(targetDay, -(i + 1)))),
      // NOTE: this walks the tenant's full order history on every request. Fine at demo
      // volume; if the history grows, precompute daily rollups or derive them from the
      // recorded cash closes instead.
      tenantOrders,
      elapsedMs
    );

    return {
      day: targetDay,
      from,
      to,
      totals,
      topProducts: computeTopProducts(dayOrders),
      byHour: computeByHour(dayOrders),
      byTable: computeByTable(dayOrders),
      comparison,
    };
  }

  // SSE Subscription handlers
  public addSseClient(client: SseClient) {
    this.sseClients.push(client);
    // Send initial join message
    client.res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);
  }

  public removeSseClient(res: SseSink) {
    this.sseClients = this.sseClients.filter((c) => c.res !== res);
  }

  // Per-client tenant/table segmentation (F-6). A diner NEVER receives ORDER_CREATED,
  // TABLES_CHANGED, or any order from a different table.
  private shouldDeliver(client: SseClient, type: NotifyType, payload: NotifyPayload): boolean {
    if (payload.establishmentId !== client.establishmentId) return false;
    if (client.scope === 'admin') return true;

    // diner scope
    if (type === 'MENU_CHANGED') return true;
    if (type === 'ORDER_STATUS_CHANGED') {
      return payload.order?.tableId === client.tableId;
    }
    if (type === 'TABLE_SESSION_CLOSED') {
      return payload.tableId === client.tableId;
    }
    // ORDER_CREATED and TABLES_CHANGED are never delivered to a diner.
    return false;
  }

  private notifyClients(type: NotifyType, payload: NotifyPayload) {
    const data = JSON.stringify({ type, payload });
    this.sseClients.forEach((client) => {
      if (!this.shouldDeliver(client, type, payload)) return;
      try {
        client.res.write(`data: ${data}\n\n`);
      } catch (err) {
        // Stale client — remove it so it does not accumulate
        this.removeSseClient(client.res);
      }
    });
  }
}

export const store = new Store();
