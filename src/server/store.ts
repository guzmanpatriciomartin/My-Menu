import { randomUUID } from 'crypto';
import { db } from '../lib/firebase';
import {
  collection,
  doc,
  setDoc,
  deleteDoc,
  onSnapshot,
  getDocs,
  query,
  limit,
  writeBatch
} from 'firebase/firestore';
import {
  initialEstablishments,
  initialCategories,
  initialMenuItems,
  initialTables,
  generateSeedOrders,
  generateSeedTableCalls,
  generateSeedCashCloses,
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
  CashCloseTotals,
  MetricsSummary,
  ProductLine,
  TableLine,
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
// "Unsupported field value: undefined". Our documents are built from interfaces with
// optional fields (cancellationReason, deliveredAt, note, dinerName…), and an unset
// optional serializes to exactly that. Without this, a perfectly ordinary order with no
// cancellation reason could not be saved at all: the write failed, the error was
// swallowed, memory looked updated, and the next snapshot silently rolled it back.
// Dropping the key makes "absent" mean absent, which is what Firestore expects.
function forFirestore<T extends object>(value: T): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, fieldValue] of Object.entries(value)) {
    if (fieldValue !== undefined) out[key] = fieldValue;
  }
  return out;
}

// Same optional-field result shape used across this store (the project compiles with
// strictNullChecks off, so discriminated unions do not narrow on a boolean).
export interface CashCloseResult {
  ok: boolean;
  close?: CashClose;
  reason?: 'empty';
}

export interface CashClosePreview {
  periodStart: string;
  periodEnd: string;
  totals: CashCloseTotals;
  topProducts: ProductLine[];
  byTable: TableLine[];
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

// CASH_CLOSED is admin-only by construction: shouldDeliver() whitelists what a diner
// may receive, so anything not listed there (this included) never reaches that channel.
type NotifyType = 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'MENU_CHANGED' | 'TABLES_CHANGED' | 'TABLE_CALL_CREATED' | 'TABLE_CALL_UPDATED' | 'TABLE_SESSION_CLOSED' | 'CASH_CLOSED';

interface NotifyPayload {
  establishmentId: string;
  tableId?: string;
  closedAt?: string;
  order?: Order;
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
  private closedSessions: Map<string, { closedAt: string; timestamp: number }> = new Map();

  // Serializes cash closes per tenant: two waiters hitting "Cerrar caja" at the same
  // instant must not both stamp the same orders. The second one waits, then finds an
  // empty pending set and gets a 409. Single-process only — with several instances this
  // needs a Firestore runTransaction instead.
  private cashClosesInFlight: Map<string, Promise<CashCloseResult>> = new Map();

  constructor() {
    this.initFirebaseSync();
  }

  private async initFirebaseSync() {
    try {
      this.attachListeners();
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
  private attachListeners() {
    onSnapshot(
      collection(db, 'establishments'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as Establishment);
        const map = new Map<string, Establishment>();
        docs.forEach((d) => map.set(d.id, d));
        this.data.establishments = Array.from(map.values());
      },
      (err) => console.error('[Firestore establishments listener]', err)
    );
    onSnapshot(
      collection(db, 'categories'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as Category);
        const map = new Map<string, Category>();
        docs.forEach((d) => map.set(d.id, d));
        this.data.categories = Array.from(map.values());
      },
      (err) => console.error('[Firestore categories listener]', err)
    );
    onSnapshot(
      collection(db, 'menuItems'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as MenuItem);
        const map = new Map<string, MenuItem>();
        docs.forEach((d) => map.set(d.id, d));
        this.data.menuItems = Array.from(map.values());
      },
      (err) => console.error('[Firestore menuItems listener]', err)
    );
    onSnapshot(
      collection(db, 'tables'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as Table);
        const map = new Map<string, Table>();
        docs.forEach((d) => map.set(d.id, d));
        this.data.tables = Array.from(map.values());
      },
      (err) => console.error('[Firestore tables listener]', err)
    );
    onSnapshot(
      collection(db, 'orders'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as Order);
        const map = new Map<string, Order>();
        docs.forEach((d) => map.set(d.id, d));
        this.data.orders = Array.from(map.values());
      },
      (err) => console.error('[Firestore orders listener]', err)
    );
    onSnapshot(
      collection(db, 'tableCalls'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as TableCall);
        const map = new Map<string, TableCall>();
        docs.forEach((d) => map.set(d.id, d));
        this.tableCalls = Array.from(map.values());
      },
      (err) => console.error('[Firestore tableCalls listener]', err)
    );
    onSnapshot(
      collection(db, 'cashCloses'),
      (snap) => {
        const docs = snap.docs.map((d) => d.data() as CashClose);
        const map = new Map<string, CashClose>();
        docs.forEach((d) => map.set(d.id, d));
        this.cashCloses = Array.from(map.values());
      },
      (err) => console.error('[Firestore cashCloses listener]', err)
    );
  }

  // Writes initial demo data ONLY into collections that are currently empty. Safe to
  // run on every boot: it never touches a collection that already has documents.
  private async seedIfEmpty() {
    const seedCols = getSeedCollections();
    for (const { name, items } of seedCols) {
      const snap = await getDocs(query(collection(db, name), limit(1)));

      // An offline read is served from the local cache, which starts out empty — so
      // "empty" here would mean "we could not reach Firestore", not "there is no data".
      // Seeding on that would queue writes on fixed document ids that flush once the
      // connection returns, overwriting real data with demo data. When we cannot verify,
      // we do nothing: a missing seed is recoverable, an overwrite is not.
      if (snap.metadata.fromCache) {
        console.warn(
          `[Firestore] Skipping seed check for "${name}": read came from cache (offline). ` +
            'Cannot tell an empty collection from an unreachable backend.'
        );
        continue;
      }

      if (snap.empty) {
        console.log(`[Firestore] Seeding empty collection "${name}"...`);
        for (let i = 0; i < items.length; i += 400) {
          const batch = writeBatch(db);
          const chunk = items.slice(i, i + 400);
          for (const item of chunk) {
            batch.set(doc(db, name, item.id), forFirestore(item));
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
        const batch = writeBatch(db);
        const chunk = items.slice(i, i + 400);
        for (const item of chunk) {
          batch.set(doc(db, name, item.id), forFirestore(item));
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
    return this.data.tables.filter((t) => t.establishmentId === establishmentId);
  }

  public getOrders(establishmentId: string): Order[] {
    return this.data.orders.filter((o) => o.establishmentId === establishmentId);
  }

  public getOrder(orderId: string): Order | undefined {
    return this.data.orders.find((o) => o.id === orderId);
  }

  // Scoped diner lookup (F-4): only orders that belong to the given tenant AND table
  // AND whose id was explicitly presented by the caller. Never enumerates.
  public lookupOrders(establishmentId: string, tableId: string, orderIds: string[]): Order[] {
    const idSet = new Set(orderIds);
    return this.data.orders.filter(
      (o) => o.establishmentId === establishmentId && o.tableId === tableId && idSet.has(o.id)
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
      await setDoc(doc(db, 'orders', newOrder.id), forFirestore(newOrder));
    } catch (err) {
      console.error('[Firestore] Order save error:', err);
      return { ok: false, reason: 'storage_error' };
    }
    this.data.orders.push(newOrder);
    this.notifyClients('ORDER_CREATED', { establishmentId, order: newOrder });
    return { ok: true, order: newOrder };
  }

  // NOTE: this is a read-modify-write against the in-memory projection. If concurrent
  // edits to the same order become a concern, upgrade to a Firestore runTransaction /
  // targeted field update ($set of status/updatedAt) to avoid lost updates.
  public async updateOrderStatus(orderId: string, establishmentId: string, status: OrderStatus, cancellationReason?: string): Promise<Order | null> {
    const orderIndex = this.data.orders.findIndex(
      (o) => o.id === orderId && o.establishmentId === establishmentId
    );
    if (orderIndex === -1) return null;

    const current = this.data.orders[orderIndex];

    // Defense in depth: an order already counted in a cash close is frozen, otherwise
    // cancelling it afterwards would silently unbalance an issued receipt. The endpoint
    // checks this first and answers 409; this guard covers any other caller. (ADR-005)
    if (current.cashCloseId) return null;

    const now = new Date().toISOString();
    const updated: Order = {
      ...current,
      status,
      cancellationReason: cancellationReason || current.cancellationReason,
      updatedAt: now,
      // Stamped exactly once, on the first transition to delivered. Re-delivering must
      // not move the sale into a later period.
      deliveredAt:
        status === 'Entregado' && !current.deliveredAt ? now : current.deliveredAt,
    };

    try {
      await setDoc(doc(db, 'orders', updated.id), forFirestore(updated));
    } catch (e) {
      console.error('[Firestore] Order status write error:', e);
    }
    if (this.data.orders[orderIndex].updatedAt !== current.updatedAt) {
      console.warn('[Store] Concurrency warning: order', orderId, 'was modified by a concurrent request while this update was in flight.');
    }
    this.data.orders[orderIndex] = updated;
    this.notifyClients('ORDER_STATUS_CHANGED', { establishmentId: updated.establishmentId, order: updated });
    return updated;
  }

  // MenuItem CRUD
  public async saveMenuItem(item: MenuItem): Promise<MenuItem> {
    const index = this.data.menuItems.findIndex(
      (m) => m.id === item.id && m.establishmentId === item.establishmentId
    );
    if (index === -1) {
      const globalIndex = this.data.menuItems.findIndex((m) => m.id === item.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
    }

    try {
      await setDoc(doc(db, 'menuItems', item.id), forFirestore(item));
    } catch (e) {
      console.error('[Firestore] saveMenuItem error:', e);
    }
    if (index !== -1) {
      this.data.menuItems[index] = item;
    } else {
      this.data.menuItems.push(item);
    }
    this.notifyClients('MENU_CHANGED', { establishmentId: item.establishmentId });
    return item;
  }

  public async deleteMenuItem(itemId: string, establishmentId: string): Promise<boolean> {
    const index = this.data.menuItems.findIndex(
      (m) => m.id === itemId && m.establishmentId === establishmentId
    );
    if (index === -1) return false;

    try {
      await deleteDoc(doc(db, 'menuItems', itemId));
    } catch (e) {
      console.error('[Firestore] deleteMenuItem error:', e);
    }
    this.data.menuItems.splice(index, 1);
    this.notifyClients('MENU_CHANGED', { establishmentId });
    return true;
  }

  // Category CRUD
  public async saveCategory(category: Category): Promise<Category> {
    const index = this.data.categories.findIndex(
      (c) => c.id === category.id && c.establishmentId === category.establishmentId
    );
    if (index === -1) {
      const globalIndex = this.data.categories.findIndex((c) => c.id === category.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
    }

    try {
      await setDoc(doc(db, 'categories', category.id), forFirestore(category));
    } catch (e) {
      console.error('[Firestore] saveCategory error:', e);
    }
    if (index !== -1) {
      this.data.categories[index] = category;
    } else {
      this.data.categories.push(category);
    }
    this.notifyClients('MENU_CHANGED', { establishmentId: category.establishmentId });
    return category;
  }

  public async deleteCategory(categoryId: string, establishmentId: string): Promise<boolean> {
    const index = this.data.categories.findIndex(
      (c) => c.id === categoryId && c.establishmentId === establishmentId
    );
    if (index === -1) return false;

    // Cascade: delete the category and its menu items within the same tenant.
    const cascadingItems = this.data.menuItems.filter(
      (m) => m.categoryId === categoryId && m.establishmentId === establishmentId
    );

    try {
      const batch = writeBatch(db);
      batch.delete(doc(db, 'categories', categoryId));
      for (const m of cascadingItems) {
        batch.delete(doc(db, 'menuItems', m.id));
      }
      await batch.commit();
    } catch (e) {
      console.error('[Firestore] deleteCategory error:', e);
    }

    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(
      (m) => !(m.categoryId === categoryId && m.establishmentId === establishmentId)
    );
    this.notifyClients('MENU_CHANGED', { establishmentId });
    return true;
  }

  // Table CRUD
  public async saveTable(table: Table): Promise<Table> {
    const index = this.data.tables.findIndex(
      (t) => t.id === table.id && t.establishmentId === table.establishmentId
    );
    if (index === -1) {
      const globalIndex = this.data.tables.findIndex((t) => t.id === table.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
    }

    try {
      await setDoc(doc(db, 'tables', table.id), forFirestore(table));
    } catch (e) {
      console.error('[Firestore] saveTable error:', e);
    }
    if (index !== -1) {
      this.data.tables[index] = table;
    } else {
      this.data.tables.push(table);
    }
    this.notifyClients('TABLES_CHANGED', { establishmentId: table.establishmentId });
    return table;
  }

  public async deleteTable(tableId: string, establishmentId: string): Promise<boolean> {
    const index = this.data.tables.findIndex(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (index === -1) return false;

    try {
      await deleteDoc(doc(db, 'tables', tableId));
    } catch (e) {
      console.error('[Firestore] deleteTable error:', e);
    }
    this.data.tables.splice(index, 1);
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
        await setDoc(doc(db, 'tableCalls', updatedCall.id), forFirestore(updatedCall));
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
      await setDoc(doc(db, 'tableCalls', newCall.id), forFirestore(newCall));
    } catch (e) {
      console.error('[Firestore] createTableCall error:', e);
    }
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
        await setDoc(doc(db, 'tableCalls', call.id), forFirestore({ ...call, status }));
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

  // Close Table Session (Admin Action)
  public async closeTableSession(
    establishmentId: string,
    tableId: string
  ): Promise<{ ok: boolean; closedAt: string; ordersClosedCount: number }> {
    const closedAt = new Date().toISOString();
    const sessionKey = `${establishmentId}_${tableId}`;
    this.closedSessions.set(sessionKey, { closedAt, timestamp: Date.now() });

    // 1. Mark all active non-finalized orders for this table as 'Entregado' so they are archived as delivered sales
    let ordersClosedCount = 0;
    const activeTableOrders = this.data.orders.filter(
      (o) =>
        o.establishmentId === establishmentId &&
        o.tableId === tableId &&
        o.status !== 'Entregado' &&
        o.status !== 'Cancelado'
    );

    for (const order of activeTableOrders) {
      const result = await this.updateOrderStatus(order.id, establishmentId, 'Entregado');
      if (result !== null) ordersClosedCount++;
    }

    // 2. Mark pending calls for this table as 'attended'
    const pendingCalls = this.tableCalls.filter(
      (c) => c.establishmentId === establishmentId && c.tableId === tableId && c.status === 'pending'
    );
    for (const call of pendingCalls) {
      await this.updateTableCallStatus(call.id, establishmentId, 'attended');
    }

    this.notifyClients('TABLE_SESSION_CLOSED', { establishmentId, tableId, closedAt });
    return { ok: true, closedAt, ordersClosedCount };
  }

  public clearTableSession(establishmentId: string, tableId: string): void {
    const sessionKey = `${establishmentId}_${tableId}`;
    this.closedSessions.delete(sessionKey);
  }

  public getTableSessionStatus(establishmentId: string, tableId: string): { closedAt?: string } {
    this.purgeOldSessions();
    const sessionKey = `${establishmentId}_${tableId}`;
    const entry = this.closedSessions.get(sessionKey);
    return { closedAt: entry?.closedAt };
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

  // What the waiter sees before pressing the button. Same arithmetic as the close, but
  // writes nothing.
  public previewCashClose(establishmentId: string): CashClosePreview {
    const pending = this.pendingCashCloseOrders(establishmentId);
    return {
      periodStart: this.openPeriodStart(establishmentId, pending),
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

  private async runCashClose(
    establishmentId: string,
    actor: CashCloseActor,
    note?: string
  ): Promise<CashCloseResult> {
    const pending = this.pendingCashCloseOrders(establishmentId);
    // Refusing to record an empty close keeps the history meaningful and makes a
    // double-submit harmless.
    if (pending.length === 0) return { ok: false, reason: 'empty' };

    const now = new Date().toISOString();
    const close: CashClose = {
      id: 'close-' + randomUUID(),
      establishmentId,
      closedByEmail: actor.email,
      closedByName: actor.name,
      closedByRole: actor.role,
      periodStart: this.openPeriodStart(establishmentId, pending),
      periodEnd: now,
      totals: computeTotals(pending),
      orderIds: pending.map((o) => o.id),
      topProducts: computeTopProducts(pending),
      byTable: computeByTable(pending),
      note,
      createdAt: now,
    };

    // One atomic batch: either the close exists AND every order is stamped, or nothing
    // happened. A partial write here would double-count orders on the next close.
    // Firestore caps a batch at 500 operations, so chunk when a period is huge.
    const BATCH_LIMIT = 490;
    const chunks: Order[][] = [];
    for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
      chunks.push(pending.slice(i, i + BATCH_LIMIT));
    }

    for (let i = 0; i < chunks.length; i++) {
      const batch = writeBatch(db);
      // The close document goes in the first chunk so it lands together with the bulk
      // of the stamps.
      if (i === 0) batch.set(doc(db, 'cashCloses', close.id), forFirestore(close));
      for (const order of chunks[i]) {
        batch.set(doc(db, 'orders', order.id), forFirestore({ ...order, cashCloseId: close.id }));
      }
      await batch.commit();
    }

    // Memory after the write succeeded, mirroring the write-then-memory order used by
    // the rest of the store.
    this.cashCloses.push(close);
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
