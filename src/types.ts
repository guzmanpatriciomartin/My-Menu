export interface Establishment {
  id: string;
  name: string;
  description: string;
  accentColor: string;
  logoUrl?: string;
}

export interface Category {
  id: string;
  establishmentId: string;
  name: string;
  order: number;
}

export interface MenuItem {
  id: string;
  establishmentId: string;
  categoryId: string;
  name: string;
  description: string;
  price: number;
  imageUrl: string;
  available: boolean;
}

export interface Table {
  id: string;
  establishmentId: string;
  name: string;
  active: boolean;
  qrUrl?: string;
}

export interface OrderItem {
  id: string; // unique order item link
  menuItemId: string;
  name: string;
  price: number;
  quantity: number;
  comment?: string;
}

export type OrderStatus = 'Recibido' | 'En preparación' | 'Listo' | 'Entregado' | 'Cancelado';

export interface Order {
  id: string;
  establishmentId: string;
  tableId: string;
  tableName: string;
  // Name the diner gave when starting the session. Written by the store on every order
  // and displayed in both panels — optional only because older orders lack it.
  dinerName?: string;
  items: OrderItem[];
  status: OrderStatus;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: 'pending' | 'paid' | null; // Placeholder for v1.1 roadmap
}

// Waiter call / bill request raised from a table. Used by the store, the API layer and
// both panels.
export interface TableCall {
  id: string;
  establishmentId: string;
  tableId: string;
  tableName: string;
  dinerName?: string;
  type: 'waiter_call' | 'bill_request';
  status: 'pending' | 'attended';
  createdAt: string;
}

export type UserRole = 'admin' | 'waiter';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  establishmentId: string; // Managed venue
}
