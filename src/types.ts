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
  // Name the diner gave when starting the session. Optional: orders placed before the
  // welcome prompt existed do not carry one.
  dinerName?: string;
  items: OrderItem[];
  status: OrderStatus;
  cancellationReason?: string;
  createdAt: string;
  updatedAt: string;
  paymentStatus: 'pending' | 'paid' | null; // Placeholder for v1.1 roadmap
  // Set ONCE when the order transitions to 'Entregado'. Stable time anchor for revenue:
  // updatedAt moves on any edit, so it cannot be trusted to date a sale. Server-only.
  deliveredAt?: string;
  // Id of the cash close this order was counted in. Empty/undefined = still pending.
  // Membership is by stamp, not by time window, which is what guarantees an order is
  // never counted in two closes and never lost. Server-only. (ADR-005)
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

// A cash close is an immutable accounting record: a frozen snapshot of everything that
// was pending when it ran. Editing an order afterwards must not change an issued close.
export interface CashClose {
  id: string;
  establishmentId: string;
  closedByEmail: string;
  closedByName: string;
  closedByRole: UserRole;
  periodStart: string; // ISO UTC — descriptive only; selection is by cashCloseId stamp
  periodEnd: string; // ISO UTC — the instant the close ran
  totals: CashCloseTotals;
  orderIds: string[]; // audit trail: exactly which orders were counted
  topProducts: ProductLine[];
  byTable: TableLine[];
  note?: string;
  createdAt: string;
}

// Day-over-day comparison. null (not 0) when there is not enough history, so the UI can
// say "sin datos para comparar" instead of showing a misleading -100%.
export interface ComparisonPoint {
  revenue: number;
  pct: number | null; // null when the baseline is 0 (no meaningful percentage)
}

export interface MetricsComparison {
  vsYesterday: ComparisonPoint | null;
  vsWeekAvg: ComparisonPoint | null;
}

export interface MetricsSummary {
  day: string; // YYYY-MM-DD in venue local time
  from: string; // ISO UTC bound
  to: string; // ISO UTC bound
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
