import fs from 'fs';
import path from 'path';
import { initialEstablishments, initialCategories, initialMenuItems, initialTables } from '../db/seedData';
import { Establishment, Category, MenuItem, Table, Order, OrderItem, OrderStatus } from '../types';

const DB_FILE = path.join(process.cwd(), 'db_temp.json');
const DB_TMP_FILE = DB_FILE + '.tmp';

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

// A connected SSE subscriber, tagged with its delivery scope (ALTO-3).
//  - 'admin': receives every event of its own tenant.
//  - 'diner': receives only MENU_CHANGED and status changes for its own table.
interface SseClient {
  res: SseSink;
  scope: 'admin' | 'diner';
  establishmentId: string;
  tableId?: string;
}

// What the diner actually sends to create an order. name/price are NEVER trusted
// from the client — they are recomputed server-side from the catalog (ALTO-2).
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

class Store {
  // this.data is the single source of truth in memory (MED-5). It is loaded from
  // disk ONCE at startup; every read/mutation works against memory, and persist()
  // flushes asynchronously and atomically.
  private data: DbSchema = {
    establishments: [],
    categories: [],
    menuItems: [],
    tables: [],
    orders: [],
  };

  private sseClients: SseClient[] = [];

  // Serialises disk writes into a single in-flight promise chain (MED-5 write-queue).
  private persistQueue: Promise<void> = Promise.resolve();

  constructor() {
    this.load();
  }

  // Load from disk ONCE, or seed the file if it does not exist yet. Synchronous on
  // purpose: it runs a single time at boot before the server accepts connections.
  private load() {
    try {
      if (fs.existsSync(DB_FILE)) {
        const fileContent = fs.readFileSync(DB_FILE, 'utf-8');
        this.data = JSON.parse(fileContent);
        // Ensure no missing keys
        if (!this.data.establishments) this.data.establishments = initialEstablishments;
        if (!this.data.categories) this.data.categories = initialCategories;
        if (!this.data.menuItems) this.data.menuItems = initialMenuItems;
        if (!this.data.tables) this.data.tables = initialTables;
        if (!this.data.orders) this.data.orders = [];
      } else {
        this.data = {
          establishments: initialEstablishments,
          categories: initialCategories,
          menuItems: initialMenuItems,
          tables: initialTables,
          orders: [
            // Let's pre-load some realistic orders to make page rich on load
            {
              id: 'ord-pre-1',
              establishmentId: 'bodegon-palermo',
              tableId: 'tab-pal-1',
              tableName: 'Mesa 1',
              items: [
                {
                  id: 'oi-1',
                  menuItemId: 'item-palermo-empanada',
                  name: 'Empanada de Carne Cortada a Cuchillo',
                  price: 1300,
                  quantity: 3,
                  comment: 'Bien jugosas, por favor!'
                },
                {
                  id: 'oi-2',
                  menuItemId: 'item-palermo-mila-napo',
                  name: 'Milanesa de Ternera a la Napolitana',
                  price: 9800,
                  quantity: 1,
                  comment: 'Para compartir entre dos.'
                }
              ],
              status: 'Recibido',
              createdAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(), // 15 mins ago
              updatedAt: new Date(Date.now() - 15 * 60 * 1000).toISOString(),
              paymentStatus: null,
            },
            {
              id: 'ord-pre-2',
              establishmentId: 'bodegon-palermo',
              tableId: 'tab-pal-3',
              tableName: 'Mesa 3',
              items: [
                {
                  id: 'oi-3',
                  menuItemId: 'item-palermo-provoleta',
                  name: 'Provoleta Clásica al Hierro',
                  price: 4500,
                  quantity: 1,
                  comment: 'Bien doradita'
                },
                {
                  id: 'oi-4',
                  menuItemId: 'item-palermo-ipa',
                  name: 'Cerveza Tirada IPA (Pinta)',
                  price: 2500,
                  quantity: 2
                }
              ],
              status: 'En preparación',
              createdAt: new Date(Date.now() - 32 * 60 * 1000).toISOString(), // 32 mins ago
              updatedAt: new Date(Date.now() - 25 * 60 * 1000).toISOString(),
              paymentStatus: null,
            },
            {
              id: 'ord-pre-3',
              establishmentId: 'cafe-speakeasy',
              tableId: 'tab-caf-1',
              tableName: 'Mesa A1',
              items: [
                {
                  id: 'oi-5',
                  menuItemId: 'item-cafe-flatwhite',
                  name: 'Avocado Flat White',
                  price: 2100,
                  quantity: 1
                },
                {
                  id: 'oi-6',
                  menuItemId: 'item-cafe-croissant',
                  name: 'Croissant Hojaldrado de Pistachos',
                  price: 2500,
                  quantity: 1,
                  comment: 'Calentar 30 segundos'
                }
              ],
              status: 'Listo',
              createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(), // 12 mins ago
              updatedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
              paymentStatus: null,
            }
          ],
        };
        this.persist();
      }
    } catch (e) {
      console.error('Error loading local data:', e);
    }
  }

  // Atomic, non-blocking persistence (MED-5).
  // - The snapshot is serialised SYNCHRONOUSLY at call time, so it reflects the exact
  //   in-memory state of this mutation (mutations are sync and atomic under Node's
  //   single-threaded model).
  // - Writes are chained through persistQueue so they never overlap and never block
  //   the event loop; each write goes to a .tmp file and is fs.rename()d into place
  //   (rename is atomic on POSIX/NTFS), so readers never see a half-written file.
  //
  // MIGRATION NOTE: under MongoDB this becomes atomic document ops
  // (findOneAndUpdate/$set/$push) and this whole file-queue disappears.
  // WARNING: switching to async fs writes WITHOUT this write-queue would reintroduce
  // lost-updates (two overlapping writers racing on the same file).
  private persist(): void {
    const snapshot = JSON.stringify(this.data, null, 2);
    this.persistQueue = this.persistQueue.then(async () => {
      try {
        await fs.promises.writeFile(DB_TMP_FILE, snapshot, 'utf-8');
        await fs.promises.rename(DB_TMP_FILE, DB_FILE);
      } catch (e) {
        console.error('Error persisting data file:', e);
      }
    });
  }

  // Getters
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

  // Scoped diner lookup (ALTO-1): only orders that belong to the given tenant AND
  // table AND whose id was explicitly presented by the caller. Never enumerates.
  public lookupOrders(establishmentId: string, tableId: string, orderIds: string[]): Order[] {
    const idSet = new Set(orderIds);
    return this.data.orders.filter(
      (o) => o.establishmentId === establishmentId && o.tableId === tableId && idSet.has(o.id)
    );
  }

  // Order Mutations
  // Prices and names are recomputed from the catalog; the client's name/price are
  // ignored entirely (ALTO-2). If ANY requested item is missing/foreign/unavailable,
  // the WHOLE order is rejected atomically.
  public createOrder(input: CreateOrderInput): CreateOrderResult {
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

    this.data.orders.push(newOrder);
    this.persist();
    this.notifyClients('ORDER_CREATED', { establishmentId, order: newOrder });
    return { ok: true, order: newOrder };
  }

  public updateOrderStatus(orderId: string, establishmentId: string, status: OrderStatus, cancellationReason?: string): Order | null {
    const orderIndex = this.data.orders.findIndex(
      (o) => o.id === orderId && o.establishmentId === establishmentId
    );
    if (orderIndex === -1) return null;

    const updated = {
      ...this.data.orders[orderIndex],
      status,
      cancellationReason: cancellationReason || this.data.orders[orderIndex].cancellationReason,
      updatedAt: new Date().toISOString(),
    };

    this.data.orders[orderIndex] = updated;
    this.persist();
    this.notifyClients('ORDER_STATUS_CHANGED', { establishmentId: updated.establishmentId, order: updated });
    return updated;
  }

  // MenuItem CRUD
  public saveMenuItem(item: MenuItem): MenuItem {
    const index = this.data.menuItems.findIndex(
      (m) => m.id === item.id && m.establishmentId === item.establishmentId
    );
    if (index !== -1) {
      this.data.menuItems[index] = item;
    } else {
      const globalIndex = this.data.menuItems.findIndex((m) => m.id === item.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
      this.data.menuItems.push(item);
    }
    this.persist();
    this.notifyClients('MENU_CHANGED', { establishmentId: item.establishmentId });
    return item;
  }

  public deleteMenuItem(itemId: string, establishmentId: string): boolean {
    const index = this.data.menuItems.findIndex(
      (m) => m.id === itemId && m.establishmentId === establishmentId
    );
    if (index === -1) return false;
    this.data.menuItems.splice(index, 1);
    this.persist();
    this.notifyClients('MENU_CHANGED', { establishmentId });
    return true;
  }

  // Category CRUD
  public saveCategory(category: Category): Category {
    const index = this.data.categories.findIndex(
      (c) => c.id === category.id && c.establishmentId === category.establishmentId
    );
    if (index !== -1) {
      this.data.categories[index] = category;
    } else {
      const globalIndex = this.data.categories.findIndex((c) => c.id === category.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
      this.data.categories.push(category);
    }
    this.persist();
    this.notifyClients('MENU_CHANGED', { establishmentId: category.establishmentId });
    return category;
  }

  public deleteCategory(categoryId: string, establishmentId: string): boolean {
    const index = this.data.categories.findIndex(
      (c) => c.id === categoryId && c.establishmentId === establishmentId
    );
    if (index === -1) return false;

    // Remove cascading items or update their category to none, but let's delete them to keep it clean.
    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(
      (m) => !(m.categoryId === categoryId && m.establishmentId === establishmentId)
    );

    this.persist();
    this.notifyClients('MENU_CHANGED', { establishmentId });
    return true;
  }

  // Table CRUD
  public saveTable(table: Table): Table {
    const index = this.data.tables.findIndex(
      (t) => t.id === table.id && t.establishmentId === table.establishmentId
    );
    if (index !== -1) {
      this.data.tables[index] = table;
    } else {
      const globalIndex = this.data.tables.findIndex((t) => t.id === table.id);
      if (globalIndex !== -1) {
        throw new Error('ID already in use by another establishment');
      }
      this.data.tables.push(table);
    }
    this.persist();
    this.notifyClients('TABLES_CHANGED', { establishmentId: table.establishmentId });
    return table;
  }

  public deleteTable(tableId: string, establishmentId: string): boolean {
    const index = this.data.tables.findIndex(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (index === -1) return false;
    this.data.tables.splice(index, 1);
    this.persist();
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

  // Per-client tenant/table segmentation (ALTO-3). A diner NEVER receives
  // ORDER_CREATED, TABLES_CHANGED, or any order from a different table.
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
