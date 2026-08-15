import { z } from 'zod';

// MED-1: strict zod schemas act as a real whitelist for every mutating endpoint.
// `.strict()` rejects unknown keys, which lets us drop the unsafe `{ ...req.body }`
// spreads and build server-side objects only from validated, known fields.

const nonEmpty = z.string().trim().min(1);

// --- Auth ---
export const loginSchema = z
  .object({
    email: z.string().trim().min(1).max(200),
    password: z.string().min(1).max(200),
  })
  .strict();
export type LoginInput = z.infer<typeof loginSchema>;

// --- Orders (diner) ---
// The client only supplies menuItemId + quantity + optional comment. name/price are
// recomputed server-side from the catalog (ALTO-2), so they are NOT accepted here.
// quantity/comment are validated for TYPE + sane upper bounds here; the store then
// applies the business caps (quantity clamped to 99, comment truncated to 200 chars).
const orderDraftItemSchema = z
  .object({
    menuItemId: nonEmpty,
    quantity: z.number().int().positive().max(99),
    comment: z.string().max(200).optional(),
  })
  .strict();

export const createOrderSchema = z
  .object({
    tableId: nonEmpty,
    dinerName: z.string().max(100).optional(),
    items: z.array(orderDraftItemSchema).min(1).max(100),
  })
  .strict();
export type CreateOrderBody = z.infer<typeof createOrderSchema>;

// --- Table calls & Session ---
export const createTableCallSchema = z
  .object({
    tableId: nonEmpty,
    dinerName: z.string().max(100).optional(),
    type: z.enum(['waiter_call', 'bill_request']),
  })
  .strict();
export type CreateTableCallBody = z.infer<typeof createTableCallSchema>;

export const updateTableCallSchema = z
  .object({
    status: z.enum(['pending', 'attended']),
  })
  .strict();
export type UpdateTableCallBody = z.infer<typeof updateTableCallSchema>;

// ALTO-1: diner order lookup is scoped and bounded (max 50 ids).
export const orderLookupSchema = z
  .object({
    tableId: nonEmpty,
    orderIds: z.array(z.string().min(1)).max(50),
  })
  .strict();
export type OrderLookupBody = z.infer<typeof orderLookupSchema>;

// --- Order status (admin) ---
export const orderStatusValues = [
  'Recibido',
  'En preparación',
  'Listo',
  'Entregado',
  'Cancelado',
] as const;

export const updateOrderStatusSchema = z
  .object({
    status: z.enum(orderStatusValues),
    cancellationReason: z.string().max(500).optional(),
  })
  .strict();
export type UpdateOrderStatusBody = z.infer<typeof updateOrderStatusSchema>;

export const cancelOrderItemSchema = z
  .object({
    orderItemId: nonEmpty,
    quantity: z.number().int().positive().optional(),
    cancellationReason: z.string().max(500).optional(),
  })
  .strict();
export type CancelOrderItemBody = z.infer<typeof cancelOrderItemSchema>;

// --- Menu item (admin) ---
// establishmentId is accepted (the client sends it) but ALWAYS overridden with the
// session tenant in the endpoint; it is never trusted for authorization.
export const saveMenuItemSchema = z
  .object({
    id: nonEmpty,
    establishmentId: z.string().optional(),
    categoryId: nonEmpty,
    name: nonEmpty.max(200),
    description: z.string().max(2000).default(''),
    price: z.number().nonnegative().max(100_000_000),
    imageUrl: z.string().max(2000).default(''),
    available: z.boolean().default(true),
  })
  .strict();
export type SaveMenuItemBody = z.infer<typeof saveMenuItemSchema>;

// --- Category (admin) ---
export const saveCategorySchema = z
  .object({
    id: nonEmpty,
    establishmentId: z.string().optional(),
    name: nonEmpty.max(200),
    order: z.number().int().min(0).max(100000).default(0),
  })
  .strict();
export type SaveCategoryBody = z.infer<typeof saveCategorySchema>;

// --- Table (admin) ---
export const saveTableSchema = z
  .object({
    id: nonEmpty,
    establishmentId: z.string().optional(),
    name: nonEmpty.max(200),
    active: z.boolean().default(true),
    qrUrl: z.string().max(2000).optional(),
    isOccupied: z.boolean().optional(),
    activeOrdersCount: z.number().optional(),
    lastClosedAt: z.string().optional(),
  })
  .strict();
export type SaveTableBody = z.infer<typeof saveTableSchema>;

// --- Cash close & metrics (ADR-005) ---
export const cashOpenSchema = z
  .object({
    initialAmount: z.number().nonnegative().max(100_000_000).default(0),
    note: z.string().max(500).optional(),
  })
  .strict();
export type CashOpenBody = z.infer<typeof cashOpenSchema>;

export const cashCloseSchema = z
  .object({
    note: z.string().max(500).optional(),
  })
  .strict();
export type CashCloseBody = z.infer<typeof cashCloseSchema>;

export const metricsQuerySchema = z
  .object({
    day: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato de fecha inválido (YYYY-MM-DD)')
      .optional(),
  })
  .strict();

export const cashClosesQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(100).default(30),
  })
  .strict();
