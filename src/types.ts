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
  items: OrderItem[];
  status: OrderStatus;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: 'pending' | 'paid' | null; // Placeholder for v1.1 roadmap
}

export type UserRole = 'admin' | 'waiter';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  establishmentId: string; // Managed venue
}
