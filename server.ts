// MUST be the first import: it populates process.env from .env before any other module is
// evaluated. src/lib/firebase-admin reads FIREBASE_PROJECT_ID / FIRESTORE_DATABASE_ID /
// GOOGLE_APPLICATION_CREDENTIALS at module load, so loading .env later (e.g. in the function
// body) would be too late and the Admin SDK would resolve the wrong database.
import 'dotenv/config';
// Initializes the Admin SDK and runs its boot probe (ADR-006 Paso 1). Imported before the store
// so the credential/ADC line is the first thing in the log; the store now depends on adminDb for
// everything, reads and listeners included.
import { adminProbe } from './src/lib/firebase-admin';
import express, { Request, Response, NextFunction } from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import jwt from 'jsonwebtoken';
import { z } from 'zod';
import { createServer as createViteServer } from 'vite';
import { store } from './src/server/store';
import type { CreateOrderResult, FirestoreHealth } from './src/server/store';
import { findUserByEmail, verifyPassword, DUMMY_PASSWORD_HASH } from './src/server/users';
import { requireAuth, requireRole, verifySession, SECRET, SESSION_COOKIE } from './src/server/auth';
import {
  loginSchema,
  createOrderSchema,
  orderLookupSchema,
  updateOrderStatusSchema,
  cancelOrderItemSchema,
  saveMenuItemSchema,
  saveCategorySchema,
  saveTableSchema,
  createTableCallSchema,
  updateTableCallSchema,
  cashOpenSchema,
  cashCloseSchema,
  metricsQuerySchema,
  cashClosesQuerySchema,
} from './src/server/schemas';

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

// Boot probe result, mirrored into a plain value for /api/health. It is not awaited in the
// handler on purpose: the probe retries with a 20s budget per attempt, and a health check that
// blocks for that long during a cold boot is worse than one that answers 'pending'.
let probeState: 'pending' | 'ok' | 'failed' = 'pending';
adminProbe.then(
  (ok) => { probeState = ok ? 'ok' : 'failed'; },
  () => { probeState = 'failed'; }
);

// One definition of "degraded", shared by the public probe and the admin detail below, so the two
// can never disagree about the same instance while reporting different amounts of it.
// `writePath`/`heartbeatStream` at 'pending' deliberately do NOT count: that is the boot state,
// when no beat has settled yet, and treating it as a failure would make every cold start degraded.
function isDegraded(firestore: FirestoreHealth): boolean {
  return (
    firestore.live < firestore.total ||
    firestore.errors.length > 0 ||
    probeState === 'failed' ||
    // Everything above is a read. A credential with read but no write access leaves all of it
    // green while nothing the panel does actually persists.
    firestore.writePath === 'failing' ||
    // A watch stream can freeze without ever invoking its error handler (seen with a nonexistent
    // FIRESTORE_DATABASE_ID: the Admin SDK retried internally and the handler never fired), so an
    // empty `errors` is not proof of life — a missing round-trip is.
    firestore.heartbeatStream === 'stalled'
  );
}

// Cookie attributes shared by the login (set) and logout (clear) so the browser
// actually removes the cookie — clearCookie only matches when path/sameSite/etc align.
const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
};

// F-7: validate a request body against a strict zod schema. On failure responds 400
// with only the offending field names (never the raw zod error, which can leak internals).
// Same contract as parseBody, for query strings. Query values arrive as strings, so the
// schemas that use it coerce where a number is expected.
function parseQuery<S extends z.ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((i) => i.path.join('.') || '(query)'))];
    res.status(400).json({ error: 'Parámetros inválidos', fields });
    return null;
  }
  return result.data;
}

function parseBody<S extends z.ZodTypeAny>(schema: S, req: Request, res: Response): z.infer<S> | null {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    const fields = [...new Set(result.error.issues.map((i) => i.path.join('.') || '(body)'))];
    res.status(400).json({ error: 'Datos inválidos', fields });
    return null;
  }
  return result.data;
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust exactly ONE reverse proxy (Cloud Run / AI Studio) for X-Forwarded-* so
  // that req.protocol/req.ip and `secure` cookies work behind TLS termination.
  // This assumes a single trusted hop in front of us; it is also required for the
  // per-IP rate limiting below (which relies on a trustworthy client IP).
  app.set('trust proxy', 1);

  // BAJO: baseline security headers. CSP is disabled here because the Vite dev server
  // injects inline/eval scripts and the app loads cross-origin images (unsplash,
  // qrserver); a tailored Content-Security-Policy should be enabled in production.
  app.use(helmet({ contentSecurityPolicy: false }));

  // Crucial middlewares. Body capped at 100kb (BAJO) to bound abuse.
  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // F-8: rate limiting. In-memory store (default) — counters reset on restart and are
  // NOT shared across instances; a shared store (Redis) is needed for multi-instance.
  const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    limit: 600, // generous: both the admin panel and diner views poll frequently
    standardHeaders: true,
    legacyHeaders: false,
  });
  // Stricter anti-brute-force limiter on login. Only failed attempts count, so a
  // legitimate user is never locked out by their own successful sign-ins.
  const loginLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    limit: 10,
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true,
    message: { error: 'Demasiados intentos. Probá de nuevo más tarde.' },
  });
  app.use('/api', apiLimiter);

  // SSE stream — segmented per tenant/table (F-6). Soft auth: a valid session cookie
  // makes this an 'admin' subscriber (all tenant events); otherwise it must be a diner
  // identifying its establishment + table via query params. We verify the JWT manually
  // (verifySession) instead of requireAuth so the anonymous diner is not rejected with 401.
  app.get('/api/realtime', (req, res) => {
    const user = verifySession(req);

    let establishmentId: string;
    let tableId: string;

    if (user) {
      establishmentId = user.establishmentId;
      tableId = typeof req.query.tableId === 'string' ? req.query.tableId : '';
    } else {
      const diinerQueryResult = z.object({
        establishmentId: z.string().min(1).max(100),
        tableId: z.string().min(1).max(100),
      }).safeParse(req.query);
      if (!diinerQueryResult.success) {
        res.status(400).json({ error: 'Invalid query parameters' });
        return;
      }
      establishmentId = diinerQueryResult.data.establishmentId;
      tableId = diinerQueryResult.data.tableId;
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders(); // For some compressing proxies

    if (user) {
      store.addSseClient({ res, scope: 'admin', establishmentId });
    } else {
      store.addSseClient({ res, scope: 'diner', establishmentId, tableId });
    }

    req.on('close', () => {
      store.removeSseClient(res);
    });
  });

  // API REST Endpoints
  // Liveness of the Firestore mirror, not just of the process (ADR-006 Paso 3). The failure
  // mode this exists for: the Admin SDK cannot reach Firestore (credential, IAM, wrong
  // database), the 9 listeners die at boot without resubscribing, and the store keeps serving
  // the demo seed data it loaded in its constructor — orders, prices and cash closes that were
  // never real, behind a panel that looks completely normal. A fixed {status:'ok'} made that
  // invisible, which is why closing firestore.rules (Paso 5) waits on this endpoint.
  //
  // Split in two on purpose. This one is public because a platform probe needs it, so it carries
  // the verdict and nothing else. The detail used to be here, unauthenticated, and
  // `lastSnapshotAt` is the maximum over all nine collections and ALL tenants: polled every few
  // seconds — comfortably inside the 600/min apiLimiter — it is a time series of every write on
  // the platform, which is real opening hours, order cadence and which days each venue works.
  // For someone writing straight into Firestore it doubles as confirmation that an injected
  // document was ingested. `down[]` and `probe` additionally announce when the instance is
  // degraded and therefore serving seed data.
  //
  // `status` stays public knowing it is itself a coarse degraded oracle — a probe that cannot
  // tell healthy from degraded is not a probe, so that trade is accepted; the detail behind it
  // is not.
  app.get('/api/health', (req, res) => {
    // Deliberately still HTTP 200 even when degraded: the process is serving requests, and this
    // endpoint's response code may be wired to a platform health check we do not control — a 503
    // here could start recycling revisions that are degraded but useful. The signal is the body.
    res.json({
      status: isDegraded(store.getFirestoreHealth()) ? 'degraded' : 'ok',
      time: new Date().toISOString(),
    });
  });

  // The operational detail, admin-only. The alternative was keeping it public with a bucketized
  // age ('<1m' / '<15m' / 'older') instead of a timestamp; rejected because it only fixes the one
  // field while down[], probe, errors and the heartbeat verdicts stay published, and because the
  // exact numbers are what the Paso 4 gate is watching — buckets are strictly worse to operate
  // with. An admin login is a cheap price for keeping the useful form.
  // Still counters, enums, timestamps and coarse error codes only: no raw Firestore message ever
  // reaches this body, because those carry project and database ids.
  app.get('/api/health/details', requireAuth, requireRole('admin'), (req, res) => {
    const firestore = store.getFirestoreHealth();
    res.json({
      status: isDegraded(firestore) ? 'degraded' : 'ok',
      time: new Date().toISOString(),
      firestore: {
        listeners: firestore.listeners,
        lastSnapshotAt: firestore.lastSnapshotAt || null,
        down: firestore.down,
        errors: firestore.errors,
        probe: probeState,
        // Write path and stream, from the heartbeat in src/server/store.ts. Read `writePath`
        // first: 'failing' means writes are rejected, which is the actionable half and usually
        // the reason `heartbeatStream` went stalled too.
        writePath: firestore.writePath,
        heartbeatStream: firestore.heartbeatStream,
        heartbeatLagMs: firestore.heartbeatLagMs ?? null,
        heartbeatIntervalMs: firestore.heartbeatIntervalMs,
        heartbeatStaleAfterMs: firestore.heartbeatStaleAfterMs,
        heartbeatErrorCode: firestore.heartbeatErrorCode || null,
      },
    });
  });

  // Seed/reset demo data (F-9): admin only AND env-gated. Disabled in production unless
  // ALLOW_SEED === 'true'. There is NO auto-seed on boot for non-empty collections
  // (the store only seeds empty collections idempotently), so this is the sole way to
  // force a full (over)write of demo data.
  app.post('/api/seed', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      if (process.env.NODE_ENV === 'production' && process.env.ALLOW_SEED !== 'true') {
        return res.status(403).json({ error: 'Seeding deshabilitado en producción' });
      }
      await store.seedAllDemoData();
      res.json({ success: true, message: 'Datos demo cargados exitosamente.' });
    } catch (e) {
      next(e);
    }
  });

  // --- Auth ---

  // Login: validate credentials, issue an 8h httpOnly session cookie.
  app.post('/api/auth/login', loginLimiter, (req, res, next) => {
    try {
      const body = parseBody(loginSchema, req, res);
      if (!body) return;

      const user = findUserByEmail(body.email);
      // F-8: run verifyPassword in BOTH branches (dummy hash when the user is unknown)
      // so the response timing does not reveal whether the account exists. Same code path,
      // same generic 401 for "unknown email" and "wrong password".
      const hashToCheck = user ? user.passwordHash : DUMMY_PASSWORD_HASH;
      const passwordOk = verifyPassword(body.password, hashToCheck);
      if (!user || !passwordOk) {
        return res.status(401).json({ error: 'Credenciales inválidas' });
      }

      const token = jwt.sign(
        {
          sub: user.id,
          email: user.email,
          role: user.role,
          establishmentId: user.establishmentId,
        },
        SECRET,
        { expiresIn: SESSION_TTL_SECONDS }
      );

      res.cookie(SESSION_COOKIE, token, {
        ...SESSION_COOKIE_OPTIONS,
        maxAge: SESSION_TTL_SECONDS * 1000,
      });

      // F-5: respond with the session profile only. The JWT lives exclusively in the
      // httpOnly cookie and is never exposed to JS (XSS token-theft protection).
      res.json({
        email: user.email,
        role: user.role,
        establishmentId: user.establishmentId,
      });
    } catch (e) {
      next(e);
    }
  });

  // Logout: clear the session cookie using the SAME attributes it was set with.
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE, SESSION_COOKIE_OPTIONS);
    res.json({ success: true });
  });

  // Current session (rehydration). Returns the profile only — never the token (F-5).
  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  // Get establishments — protected: only the caller's own tenant (array of 1).
  app.get('/api/establishments', requireAuth, (req, res, next) => {
    try {
      const own = store
        .getEstablishments()
        .filter((e) => e.id === req.user!.establishmentId);
      res.json(own);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/establishments/:id', (req, res, next) => {
    try {
      const list = store.getEstablishments();
      const item = list.find((e) => e.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Establishment not found' });
      res.json(item);
    } catch (e) {
      next(e);
    }
  });

  // Get categories (public — diner menu)
  app.get('/api/establishments/:id/categories', (req, res, next) => {
    try {
      res.json(store.getCategories(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  // Get menu items (public — diner menu)
  app.get('/api/establishments/:id/menu-items', (req, res, next) => {
    try {
      res.json(store.getMenuItems(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  // Get tables (public — diner needs table name)
  app.get('/api/establishments/:id/tables', (req, res, next) => {
    try {
      res.json(store.getTables(req.params.id));
    } catch (e) {
      next(e);
    }
  });

  // F-4: scoped diner order lookup. Returns only orders that belong to this tenant AND
  // table AND whose ids the caller already holds (from its own session storage).
  // Replaces the removed public GET /api/establishments/:id/orders (which enumerated
  // every order of a tenant). Registered before the create route; distinct path.
  app.post('/api/establishments/:id/orders/lookup', (req, res, next) => {
    try {
      const body = parseBody(orderLookupSchema, req, res);
      if (!body) return;
      const orders = store.lookupOrders(req.params.id, body.tableId, body.orderIds);
      res.json(orders);
    } catch (e) {
      next(e);
    }
  });

  // Create order (public — diner via QR). Tenant comes from the URL; prices/names are
  // recomputed server-side from the catalog (F-3). Whole order fails atomically.
  app.post('/api/establishments/:id/orders', async (req, res, next) => {
    try {
      const body = parseBody(createOrderSchema, req, res);
      if (!body) return;

      const result: CreateOrderResult = await store.createOrder({
        establishmentId: req.params.id,
        tableId: body.tableId,
        dinerName: body.dinerName,
        items: body.items,
      });

      if (result.ok && result.order) {
        return res.status(201).json(result.order);
      }
      if (result.reason === 'invalid_table') {
        return res.status(400).json({ error: 'Mesa inválida o inactiva' });
      }
      return res
        .status(409)
        .json({ error: 'Algunos ítems no están disponibles', unavailableItems: result.unavailableItems ?? [] });
    } catch (e) {
      next(e);
    }
  });

  // Table Calls & Notifications (public — diner via QR)
  app.post('/api/establishments/:id/calls', async (req, res, next) => {
    try {
      const body = parseBody(createTableCallSchema, req, res);
      if (!body) return;

      const call = await store.createTableCall({
        establishmentId: req.params.id,
        tableId: body.tableId,
        dinerName: body.dinerName,
        type: body.type,
      });

      if (!call) return res.status(400).json({ error: 'Mesa inválida' });
      res.status(201).json(call);
    } catch (e) {
      next(e);
    }
  });

  // Get session status for a table (public — diner checking if admin closed table)
  app.get('/api/establishments/:id/tables/:tableId/session', (req, res, next) => {
    try {
      const session = store.getTableSessionStatus(req.params.id, req.params.tableId);
      res.json(session);
    } catch (e) {
      next(e);
    }
  });

  // Clear/reset session status for a table (public — diner starting new session on table)
  app.delete('/api/establishments/:id/tables/:tableId/session', (req, res, next) => {
    try {
      store.clearTableSession(req.params.id, req.params.tableId);
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Get table calls for authenticated staff
  app.get('/api/my/calls', requireAuth, (req, res, next) => {
    try {
      res.json(store.getTableCalls(req.user!.establishmentId));
    } catch (e) {
      next(e);
    }
  });

  // Mark table call as attended
  app.patch('/api/calls/:id', requireAuth, async (req, res, next) => {
    try {
      const body = parseBody(updateTableCallSchema, req, res);
      if (!body) return;

      const updated = await store.updateTableCallStatus(
        req.params.id,
        req.user!.establishmentId,
        body.status
      );

      if (!updated) return res.status(404).json({ error: 'Llamado no encontrado' });
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  // Close table session manually (Admin / Waiter)
  app.post('/api/tables/:id/close', requireAuth, async (req, res, next) => {
    try {
      const result = await store.closeTableSession(
        req.user!.establishmentId,
        req.params.id,
        req.user?.email ? req.user.email.split('@')[0] : 'Staff',
        req.user?.email
      );
      if (!result.ok) {
        return res.status(409).json({ error: result.error || 'La mesa no se encuentra abierta o ya fue cerrada previamente.' });
      }
      res.json(result);
    } catch (e) {
      next(e);
    }
  });

  // Get historical table close receipts scoped to authenticated tenant
  app.get('/api/my/table-closes', requireAuth, (req, res, next) => {
    try {
      res.json(store.getTableCloses(req.user!.establishmentId));
    } catch (e) {
      next(e);
    }
  });

  // Get orders scoped to the authenticated user's own tenant.
  app.get('/api/my/orders', requireAuth, (req, res, next) => {
    try {
      res.json(store.getOrders(req.user!.establishmentId));
    } catch (e) {
      next(e);
    }
  });

  // --- Metrics & cash close (ADR-005) ---

  // Full analytics are admin-only: they expose product performance and business
  // patterns. A waiter still sees their own shift total through the cash-close preview.
  app.get('/api/my/metrics', requireAuth, requireRole('admin'), (req, res, next) => {
    try {
      const q = parseQuery(metricsQuerySchema, req, res);
      if (!q) return;
      res.json(store.getMetrics(req.user!.establishmentId, q.day));
    } catch (e) {
      next(e);
    }
  });

  // Register opening endpoint — starts a new shift with optional starting float
  app.post('/api/my/cash-open', requireAuth, async (req, res, next) => {
    try {
      const body = parseBody(cashOpenSchema, req, res);
      if (!body) return;

      const result = await store.openCashRegister(
        req.user!.establishmentId,
        {
          email: req.user!.email,
          name: req.user!.email.split('@')[0],
          role: req.user!.role,
        },
        body.initialAmount,
        body.note
      );

      if (!result.ok) {
        return res.status(400).json({ error: result.error || 'No se pudo abrir la caja' });
      }
      res.status(200).json(result.register);
    } catch (e) {
      next(e);
    }
  });

  // Preview and close are available to waiters too: closing the register is shift work,
  // not business intelligence.
  app.get('/api/my/cash-close/preview', requireAuth, (req, res, next) => {
    try {
      res.json(store.previewCashClose(req.user!.establishmentId));
    } catch (e) {
      next(e);
    }
  });

  app.post('/api/my/cash-close', requireAuth, async (req, res, next) => {
    try {
      const body = parseBody(cashCloseSchema, req, res);
      if (!body) return;

      // Everything that matters is derived server-side: the caller only supplies a note,
      // so the recorded revenue cannot be forged from the client.
      const result = await store.executeCashClose(
        req.user!.establishmentId,
        {
          email: req.user!.email,
          name: req.user!.email.split('@')[0],
          role: req.user!.role,
        },
        body.note
      );

      if (!result.ok) {
        if (result.reason === 'not_open') {
          return res
            .status(409)
            .json({ error: 'La caja se encuentra cerrada. Debe abrir la caja para iniciar un turno antes de cerrarla.' });
        }
        // The close was computed but the first batch never landed, so nothing was recorded and
        // the orders are still pending. Retrying is safe. The message no longer points at
        // firestore.rules: since ADR-006 Paso 2 the Admin SDK bypasses them, so they cannot be
        // the cause and sending the operator to check them wastes the one diagnostic they get.
        if (result.reason === 'storage_error') {
          return res.status(503).json({
            error:
              'No se pudo registrar el cierre: la base de datos rechazó la escritura. ' +
              'No se guardó nada, podés reintentar. Si vuelve a fallar, revisá los logs del ' +
              'servidor: el acceso a Firestore del backend puede estar mal configurado.',
          });
        }
        // A close big enough to need several batches failed after the first one committed: the
        // close and the register closure ARE persisted and part of the orders are stamped. The
        // operator must NOT be told to retry — the unstamped orders would be counted again in a
        // second close, on top of one that already exists. Only a manual repair fixes this, so
        // the id travels in the message.
        if (result.reason === 'partial_close') {
          return res.status(503).json({
            error:
              'El cierre se registró de forma incompleta: quedaron pedidos sin sellar. ' +
              'NO reintentes el cierre, se contarían dos veces. Avisá al administrador con ' +
              `este identificador de cierre: ${result.close?.id ?? 'desconocido'}. ` +
              'El detalle está en los logs del servidor.',
          });
        }
        return res
          .status(409)
          .json({ error: 'No hay pedidos entregados pendientes de cierre' });
      }
      res.status(201).json(result.close);
    } catch (e) {
      next(e);
    }
  });

  app.get('/api/my/cash-closes', requireAuth, (req, res, next) => {
    try {
      const q = parseQuery(cashClosesQuerySchema, req, res);
      if (!q) return;
      res.json(store.getCashCloses(req.user!.establishmentId, q.limit));
    } catch (e) {
      next(e);
    }
  });

  // Update order status, with optional cancellationReason
  app.patch('/api/orders/:id/status', requireAuth, async (req, res, next) => {
    try {
      const body = parseBody(updateOrderStatusSchema, req, res);
      if (!body) return;

      // Ownership check: the order must belong to the caller's tenant.
      const existing = store.getOrder(req.params.id);
      if (!existing || existing.establishmentId !== req.user!.establishmentId) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // An order already counted in a cash close is frozen: changing it now would
      // unbalance a receipt that was already issued. (ADR-005)
      if (existing.cashCloseId) {
        return res.status(409).json({
          error: 'El pedido pertenece a un cierre de caja y no puede modificarse',
        });
      }

      const updated = await store.updateOrderStatus(
        req.params.id,
        req.user!.establishmentId,
        body.status,
        body.cancellationReason
      );
      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(updated);
    } catch (e) {
      next(e);
    }
  });

  // Cancel or reduce quantity of a specific dish/item from an order
  app.post('/api/orders/:id/cancel-item', requireAuth, async (req, res, next) => {
    try {
      const body = parseBody(cancelOrderItemSchema, req, res);
      if (!body) return;

      // Ownership check: the order must belong to the caller's tenant.
      const existing = store.getOrder(req.params.id);
      if (!existing || existing.establishmentId !== req.user!.establishmentId) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // An order already counted in a cash close is frozen
      if (existing.cashCloseId) {
        return res.status(409).json({
          error: 'El pedido pertenece a un cierre de caja y no puede modificarse',
        });
      }

      const result = await store.cancelOrderItem(
        req.params.id,
        req.user!.establishmentId,
        body.orderItemId,
        body.quantity,
        body.cancellationReason
      );

      if (!result.order) {
        return res.status(result.status || 400).json({ error: result.error || 'Failed to cancel item' });
      }

      res.json(result.order);
    } catch (e) {
      next(e);
    }
  });

  // Save menu item (Create/Update) — admin only, scoped to own tenant.
  app.post('/api/menu-items', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const body = parseBody(saveMenuItemSchema, req, res);
      if (!body) return;

      const estId = req.user!.establishmentId;
      // Build explicitly from validated fields; establishmentId forced from the session.
      const saved = await store.saveMenuItem({
        id: body.id,
        establishmentId: estId,
        categoryId: body.categoryId,
        name: body.name,
        description: body.description,
        price: body.price,
        imageUrl: body.imageUrl,
        available: body.available,
      });
      res.json(saved);
    } catch (e) {
      next(e);
    }
  });

  // Delete menu item — admin only, tenant from session.
  app.delete('/api/menu-items/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const estId = req.user!.establishmentId;
      const ok = await store.deleteMenuItem(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Menu item not found' });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Save category (Create/Update) — admin only, scoped to own tenant.
  app.post('/api/categories', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const body = parseBody(saveCategorySchema, req, res);
      if (!body) return;

      const estId = req.user!.establishmentId;
      const saved = await store.saveCategory({
        id: body.id,
        establishmentId: estId,
        name: body.name,
        order: body.order,
      });
      res.json(saved);
    } catch (e) {
      next(e);
    }
  });

  // Delete category — admin only, tenant from session.
  app.delete('/api/categories/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const estId = req.user!.establishmentId;
      const ok = await store.deleteCategory(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Category not found' });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });

  // Save table (Create/Update) — admin only, scoped to own tenant.
  app.post('/api/tables', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const body = parseBody(saveTableSchema, req, res);
      if (!body) return;

      const estId = req.user!.establishmentId;
      const saved = await store.saveTable({
        id: body.id,
        establishmentId: estId,
        name: body.name,
        active: body.active,
        ...(body.qrUrl ? { qrUrl: body.qrUrl } : {}),
      });
      res.json(saved);
    } catch (e) {
      next(e);
    }
  });

  // Delete table — admin only, tenant from session.
  app.delete('/api/tables/:id', requireAuth, requireRole('admin'), async (req, res, next) => {
    try {
      const estId = req.user!.establishmentId;
      const ok = await store.deleteTable(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Table not found' });
      res.json({ success: true });
    } catch (e) {
      next(e);
    }
  });


  // Mounting Vite Dev Server or SPA dist folder
  if (process.env.NODE_ENV !== 'production') {
    console.log('Mounting Vite middleware in Development mode...');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    console.log('Serving production static distribution from dist...');
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  // F-8/MED-4: central error handler. Endpoints delegate here via next(e); we log the
  // real detail server-side and return a generic message so internals never leak.
  // Known client errors (4xx from body-parser: 413 payload too large, 400 malformed JSON)
  // keep their status but still get a generic message. Everything else is a 500.
  // Must be registered last and keep all four args to be treated as an error handler.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    const e = err as { status?: number; statusCode?: number } | null;
    const status = e?.status ?? e?.statusCode ?? 500;
    if (res.headersSent) return;
    if (status >= 400 && status < 500) {
      console.warn('[client error]', status);
      return res.status(status).json({ error: status === 413 ? 'Cuerpo demasiado grande' : 'Solicitud inválida' });
    }
    console.error('[unhandled error]', err);
    res.status(500).json({ error: 'Error interno' });
  });

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Mi Menu Root Server] Running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Critical failed to start Express server:', err);
});
