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
  dinerName?: string;
  items: OrderItem[];
  status: OrderStatus;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: 'pending' | 'paid' | null; // Placeholder for v1.1 roadmap
  deliveredAt?: string;
  cashCloseId?: string | null;
}

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

// --- Cash close & metrics (ADR-005) ---

export interface CashCloseTotals {
  orderCount: number;
  totalRevenue: number;
  averageTicket: number; // 0 when orderCount === 0
}

export interface ProductLine {
  menuItemId: string;
  name: string;
  units: number;
  revenue: number;
}

export interface TableLine {
  tableId: string;
  tableName: string;
  orderCount: number;
  revenue: number;
}

export interface HourLine {
  hour: number; // 0-23, in the venue's local time (America/Argentina/Buenos_Aires)
  orderCount: number;
  revenue: number;
}

export interface CashClose {
  id: string;
  establishmentId: string;
  closedByEmail: string;
  closedByName: string;
  closedByRole: UserRole;
  periodStart: string;
  periodEnd: string;
  totals: CashCloseTotals;
  orderIds: string[];
  topProducts: ProductLine[];
  byTable: TableLine[];
  note?: string;
  createdAt: string;
}

export interface ComparisonPoint {
  revenue: number;
  pct: number | null;
}

export interface MetricsComparison {
  vsYesterday: ComparisonPoint | null;
  vsWeekAvg: ComparisonPoint | null;
}

export interface MetricsSummary {
  day: string;
  from: string;
  to: string;
  totals: CashCloseTotals;
  topProducts: ProductLine[];
  byHour: HourLine[];
  byTable: TableLine[];
  comparison: MetricsComparison;
}

export type UserRole = 'admin' | 'waiter';

export interface UserSession {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  establishmentId: string; // Managed venue
}
