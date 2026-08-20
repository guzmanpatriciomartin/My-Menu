// The venue's visual identity. It lives on the establishment (not in the browser) because the
// diner who scans the QR has to see the local's style, and because a single global localStorage
// key leaked one tenant's style into every other tenant open in the same browser.
// Typed as plain strings on purpose: this interface crosses the wire and is shared with the
// server, so an unknown value must be sanitized at render time, not crash a type assertion.
// Valid values, defined in src/theme/themeConfig.ts:
//   templateId: 'speakeasy-dark' | 'bistro-light' | 'cyber-neon' | 'emerald-gourmet' | 'minimal-slate' | 'sunset-bakery'
//   mode: 'dark' | 'light'   (no 'system': the venue commits to one concrete identity)
//   primaryColor: 'amber' | 'orange' | 'emerald' | 'cyan' | 'blue' | 'indigo' | 'purple' | 'rose' | 'red' | 'zinc'
//   radius: 'sharp' | 'soft' | 'curved' | 'ultra'
//   borderStyle: 'subtle' | 'glass' | 'bold' | 'glow'
//   blur: 'none' | 'subtle' | 'glass' | 'deep'
// null on the last four means "inherit the template's own value".
// Those four are marked optional only to match what zod infers for `.nullable()` under this
// project's non-strict tsconfig; the schema itself requires the keys to be present, so a parsed
// payload never carries a nested undefined into Firestore.
export interface EstablishmentTheme {
  templateId: string;
  mode: 'dark' | 'light';
  primaryColor?: string | null;
  radius?: string | null;
  borderStyle?: string | null;
  blur?: string | null;
}

export interface Establishment {
  id: string;
  name: string;
  slug: string;
  description: string;
  accentColor: string;
  logoUrl?: string | null;
  openingHours?: string;
  contactPhone?: string;
  kitchenToken?: string | null;
  theme?: EstablishmentTheme | null;
}

export interface User {
  id: string; // Firebase UID
  establishmentId: string;
  email: string;
  role: 'admin' | 'waiter';
  name: string;
  active: boolean;
  createdAt: number;
}

export interface Plan {
  id: 'free' | 'pro';
  name: string;
  maxTables: number;    // -1 = sin límite
  maxMenuItems: number;
  maxUsers: number;
  priceARS: number;
}

export interface Subscription {
  id: string;
  establishmentId: string;
  planId: 'free' | 'pro';
  status: 'trialing' | 'active' | 'suspended';
  currentPeriodEnd: number;
  activatedManually: boolean;
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
  sessionToken?: string;
  capacity?: number;
  qrUrl?: string;
  isOccupied?: boolean;
  activeOrdersCount?: number;
  lastClosedAt?: string;
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
  paymentStatus: 'pending' | 'paid' | 'waived' | null;
  paymentMethod?: 'cash' | 'card' | 'transfer' | null;
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

export interface CashRegisterSession {
  id: string; // establishmentId
  establishmentId: string;
  isOpen: boolean;
  openedAt?: string;
  openedByEmail?: string;
  openedByName?: string;
  initialAmount?: number;
  openNote?: string;
  closedAt?: string;
}

export interface CashClosePreview {
  isOpen: boolean;
  openedAt?: string;
  openedByEmail?: string;
  openedByName?: string;
  initialAmount?: number;
  openNote?: string;
  periodStart: string;
  periodEnd: string;
  totals: CashCloseTotals;
  topProducts: ProductLine[];
  byTable: TableLine[];
  // Delivered-and-unstamped sales, reported regardless of whether the register is open.
  // `totals` mirrors what a close would seal, so with the register closed it is all zeros
  // and the panel has no way to tell that money is sitting unsealed. Nothing couples order
  // creation to the register state — a diner ordering by QR neither knows nor can know it —
  // so those sales get swept into whichever close is emitted next, possibly another shift or
  // another day (membership is by cashCloseId stamp, not by time window). This field exists
  // only to make that visible; it never decides what enters a close.
  unsealedTotals: CashCloseTotals;
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
  initialAmount?: number;
  openNote?: string;
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
  id?: string;
  email: string;
  name?: string;
  role: UserRole;
  establishmentId: string; // Managed venue
}

export interface TableCloseReceipt {
  id: string;
  establishmentId: string;
  tableId: string;
  tableName: string;
  closedAt: string;
  closedByName?: string;
  closedByEmail?: string;
  openedAt?: string;
  orders: Order[];
  totalAmount: number;
  orderCount: number;
  dinerNames: string[];
}
