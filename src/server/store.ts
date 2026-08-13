import { db } from '../lib/firebase-admin';
import { initialEstablishments, initialCategories, initialMenuItems, initialTables } from '../db/seedData';
import { Establishment, Category, MenuItem, Table, Order, OrderItem, OrderStatus } from '../types';

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
  items: OrderDraftItem[];
}

// Result of a create attempt. A single shape (rather than a discriminated union)
// because this project compiles with strictNullChecks OFF, where boolean-discriminant
// narrowing is unreliable. The endpoint maps each outcome to a status code:
// ok -> 201, reason 'invalid_table' -> 400, reason 'unavailable_items' -> 409.
export interface CreateOrderResult {
  ok: boolean;
  order?: Order;
  reason?: 'invalid_table' | 'unavailable_items';
  unavailableItems?: string[];
}

type NotifyType = 'ORDER_CREATED' | 'ORDER_STATUS_CHANGED' | 'MENU_CHANGED' | 'TABLES_CHANGED';

interface NotifyPayload {
  establishmentId: string;
  order?: Order;
}

const initialOrders: Order[] = [
  {
    id: 'ord-pre-1',
    establishmentId: 'bodegon-palermo',
    tableId: 'tab-pal-1',
    tableName: 'Mesa 1',
    items: [
      { id: 'oi-1', menuItemId: 'item-palermo-empanada', name: 'Empanada de Carne Cortada a Cuchillo', price: 1300, quantity: 3, comment: 'Bien jugosas, por favor!' },
      { id: 'oi-2', menuItemId: 'item-palermo-mila-napo', name: 'Milanesa de Ternera a la Napolitana', price: 9800, quantity: 1, comment: 'Para compartir entre dos.' },
    ],
    status: 'Recibido',
    createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
    paymentStatus: null,
  },
  {
    id: 'ord-pre-2',
    establishmentId: 'bodegon-palermo',
    tableId: 'tab-pal-3',
    tableName: 'Mesa 3',
    items: [
      { id: 'oi-3', menuItemId: 'item-palermo-provoleta', name: 'Provoleta Clásica al Hierro', price: 4500, quantity: 1, comment: 'Bien doradita' },
      { id: 'oi-4', menuItemId: 'item-palermo-ipa', name: 'Cerveza Tirada IPA (Pinta)', price: 2500, quantity: 2 },
    ],
    status: 'En preparación',
    createdAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
    paymentStatus: null,
  },
  {
    id: 'ord-pre-3',
    establishmentId: 'cafe-speakeasy',
    tableId: 'tab-caf-1',
    tableName: 'Mesa A1',
    items: [
      { id: 'oi-5', menuItemId: 'item-cafe-flatwhite', name: 'Avocado Flat White', price: 2100, quantity: 1 },
      { id: 'oi-6', menuItemId: 'item-cafe-croissant', name: 'Croissant Hojaldrado de Pistachos', price: 2500, quantity: 1, comment: 'Calentar 30 segundos' },
    ],
    status: 'Listo',
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    paymentStatus: null,
  },
];

const SEED_COLLECTIONS: Array<{ name: string; items: Array<{ id: string }> }> = [
  { name: 'establishments', items: initialEstablishments },
  { name: 'categories', items: initialCategories },
  { name: 'menuItems', items: initialMenuItems },
  { name: 'tables', items: initialTables },
  { name: 'orders', items: initialOrders },
];

class Store {
  // In-memory projection of Firestore. Reads (getters) are served synchronously from
  // here; it is kept current by the onSnapshot listeners below. Seeded with the demo
  // data so the API still responds before the first snapshot arrives.
  private data: DbSchema = {
    establishments: initialEstablishments,
    categories: initialCategories,
    menuItems: initialMenuItems,
    tables: initialTables,
    orders: initialOrders,
  };

  private sseClients: SseClient[] = [];

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
    db.collection('establishments').onSnapshot(
      (snap) => { this.data.establishments = snap.docs.map((d) => d.data() as Establishment); },
      (err) => console.error('[Firestore establishments listener]', err)
    );
    db.collection('categories').onSnapshot(
      (snap) => { this.data.categories = snap.docs.map((d) => d.data() as Category); },
      (err) => console.error('[Firestore categories listener]', err)
    );
    db.collection('menuItems').onSnapshot(
      (snap) => { this.data.menuItems = snap.docs.map((d) => d.data() as MenuItem); },
      (err) => console.error('[Firestore menuItems listener]', err)
    );
    db.collection('tables').onSnapshot(
      (snap) => { this.data.tables = snap.docs.map((d) => d.data() as Table); },
      (err) => console.error('[Firestore tables listener]', err)
    );
    db.collection('orders').onSnapshot(
      (snap) => { this.data.orders = snap.docs.map((d) => d.data() as Order); },
      (err) => console.error('[Firestore orders listener]', err)
    );
  }

  // Writes initial demo data ONLY into collections that are currently empty. Safe to
  // run on every boot: it never touches a collection that already has documents.
  private async seedIfEmpty() {
    for (const { name, items } of SEED_COLLECTIONS) {
      const snap = await db.collection(name).limit(1).get();
      if (snap.empty) {
        console.log(`[Firestore] Seeding empty collection "${name}"...`);
        const batch = db.batch();
        for (const item of items) {
          batch.set(db.collection(name).doc(item.id), item as Record<string, unknown>);
        }
        await batch.commit();
      }
    }
  }

  // Force (re)seed of all demo data — overwrites existing docs. Exposed ONLY through the
  // admin-guarded, env-gated POST /api/seed endpoint (F-9). Does not emit SSE events;
  // clients pick up the refreshed data via their normal polling.
  public async seedAllDemoData(): Promise<boolean> {
    console.log('[Firestore] Force-seeding all demo data...');
    for (const { name, items } of SEED_COLLECTIONS) {
      const batch = db.batch();
      for (const item of items) {
        batch.set(db.collection(name).doc(item.id), item as Record<string, unknown>);
      }
      await batch.commit();
    }
    this.data = {
      establishments: [...initialEstablishments],
      categories: [...initialCategories],
      menuItems: [...initialMenuItems],
      tables: [...initialTables],
      orders: [...initialOrders],
    };
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
      if (!menuItem || !menuItem.available) {
        unavailableItems.push(draft.menuItemId);
        continue;
      }

      // Client-supplied quantity is clamped to a sane positive integer (cap 99);
      // comment is truncated to 200 chars. Name/price come from the catalog.
      const quantity = Math.min(Math.max(Math.floor(draft.quantity), 1), 99);
      const comment = draft.comment ? draft.comment.slice(0, 200) : undefined;

      resolvedItems.push({
        id: 'orditem-' + Math.random().toString(36).substring(2, 9),
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
      id: 'ord-' + Math.random().toString(36).substring(2, 9),
      establishmentId,
      tableId,
      tableName: table.name, // derived server-side, never trusted from the client
      items: resolvedItems,
      status: 'Recibido', // server-authoritative initial status
      createdAt: now,
      updatedAt: now,
      paymentStatus: null,
    };

    await db.collection('orders').doc(newOrder.id).set(newOrder);
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

    const updated: Order = {
      ...this.data.orders[orderIndex],
      status,
      cancellationReason: cancellationReason || this.data.orders[orderIndex].cancellationReason,
      updatedAt: new Date().toISOString(),
    };

    await db.collection('orders').doc(updated.id).set(updated);
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

    await db.collection('menuItems').doc(item.id).set(item);
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

    await db.collection('menuItems').doc(itemId).delete();
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

    await db.collection('categories').doc(category.id).set(category);
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

    const batch = db.batch();
    batch.delete(db.collection('categories').doc(categoryId));
    for (const m of cascadingItems) {
      batch.delete(db.collection('menuItems').doc(m.id));
    }
    await batch.commit();

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

    await db.collection('tables').doc(table.id).set(table);
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

    await db.collection('tables').doc(tableId).delete();
    this.data.tables.splice(index, 1);
    this.notifyClients('TABLES_CHANGED', { establishmentId });
    return true;
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
        // Stale client
      }
    });
  }
}

export const store = new Store();
