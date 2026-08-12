import { doc, setDoc, deleteDoc, onSnapshot, collection, getDocs } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { initialEstablishments, initialCategories, initialMenuItems, initialTables } from '../db/seedData';
import { Establishment, Category, MenuItem, Table, Order, OrderStatus } from '../types';

interface DbSchema {
  establishments: Establishment[];
  categories: Category[];
  menuItems: MenuItem[];
  tables: Table[];
  orders: Order[];
}

const initialOrders: Order[] = [
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
    createdAt: new Date(Date.now() - 12 * 60 * 1000).toISOString(),
    updatedAt: new Date(Date.now() - 4 * 60 * 1000).toISOString(),
    paymentStatus: null,
  }
];

class Store {
  private data: DbSchema = {
    establishments: initialEstablishments,
    categories: initialCategories,
    menuItems: initialMenuItems,
    tables: initialTables,
    orders: initialOrders,
  };

  private sseClients: any[] = [];
  private initialized = false;

  constructor() {
    this.initFirebaseSync();
  }

  public async seedAllDemoData() {
    try {
      console.log('[Firestore] Seeding all demo data for cafeteria and bodegon...');
      
      // Seed Establishments
      for (const item of initialEstablishments) {
        await setDoc(doc(db, 'establishments', item.id), item);
      }
      this.data.establishments = [...initialEstablishments];

      // Seed Categories
      for (const item of initialCategories) {
        await setDoc(doc(db, 'categories', item.id), item);
      }
      this.data.categories = [...initialCategories];

      // Seed MenuItems
      for (const item of initialMenuItems) {
        await setDoc(doc(db, 'menuItems', item.id), item);
      }
      this.data.menuItems = [...initialMenuItems];

      // Seed Tables
      for (const item of initialTables) {
        await setDoc(doc(db, 'tables', item.id), item);
      }
      this.data.tables = [...initialTables];

      // Seed Orders
      for (const item of initialOrders) {
        await setDoc(doc(db, 'orders', item.id), item);
      }
      this.data.orders = [...initialOrders];

      this.notifyClients('MENU_CHANGED', {});
      this.notifyClients('TABLES_CHANGED', {});
      this.notifyClients('ORDER_STATUS_CHANGED', {});

      console.log('[Firestore] All demo data successfully seeded!');
      return true;
    } catch (err) {
      console.error('[Firestore Seed Error]:', err);
      throw err;
    }
  }

  private async initFirebaseSync() {
    try {
      // 1. Establishments Sync
      onSnapshot(collection(db, 'establishments'), async (snapshot) => {
        if (snapshot.empty && !this.initialized) {
          console.log('[Firestore] Seeding initial establishments...');
          this.seedAllDemoData().catch(e => console.error('Seed error:', e));
        } else {
          this.data.establishments = snapshot.docs.map((d) => d.data() as Establishment);
        }
      });

      // 2. Categories Sync
      onSnapshot(collection(db, 'categories'), async (snapshot) => {
        if (snapshot.empty && !this.initialized) {
          console.log('[Firestore] Seeding initial categories...');
          for (const item of initialCategories) {
            await setDoc(doc(db, 'categories', item.id), item);
          }
        } else {
          this.data.categories = snapshot.docs.map((d) => d.data() as Category);
          this.notifyClients('MENU_CHANGED', {});
        }
      });

      // 3. MenuItems Sync
      onSnapshot(collection(db, 'menuItems'), async (snapshot) => {
        if (snapshot.empty && !this.initialized) {
          console.log('[Firestore] Seeding initial menuItems...');
          for (const item of initialMenuItems) {
            await setDoc(doc(db, 'menuItems', item.id), item);
          }
        } else {
          this.data.menuItems = snapshot.docs.map((d) => d.data() as MenuItem);
          this.notifyClients('MENU_CHANGED', {});
        }
      });

      // 4. Tables Sync
      onSnapshot(collection(db, 'tables'), async (snapshot) => {
        if (snapshot.empty && !this.initialized) {
          console.log('[Firestore] Seeding initial tables...');
          for (const item of initialTables) {
            await setDoc(doc(db, 'tables', item.id), item);
          }
        } else {
          this.data.tables = snapshot.docs.map((d) => d.data() as Table);
          this.notifyClients('TABLES_CHANGED', {});
        }
      });

      // 5. Orders Sync
      onSnapshot(collection(db, 'orders'), async (snapshot) => {
        if (snapshot.empty && !this.initialized) {
          console.log('[Firestore] Seeding initial orders...');
          for (const item of initialOrders) {
            await setDoc(doc(db, 'orders', item.id), item);
          }
        } else {
          this.data.orders = snapshot.docs.map((d) => d.data() as Order);
          this.notifyClients('ORDER_STATUS_CHANGED', {});
        }
      });

      this.initialized = true;
      console.log('[Firestore] Synchronized with Cloud Firestore database.');
    } catch (err) {
      console.error('[Firestore Sync Error]:', err);
    }
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

  // Order Mutations
  public createOrder(orderData: Omit<Order, 'id' | 'createdAt' | 'updatedAt' | 'paymentStatus'>): Order {
    const newOrder: Order = {
      ...orderData,
      id: 'ord-' + Math.random().toString(36).substring(2, 9),
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      paymentStatus: null,
    };
    
    // Update memory
    this.data.orders.push(newOrder);
    
    // Persist to Cloud Firestore asynchronously
    setDoc(doc(db, 'orders', newOrder.id), newOrder).catch((err) => {
      console.error('Error saving order to Firestore:', err);
    });

    this.notifyClients('ORDER_CREATED', { establishmentId: newOrder.establishmentId, order: newOrder });
    return newOrder;
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

    // Persist to Cloud Firestore
    setDoc(doc(db, 'orders', updated.id), updated).catch((err) => {
      console.error('Error updating order status in Firestore:', err);
    });

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

    setDoc(doc(db, 'menuItems', item.id), item).catch((err) => {
      console.error('Error saving menuItem in Firestore:', err);
    });

    this.notifyClients('MENU_CHANGED', { establishmentId: item.establishmentId });
    return item;
  }

  public deleteMenuItem(itemId: string, establishmentId: string): boolean {
    const index = this.data.menuItems.findIndex(
      (m) => m.id === itemId && m.establishmentId === establishmentId
    );
    if (index === -1) return false;
    this.data.menuItems.splice(index, 1);

    deleteDoc(doc(db, 'menuItems', itemId)).catch((err) => {
      console.error('Error deleting menuItem in Firestore:', err);
    });

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

    setDoc(doc(db, 'categories', category.id), category).catch((err) => {
      console.error('Error saving category in Firestore:', err);
    });

    this.notifyClients('MENU_CHANGED', { establishmentId: category.establishmentId });
    return category;
  }

  public deleteCategory(categoryId: string, establishmentId: string): boolean {
    const index = this.data.categories.findIndex(
      (c) => c.id === categoryId && c.establishmentId === establishmentId
    );
    if (index === -1) return false;

    const cascadingItems = this.data.menuItems.filter(
      (m) => m.categoryId === categoryId && m.establishmentId === establishmentId
    );

    this.data.categories.splice(index, 1);
    this.data.menuItems = this.data.menuItems.filter(
      (m) => !(m.categoryId === categoryId && m.establishmentId === establishmentId)
    );

    deleteDoc(doc(db, 'categories', categoryId)).catch((err) => {
      console.error('Error deleting category in Firestore:', err);
    });

    cascadingItems.forEach((m) => {
      deleteDoc(doc(db, 'menuItems', m.id)).catch((err) => {
        console.error('Error deleting cascading menuItem in Firestore:', err);
      });
    });

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

    setDoc(doc(db, 'tables', table.id), table).catch((err) => {
      console.error('Error saving table in Firestore:', err);
    });

    this.notifyClients('TABLES_CHANGED', { establishmentId: table.establishmentId });
    return table;
  }

  public deleteTable(tableId: string, establishmentId: string): boolean {
    const index = this.data.tables.findIndex(
      (t) => t.id === tableId && t.establishmentId === establishmentId
    );
    if (index === -1) return false;
    this.data.tables.splice(index, 1);

    deleteDoc(doc(db, 'tables', tableId)).catch((err) => {
      console.error('Error deleting table in Firestore:', err);
    });

    this.notifyClients('TABLES_CHANGED', { establishmentId });
    return true;
  }

  // SSE Subscription handlers
  public addSseClient(res: any) {
    this.sseClients.push(res);
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
