import express from 'express';
import path from 'path';
import cookieParser from 'cookie-parser';
import jwt from 'jsonwebtoken';
import { createServer as createViteServer } from 'vite';
import { store } from './src/server/store';
import { findUserByEmail, verifyPassword } from './src/server/users';
import { requireAuth, requireRole, SECRET, SESSION_COOKIE } from './src/server/auth';

const SESSION_TTL_SECONDS = 8 * 60 * 60; // 8 hours

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Trust exactly ONE reverse proxy (Cloud Run / AI Studio) for X-Forwarded-* so
  // that req.protocol/req.ip and `secure` cookies work behind TLS termination.
  // This assumes a single trusted hop in front of us; it becomes required once we
  // add per-IP rate limiting (which relies on a trustworthy client IP).
  app.set('trust proxy', 1);

  // Crucial middlewares
  app.use(express.json());
  app.use(cookieParser());

  // SSE client list & endpoint
  app.get('/api/realtime', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders && res.flushHeaders(); // For some compressing proxies

    store.addSseClient(res);

    req.on('close', () => {
      store.removeSseClient(res);
    });
  });

  // API REST Endpoints
  app.get('/api/health', (req, res) => {
    res.json({ status: 'ok', time: new Date().toISOString() });
  });

  // --- Auth ---

  // Login: validate credentials, issue an 8h httpOnly session cookie.
  app.post('/api/auth/login', (req, res) => {
    try {
      const { email, password } = req.body;
      if (!email || !password) {
        return res.status(400).json({ error: 'Email y contraseña son requeridos' });
      }

      const user = findUserByEmail(email);
      // Same generic message for unknown email and bad password (no user enumeration).
      if (!user || !verifyPassword(password, user.passwordHash)) {
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
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        maxAge: SESSION_TTL_SECONDS * 1000,
      });

      // Respond with the session profile only. The JWT lives exclusively in the
      // httpOnly cookie and is never exposed to JS (XSS token-theft protection).
      res.json({
        email: user.email,
        role: user.role,
        establishmentId: user.establishmentId,
      });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Logout: clear the session cookie.
  app.post('/api/auth/logout', (req, res) => {
    res.clearCookie(SESSION_COOKIE);
    res.json({ success: true });
  });

  // Current session (rehydration). Returns the profile only — never the token.
  app.get('/api/auth/me', requireAuth, (req, res) => {
    res.json(req.user);
  });

  // Get establishments — protected: only the caller's own tenant (array of 1).
  app.get('/api/establishments', requireAuth, (req, res) => {
    try {
      const own = store
        .getEstablishments()
        .filter((e) => e.id === req.user!.establishmentId);
      res.json(own);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  app.get('/api/establishments/:id', (req, res) => {
    try {
      const list = store.getEstablishments();
      const item = list.find((e) => e.id === req.params.id);
      if (!item) return res.status(404).json({ error: 'Establishment not found' });
      res.json(item);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get categories
  app.get('/api/establishments/:id/categories', (req, res) => {
    try {
      res.json(store.getCategories(req.params.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get menu items
  app.get('/api/establishments/:id/menu-items', (req, res) => {
    try {
      res.json(store.getMenuItems(req.params.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get tables
  app.get('/api/establishments/:id/tables', (req, res) => {
    try {
      res.json(store.getTables(req.params.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get orders
  app.get('/api/establishments/:id/orders', (req, res) => {
    try {
      res.json(store.getOrders(req.params.id));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Get orders scoped to the authenticated user's own tenant.
  app.get('/api/my/orders', requireAuth, (req, res) => {
    try {
      res.json(store.getOrders(req.user!.establishmentId));
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Create order
  app.post('/api/orders', (req, res) => {
    try {
      const { establishmentId, tableId, tableName, items, status } = req.body;
      if (!establishmentId || !tableId || !tableName || !items || !items.length) {
        return res.status(400).json({ error: 'Missing required order fields' });
      }

      const ord = store.createOrder({
        establishmentId,
        tableId,
        tableName,
        items,
        status: status || 'Recibido',
      });
      res.status(201).json(ord);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Update order status, with optional cancellationReason
  app.patch('/api/orders/:id/status', requireAuth, (req, res) => {
    try {
      const { status, cancellationReason } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      // Ownership check: the order must belong to the caller's tenant.
      const existing = store.getOrder(req.params.id);
      if (!existing || existing.establishmentId !== req.user!.establishmentId) {
        return res.status(404).json({ error: 'Order not found' });
      }

      // establishmentId comes from the verified session, never the body — consistent
      // with the tenant-scoped signatures of the other store mutations.
      const updated = store.updateOrderStatus(
        req.params.id,
        req.user!.establishmentId,
        status,
        cancellationReason
      );
      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save menu item (Create/Update) — admin only, scoped to own tenant.
  app.post('/api/menu-items', requireAuth, requireRole('admin'), (req, res) => {
    try {
      const estId = req.user!.establishmentId;
      // Force tenant from the session; ignore any establishmentId in the payload.
      const item = { ...req.body, establishmentId: estId };
      if (!item.id || !item.categoryId || !item.name || item.price === undefined) {
        return res.status(400).json({ error: 'Invalid menu item payload' });
      }
      // Ownership on update is enforced by the store: it matches id+establishmentId,
      // and refuses to overwrite a resource owned by another tenant (throws -> 500).
      const saved = store.saveMenuItem(item);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete menu item — admin only, tenant from session.
  app.delete('/api/menu-items/:id', requireAuth, requireRole('admin'), (req, res) => {
    try {
      const estId = req.user!.establishmentId;
      const ok = store.deleteMenuItem(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Menu item not found' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save category (Create/Update) — admin only, scoped to own tenant.
  app.post('/api/categories', requireAuth, requireRole('admin'), (req, res) => {
    try {
      const estId = req.user!.establishmentId;
      // Force tenant from the session; ignore any establishmentId in the payload.
      const cat = { ...req.body, establishmentId: estId };
      if (!cat.id || !cat.name) {
        return res.status(400).json({ error: 'Invalid category payload' });
      }
      // Ownership on update is enforced by the store (id+establishmentId match,
      // refuses cross-tenant overwrite -> throws -> 500).
      const saved = store.saveCategory(cat);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete category — admin only, tenant from session.
  app.delete('/api/categories/:id', requireAuth, requireRole('admin'), (req, res) => {
    try {
      const estId = req.user!.establishmentId;
      const ok = store.deleteCategory(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Category not found' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save table (Create/Update) — admin only, scoped to own tenant.
  app.post('/api/tables', requireAuth, requireRole('admin'), (req, res) => {
    try {
      const estId = req.user!.establishmentId;
      // Force tenant from the session; ignore any establishmentId in the payload.
      const tab = { ...req.body, establishmentId: estId };
      if (!tab.id || !tab.name) {
        return res.status(400).json({ error: 'Invalid table payload' });
      }
      // Ownership on update is enforced by the store (id+establishmentId match,
      // refuses cross-tenant overwrite -> throws -> 500).
      const saved = store.saveTable(tab);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete table — admin only, tenant from session.
  app.delete('/api/tables/:id', requireAuth, requireRole('admin'), (req, res) => {
    try {
      const estId = req.user!.establishmentId;
      const ok = store.deleteTable(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Table not found' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
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

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`[Mi Menu Root Server] Running at http://0.0.0.0:${PORT}`);
  });
}

startServer().catch((err) => {
  console.error('Critical failed to start Express server:', err);
});
