import fs from 'fs';
import path from 'path';
import { initialEstablishments, initialCategories, initialMenuItems, initialTables } from '../db/seedData';
import { Establishment, Category, MenuItem, Table, Order, OrderStatus } from '../types';

const DB_FILE = path.join(process.cwd(), 'db_temp.json');

interface DbSchema {
  establishments: Establishment[];
  categories: Category[];
  menuItems: MenuItem[];
  tables: Table[];
  orders: Order[];
}

class Store {
  private data: DbSchema = {
    establishments: [],
    categories: [],
    menuItems: [],
    tables: [],
    orders: [],
  };

  private sseClients: any[] = [];

  constructor() {
    this.refreshLocalData();
  }

  // Read or seed
  private refreshLocalData() {
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
      console.error('Error refreshing local data:', e);
    }
  }

  private persist() {
    try {
      fs.writeFileSync(DB_FILE, JSON.stringify(this.data, null, 2), 'utf-8');
    } catch (e) {
      console.error('Error persisting data file:', e);
    }
  }

  // Getters
  public getEstablishments(): Establishment[] {
    this.refreshLocalData();
    return this.data.establishments;
  }

  public getCategories(establishmentId: string): Category[] {
    this.refreshLocalData();
    return this.data.categories
      .filter((c) => c.establishmentId === establishmentId)
      .sort((a, b) => a.order - b.order);
  }

  public getMenuItems(establishmentId: string): MenuItem[] {
    this.refreshLocalData();
    return this.data.menuItems.filter((m) => m.establishmentId === establishmentId);
  }

  public getTables(establishmentId: string): Table[] {
    this.refreshLocalData();
    return this.data.tables.filter((t) => t.establishmentId === establishmentId);
  }

  public getOrders(establishmentId: string): Order[] {
    this.refreshLocalData();
    return this.data.orders.filter((o) => o.establishmentId === establishmentId);
  }

  public getOrder(orderId: string): Order | undefined {
    this.refreshLocalData();
    return this.data.orders.find((o) => o.id === orderId);
  }

  // Order Mutations
  public createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'paymentStatus'>): Order {
    this.refreshLocalData();
    const newOrder: Order = {
      ...orderData,
      id: 'ord-' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentStatus: null,
    };
    this.data.orders.push(newOrder);
    this.persist();
    this.notifyClients('ORDER_CREATED', { establishmentId: newOrder.establishmentId, order: newOrder });
    return newOrder;
  }

  public updateOrderStatus(orderId: string, establishmentId: string, status: OrderStatus, cancellationReason?: string): Order | null {
    this.refreshLocalData();
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
    this.refreshLocalData();
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
    this.refreshLocalData();
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
    this.refreshLocalData();
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
    this.refreshLocalData();
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
    this.refreshLocalData();
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
    this.refreshLocalData();
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
  public addSseClient(res: any) {
    this.sseClients.push(res);
    // Send initial join message
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED' })}\n\n`);
  }

  public removeSseClient(res: any) {
    this.sseClients = this.sseClients.filter((c) => c !== res);
  }

  private notifyClients(type: string, payload: any) {
    const data = JSON.stringify({ type, payload });
    this.sseClients.forEach((client) => {
      try {
        client.write(`data: ${data}\n\n`);
      } catch (err) {
        // Stale client
      }
    });
  }
}

export const store = new Store();
