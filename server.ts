import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { store } from './src/server/store';

async function startServer() {
  const app = express();
  const PORT = 3000;

  // Crucial middlewares
  app.use(express.json());

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

  // Get establishments
  app.get('/api/establishments', (req, res) => {
    try {
      res.json(store.getEstablishments());
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
  app.patch('/api/orders/:id/status', (req, res) => {
    try {
      const { status, cancellationReason } = req.body;
      if (!status) {
        return res.status(400).json({ error: 'Status is required' });
      }

      const updated = store.updateOrderStatus(req.params.id, status, cancellationReason);
      if (!updated) {
        return res.status(404).json({ error: 'Order not found' });
      }
      res.json(updated);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save menu item (Create/Update)
  app.post('/api/menu-items', (req, res) => {
    try {
      const item = req.body;
      if (!item.id || !item.establishmentId || !item.categoryId || !item.name || item.price === undefined) {
        return res.status(400).json({ error: 'Invalid menu item payload' });
      }
      const saved = store.saveMenuItem(item);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete menu item
  app.delete('/api/menu-items/:id', (req, res) => {
    try {
      const estId = req.query.establishmentId as string;
      if (!estId) return res.status(400).json({ error: 'establishmentId is required' });
      const ok = store.deleteMenuItem(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Menu item not found' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save category (Create/Update)
  app.post('/api/categories', (req, res) => {
    try {
      const cat = req.body;
      if (!cat.id || !cat.establishmentId || !cat.name) {
        return res.status(400).json({ error: 'Invalid category payload' });
      }
      const saved = store.saveCategory(cat);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete category
  app.delete('/api/categories/:id', (req, res) => {
    try {
      const estId = req.query.establishmentId as string;
      if (!estId) return res.status(400).json({ error: 'establishmentId is required' });
      const ok = store.deleteCategory(req.params.id, estId);
      if (!ok) return res.status(404).json({ error: 'Category not found' });
      res.json({ success: true });
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Save table (Create/Update)
  app.post('/api/tables', (req, res) => {
    try {
      const tab = req.body;
      if (!tab.id || !tab.establishmentId || !tab.name) {
        return res.status(400).json({ error: 'Invalid table payload' });
      }
      const saved = store.saveTable(tab);
      res.json(saved);
    } catch (e: any) {
      res.status(500).json({ error: e.message });
    }
  });

  // Delete table
  app.delete('/api/tables/:id', (req, res) => {
    try {
      const estId = req.query.establishmentId as string;
      if (!estId) return res.status(400).json({ error: 'establishmentId is required' });
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
