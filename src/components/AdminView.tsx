import React, { useState, useEffect, useMemo, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Plus, 
  Trash, 
  Edit, 
  MapPin, 
  Users, 
  ClipboardList, 
  Utensils, 
  Power, 
  Volume2, 
  VolumeX, 
  Check, 
  X, 
  Bell, 
  AlertTriangle, 
  Eye, 
  TrendingUp, 
  Layers, 
  Search, 
  Download, 
  QrCode, 
  Clock, 
  ChevronRight, 
  ShoppingBag,
  ExternalLink,
  ShieldAlert,
  CheckCircle,
  RefreshCw
} from 'lucide-react';
import { Establishment, Category, MenuItem, Table, Order, OrderStatus, UserSession, UserRole } from '../types';
import { playNewOrderSound, playAlertSound } from './SoundUtility';
import { useTheme } from '../theme/ThemeContext';
import ThemeTriggerButton from './ThemeTriggerButton';

interface AdminViewProps {
  onBackToLauncher: () => void;
}

// Session shape returned by the server (/api/auth/login and /api/auth/me).
// The tenant (establishmentId) is authoritative and cannot be changed client-side.
// The session token is NEVER exposed to JS: auth rides only on the httpOnly cookie (F-5).
type AuthMe = Pick<UserSession, 'email' | 'role' | 'establishmentId'>;

export default function AdminView({ onBackToLauncher }: AdminViewProps) {
  const { classes, isDark } = useTheme();

  // Authentication state
  const [currentUser, setCurrentUser] = useState<AuthMe | null>(null);
  const [loginEmail, setLoginEmail] = useState('carolina@mimenu.com');
  const [loginPassword, setLoginPassword] = useState('admin');
  const [loginError, setLoginError] = useState('');
  const [isLoggingIn, setIsLoggingIn] = useState(false);

  // Active tenant
  const [activeEstId, setActiveEstId] = useState<string>('bodegon-palermo');
  
  // Data lists
  const [establishments, setEstablishments] = useState<Establishment[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  
  // Active states
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'diseño_mesas' | 'pedidos' | 'menu_items' | 'historial'>('pedidos');

  // Mutation and Selection modallers
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);
  const [isCancelModalOpen, setIsCancelModalOpen] = useState(false);
  const [cancellationReason, setCancellationReason] = useState('');
  const [disableItemOnCancelId, setDisableItemOnCancelId] = useState<string>(''); // For RF-A07
  
  // Menu Item Editor Modal
  const [isItemModalOpen, setIsItemModalOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<Partial<MenuItem> | null>(null);
  
  // Category Editor Modal
  const [isCategoryModalOpen, setIsCategoryModalOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<Partial<Category> | null>(null);

  // Table Editor Modal
  const [isTableModalOpen, setIsTableModalOpen] = useState(false);
  const [editingTable, setEditingTable] = useState<Partial<Table> | null>(null);

  // Filters
  const [menuSearch, setMenuSearch] = useState('');
  const [menuCatFilter, setMenuCatFilter] = useState('all');
  const [historyTableFilter, setHistoryTableFilter] = useState('all');

  // Store pre-played order count to detect new orders and synthesize chime
  const orderCountRef = useRef<number>(0);

  // Real auth against the server (RF-A01, RF-A13 role validation).
  const doLogin = async (emailToUse: string, passwordToUse: string) => {
    setLoginError('');
    setIsLoggingIn(true);
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email: emailToUse, password: passwordToUse }),
      });
      if (!res.ok) {
        setLoginError('Credenciales inválidas.');
        return;
      }
      const me: AuthMe = await res.json();
      setCurrentUser(me);
      setActiveEstId(me.establishmentId);
      if (me.role === 'waiter') setActiveTab('pedidos'); // Waiter only accesses orders
    } catch (err) {
      console.error('Login failed', err);
      setLoginError('No se pudo conectar con el servidor.');
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    await doLogin(loginEmail, loginPassword);
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } catch (err) {
      console.error('Logout failed', err);
    }
    setCurrentUser(null);
  };

  // Rehydrate the session on mount from the httpOnly cookie; if 401, show login.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { credentials: 'include' });
        if (!cancelled && res.ok) {
          const me: AuthMe = await res.json();
          setCurrentUser(me);
          setActiveEstId(me.establishmentId);
          if (me.role === 'waiter') setActiveTab('pedidos');
        }
      } catch (err) {
        // Not authenticated — the login screen will render.
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Fetch all DB state elements for active establishment
  const fetchDbState = async () => {
    if (!currentUser) return;
    const estId = currentUser.establishmentId;
    try {
      const [estRes, catRes, menuRes, tabRes, ordRes] = await Promise.all([
        fetch('/api/establishments', { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/establishments/${estId}/categories`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/establishments/${estId}/menu-items`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/establishments/${estId}/tables`, { credentials: 'include' }).then(r => r.json()),
        fetch('/api/my/orders', { credentials: 'include' }).then(r => r.json())
      ]);

      if (Array.isArray(estRes)) setEstablishments(estRes);
      if (Array.isArray(catRes)) setCategories(catRes);
      if (Array.isArray(menuRes)) setMenuItems(menuRes);
      if (Array.isArray(tabRes)) setTables(tabRes);
      if (Array.isArray(ordRes)) {
        const orderMap = new Map<string, Order>();
        ordRes.forEach((o: Order) => orderMap.set(o.id, o));
        setOrders(Array.from(orderMap.values()));
      }

      // Sound notification triggers on new orders count raising (RF-A03)
      const currentReceivedOrders = Array.isArray(ordRes)
        ? ordRes.filter((o: Order) => o.status === 'Recibido').length
        : 0;
      if (orderCountRef.current !== null && currentReceivedOrders > orderCountRef.current) {
        if (soundEnabled) {
          playNewOrderSound();
        }
      }
      orderCountRef.current = currentReceivedOrders;

    } catch (err) {
      console.error('Error fetching admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const [isSeeding, setIsSeeding] = useState(false);

  const handleSeedDemoData = async () => {
    try {
      setIsSeeding(true);
      const res = await fetch('/api/seed', { method: 'POST', credentials: 'include' });
      if (res.ok) {
        await fetchDbState();
      }
    } catch (err) {
      console.error('Error seeding demo data', err);
    } finally {
      setIsSeeding(false);
    }
  };

  useEffect(() => {
    fetchDbState();
    
    // Polling every 3 seconds for active changes
    const interval = setInterval(fetchDbState, 3000);
    return () => clearInterval(interval);
  }, [currentUser, activeEstId, soundEnabled]);

  // SSE handler for instantaneous real-time refresh (RF-A03, RF-C08)
  useEffect(() => {
    if (!currentUser) return;
    let sse: EventSource | null = null;
    try {
      sse = new EventSource('/api/realtime');
      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ORDER_CREATED' && msg.payload.establishmentId === activeEstId) {
            // Hot trigger sound and pull fresh lists
            if (soundEnabled) playNewOrderSound();
            fetchDbState();
          } else if (msg.type === 'ORDER_STATUS_CHANGED' && msg.payload.establishmentId === activeEstId) {
            fetchDbState();
          }
        } catch (e) {
          // ignore parsing error
        }
      };
    } catch (e) {
      console.error('SSE connection failed in admin', e);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [currentUser, activeEstId, soundEnabled]);

  // Transition order progress (RF-A05)
  const handleAdvanceStatus = async (order: Order) => {
    let nextStatus: OrderStatus = 'Recibido';
    if (order.status === 'Recibido') nextStatus = 'En preparación';
    else if (order.status === 'En preparación') nextStatus = 'Listo';
    else if (order.status === 'Listo') nextStatus = 'Entregado';
    else return;

    try {
      const res = await fetch(`/api/orders/${order.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: nextStatus })
      });
      if (res.ok) {
        fetchDbState();
        if (selectedOrder?.id === order.id) {
          const updated = await res.json();
          setSelectedOrder(updated);
        }
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Trigger Cancel logic with optional desactived item integration (RF-A06, RF-A07)
  const handleCancelOrder = async () => {
    if (!selectedOrder) return;
    
    try {
      // 1. Cancel Order request
      const res = await fetch(`/api/orders/${selectedOrder.id}/status`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          status: 'Cancelado',
          cancellationReason: cancellationReason.trim() || 'Cancelado por el establecimiento'
        })
      });

      if (!res.ok) throw new Error('Failed to cancel order');

      // 2. If an item was toggled as cause, disable it immediately! (RF-A07)
      if (disableItemOnCancelId && currentUser?.role === 'admin') {
        const itemToDisable = menuItems.find(m => m.id === disableItemOnCancelId);
        if (itemToDisable) {
          const payload = {
            ...itemToDisable,
            available: false
          };
          await fetch('/api/menu-items', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify(payload)
          });
        }
      }

      // Refresh, close modals and play slight acoustic warning
      playAlertSound();
      fetchDbState();
      setIsCancelModalOpen(false);
      setSelectedOrder(null);
      setCancellationReason('');
      setDisableItemOnCancelId('');

    } catch (e) {
      console.error(e);
      alert('Error al cancelar el pedido.');
    }
  };

  // Menu Item mutations (CRUD)
  const handleSaveMenuItem = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingItem || !editingItem.name || editingItem.price === undefined) return;

    const payload = {
      ...editingItem,
      establishmentId: activeEstId,
      id: editingItem.id || 'item-' + Math.random().toString(36).substring(2, 9),
      imageUrl: editingItem.imageUrl || 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200',
      available: editingItem.available !== undefined ? editingItem.available : true
    };

    try {
      const res = await fetch('/api/menu-items', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchDbState();
        setIsItemModalOpen(false);
        setEditingItem(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteMenuItem = async (itemId: string) => {
    if (!confirm('¿Seguro que deseas eliminar este ítem? La acción es irreversible.')) return;
    try {
      const res = await fetch(`/api/menu-items/${itemId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) fetchDbState();
    } catch (e) {
      console.error(e);
    }
  };

  // Category Mutations (CRUD)
  const handleSaveCategory = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingCategory || !editingCategory.name) return;

    const payload = {
      ...editingCategory,
      establishmentId: activeEstId,
      id: editingCategory.id || 'cat-' + Math.random().toString(36).substring(2, 9),
      order: editingCategory.order || (categories.length + 1)
    };

    try {
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchDbState();
        setIsCategoryModalOpen(false);
        setEditingCategory(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteCategory = async (catId: string) => {
    if (!confirm('¿Eliminar esta categoría? Esto borrará también los ítems asignados a ella.')) return;
    try {
      const res = await fetch(`/api/categories/${catId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) fetchDbState();
    } catch (e) {
      console.error(e);
    }
  };

  // Table Mutations (CRUD)
  const handleSaveTable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingTable || !editingTable.name) return;

    const payload = {
      ...editingTable,
      establishmentId: activeEstId,
      id: editingTable.id || 'tab-' + Math.random().toString(36).substring(2, 9),
      active: editingTable.active !== undefined ? editingTable.active : true
    };

    try {
      const res = await fetch('/api/tables', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
      });
      if (res.ok) {
        fetchDbState();
        setIsTableModalOpen(false);
        setEditingTable(null);
      }
    } catch (e) {
      console.error(e);
    }
  };

  const handleDeleteTable = async (tableId: string) => {
    if (!confirm('¿Seguro quieres eliminar esta mesa?')) return;
    try {
      const res = await fetch(`/api/tables/${tableId}`, {
        method: 'DELETE',
        credentials: 'include'
      });
      if (res.ok) fetchDbState();
    } catch (e) {
      console.error(e);
    }
  };

  // Calculate table stats and total items
  const activeOrdersList = useMemo(() => {
    return orders.filter(o => o.status !== 'Entregado' && o.status !== 'Cancelado');
  }, [orders]);

  const historyOrdersList = useMemo(() => {
    let list = orders.filter(o => o.status === 'Entregado' || o.status === 'Cancelado');
    if (historyTableFilter !== 'all') {
      list = list.filter(o => o.tableId === historyTableFilter);
    }
    // Sort reverse chronological
    return list.sort((a,b) => new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime());
  }, [orders, historyTableFilter]);

  // Calculate earnings of delivered orders (RF-A12)
  const totalDayRevenue = useMemo(() => {
    const delivered = orders.filter(o => o.status === 'Entregado');
    return delivered.reduce((sum, ord) => {
      const ordTotal = ord.items.reduce((itemSum, item) => itemSum + (item.price * item.quantity), 0);
      return sum + ordTotal;
    }, 0);
  }, [orders]);

  // Waiting elapsed timer helper
  const getWaitingTime = (createdAt: string) => {
    const elapsedMs = Date.now() - new Date(createdAt).getTime();
    const mins = Math.floor(elapsedMs / (60 * 1000));
    if (mins < 1) return 'Menos de 1 min';
    return `${mins} min`;
  };

  // Sorter / Filtered items for Menu view
  const filteredMenuItems = useMemo(() => {
    let list = menuItems;
    if (menuCatFilter !== 'all') {
      list = list.filter(item => item.categoryId === menuCatFilter);
    }
    if (menuSearch.trim()) {
      const q = menuSearch.toLowerCase();
      list = list.filter(item => item.name.toLowerCase().includes(q) || item.description.toLowerCase().includes(q));
    }
    return list;
  }, [menuItems, menuCatFilter, menuSearch]);

  const activeEstablishment = useMemo(() => {
    return establishments.find(e => e.id === activeEstId) || null;
  }, [establishments, activeEstId]);

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(price);
  };

  // Download tent card QR Code canvas image helpers (RF-A10)
  const triggerQrDownload = (table: Table) => {
    const cleanOrigin = window.location.origin;
    const pathUrl = `${cleanOrigin}/?establishment=${activeEstId}&table=${table.id}`;
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=400x400&data=${encodeURIComponent(pathUrl)}`;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      // Draw a printable table tent sheet with canvas
      const canvas = document.createElement('canvas');
      canvas.width = 600;
      canvas.height = 800;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;

      // Fill elegant background
      ctx.fillStyle = '#FCFAF7';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Draw aesthetic outer frame
      ctx.lineWidth = 15;
      ctx.strokeStyle = activeEstablishment?.accentColor || '#1f2937';
      ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

      // Inner elegant fine line
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#d1d5db';
      ctx.strokeRect(35, 35, canvas.width - 70, canvas.height - 70);

      // Title header
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 36px serif';
      ctx.textAlign = 'center';
      ctx.fillText(activeEstablishment?.name || 'Mi Menú', canvas.width / 2, 100);

      // Subtitle Instructions
      ctx.fillStyle = '#4b5563';
      ctx.font = 'semibold 20px sans-serif';
      ctx.fillText('MENÚ DIGITAL DE MESA', canvas.width / 2, 140);

      // Accent colored line separator
      ctx.fillStyle = activeEstablishment?.accentColor || '#1f2937';
      ctx.fillRect((canvas.width / 2) - 100, 160, 200, 4);

      // Draw active QR code centered
      ctx.drawImage(img, (canvas.width - 320) / 2, 210, 320, 320);

      // Table Label Banner
      ctx.fillStyle = '#111827';
      ctx.font = 'bold 32px sans-serif';
      ctx.fillText(table.name, canvas.width / 2, 590);

      // Slogan footer
      ctx.fillStyle = '#4b5563';
      ctx.font = 'italic 18px sans-serif';
      ctx.fillText('1. Escanea el código QR con tu celular', canvas.width / 2, 660);
      ctx.fillText('2. Elige tus platos e ingresa notas especiales', canvas.width / 2, 690);
      ctx.fillText('3. ¡Envía tu pedido y listo! Lo llevamos a tu mesa.', canvas.width / 2, 720);

      // Trigger standard browser image file save
      const dataUrl = canvas.toDataURL('image/png');
      const dLink = document.createElement('a');
      dLink.download = `QR_Mesa_${table.name.replace(/\s+/g, '_')}.png`;
      dLink.href = dataUrl;
      dLink.click();
    };
    img.src = qrUrl;
  };

  // Authenticated login screen with multi-tenant account selection
  if (!currentUser) {
    const demoAccounts = [
      {
        tenant: 'El Bodegón de Palermo',
        tenantId: 'bodegon-palermo',
        badge: '🍷 Bodegón',
        accounts: [
          { name: 'Carolina', role: 'Admin / Dueña', email: 'carolina@mimenu.com', pass: 'admin', key: 'carolina' },
          { name: 'Tomás', role: 'Mesero', email: 'tomas@mimenu.com', pass: 'mesero', key: 'tomas' },
        ]
      },
      {
        tenant: 'Café & Co. Speakeasy',
        tenantId: 'cafe-speakeasy',
        badge: '☕ Café Speakeasy',
        accounts: [
          { name: 'Martín', role: 'Admin / Encargado', email: 'martin@mimenu.com', pass: 'admin', key: 'martin' },
          { name: 'Sofía', role: 'Mesera', email: 'sofia@mimenu.com', pass: 'mesero', key: 'sofia' },
        ]
      }
    ];

    const fillAndLogin = (email: string, pass: string) => {
      setLoginEmail(email);
      setLoginPassword(pass);
      setLoginError('');
      doLogin(email, pass);
    };

    let selectedUserKey = '';
    if (loginEmail === 'carolina@mimenu.com') selectedUserKey = 'carolina';
    else if (loginEmail === 'tomas@mimenu.com') selectedUserKey = 'tomas';
    else if (loginEmail === 'martin@mimenu.com') selectedUserKey = 'martin';
    else if (loginEmail === 'sofia@mimenu.com') selectedUserKey = 'sofia';

    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 selection:bg-amber-500 selection:text-zinc-950 font-sans">
        <div id="login-container" className="max-w-md w-full bg-zinc-900 border border-zinc-800 rounded-none p-8 relative overflow-hidden">
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-white"></div>

          <div className="text-center mb-6">
            <h1 className="text-xl font-black text-white tracking-widest flex items-center justify-center space-x-2.5 uppercase">
              <ClipboardList className="w-5 h-5 text-white" />
              <span>Mi Menu · Gestión</span>
            </h1>
            <p className="text-[10px] font-mono tracking-wider uppercase text-zinc-500 mt-2">
              Soporte multi-establecimiento & comandas QR
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-2 font-mono">
                Seleccionar Establecimiento & Cuenta
              </label>
              <select
                id="demo-user-selector"
                value={selectedUserKey}
                disabled={isLoggingIn}
                className="w-full bg-zinc-950 border border-zinc-800 p-3.5 rounded-none text-xs text-zinc-200 focus:outline-none focus:border-white font-mono uppercase tracking-wide cursor-pointer disabled:opacity-50"
                onChange={(e) => {
                  const val = e.target.value;
                  if (val === 'carolina') fillAndLogin('carolina@mimenu.com', 'admin');
                  else if (val === 'tomas') fillAndLogin('tomas@mimenu.com', 'mesero');
                  else if (val === 'martin') fillAndLogin('martin@mimenu.com', 'admin');
                  else if (val === 'sofia') fillAndLogin('sofia@mimenu.com', 'mesero');
                }}
              >
                <option value="" disabled>-- Selecciona un usuario --</option>
                <optgroup label="🍷 El Bodegón de Palermo">
                  <option value="carolina">Carolina (Admin / Dueña)</option>
                  <option value="tomas">Tomás (Mesero)</option>
                </optgroup>
                <optgroup label="☕ Café & Co. Speakeasy">
                  <option value="martin">Martín (Admin - Café & Co.)</option>
                  <option value="sofia">Sofía (Mesera - Café & Co.)</option>
                </optgroup>
              </select>
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-2 font-mono">
                Correo Electrónico
              </label>
              <input
                id="input-login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                disabled={isLoggingIn}
                className="w-full bg-zinc-950 border border-zinc-800 p-3.5 rounded-none text-xs text-zinc-200 focus:outline-none focus:border-white font-medium disabled:opacity-50"
                required
              />
            </div>

            <div>
              <label className="block text-[10px] font-black text-zinc-300 uppercase tracking-widest mb-2 font-mono">
                Contraseña
              </label>
              <input
                id="input-login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={isLoggingIn}
                className="w-full bg-zinc-950 border border-zinc-800 p-3.5 rounded-none text-xs text-zinc-200 focus:outline-none focus:border-white font-mono disabled:opacity-50"
                required
              />
            </div>

            {loginError && (
              <p className="text-[11px] text-rose-400 bg-rose-950/10 border border-rose-900/30 p-3 rounded-none flex items-center font-medium">
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0 text-rose-400" />
                {loginError}
              </p>
            )}

            <button
              id="btn-login"
              type="submit"
              disabled={isLoggingIn}
              className="w-full py-4 rounded-none font-black text-xs text-black bg-white hover:bg-zinc-200 uppercase tracking-[0.2em] cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center space-x-2"
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-black" />
                  <span>Ingresando...</span>
                </>
              ) : (
                <span>Acceder al Panel Admin</span>
              )}
            </button>
          </form>

          {/* Direct Tenant Quick Selection Buttons */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 space-y-3">
            <p className="text-[10px] font-black text-zinc-400 uppercase tracking-widest font-mono">
              Acceso Rápido por Establecimiento:
            </p>
            <div className="space-y-3">
              {demoAccounts.map((group) => (
                <div key={group.tenantId} className="bg-zinc-950 border border-zinc-800/80 p-3 space-y-2">
                  <span className="text-[10px] font-bold text-amber-500 font-mono uppercase tracking-wider block">
                    {group.badge} — {group.tenant}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {group.accounts.map((acc) => (
                      <button
                        key={acc.key}
                        type="button"
                        onClick={() => fillAndLogin(acc.email, acc.pass)}
                        className={`text-left p-2 border transition text-[10px] font-mono cursor-pointer ${
                          loginEmail === acc.email
                            ? 'bg-zinc-800 border-white text-white font-bold'
                            : 'bg-zinc-900 border-zinc-800 text-zinc-400 hover:text-white hover:border-zinc-700'
                        }`}
                      >
                        <p className="text-white font-bold">{acc.name} ({acc.role})</p>
                        <p className="text-[9px] text-zinc-500 truncate">{acc.email}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="mt-6 pt-4 border-t border-zinc-800/80 flex items-center justify-between text-[10px] text-zinc-550 font-mono uppercase tracking-wider">
            <span>MVP v0.2</span>
            <button 
              onClick={onBackToLauncher}
              className="text-white hover:underline hover:text-zinc-300 font-bold"
            >
              Volver al Lanzador
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-white flex flex-col font-sans selection:bg-white selection:text-zinc-950">
      
      {/* Dynamic Multi-tenant Header (RF-A11) */}
      <header className="bg-zinc-950 border-b border-zinc-850 sticky top-0 z-40">
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center space-x-3">
            <ClipboardList className="w-5 h-5 text-white" />
            <div>
              <h1 className="text-sm font-black tracking-widest text-white uppercase flex items-center">
                Mi Menú · Panel
                <span className="ml-2.5 text-[9px] bg-zinc-900 text-zinc-300 border border-zinc-800 px-2 py-0.5 rounded-none font-mono font-bold tracking-widest uppercase">
                  {currentUser.email} · {currentUser.role === 'admin' ? 'Admin' : 'Mesero'}
                </span>
              </h1>
            </div>
          </div>

          {/* Active establishment — fixed to the authenticated tenant, not switchable (RF-A11) */}
          <div className="flex items-center gap-2">
            <span className="text-[10px] text-zinc-500 font-mono uppercase bg-zinc-950 border border-zinc-850 py-1.5 px-3.5 rounded-none flex items-center tracking-wider">
              <MapPin className="w-3.5 h-3.5 mr-1.5 text-zinc-400" />
              Establecimiento Activo:
            </span>
            <span
              id="establishment-active-label"
              className="bg-zinc-950 border border-zinc-850 text-xs px-3 py-2 rounded-none text-white font-bold"
            >
              {activeEstablishment?.name || activeEstId}
            </span>
          </div>

          <div className="flex items-center gap-3 self-end md:self-auto">
            {/* Seed demo data button */}
            <button
              id="btn-seed-demo-data"
              onClick={handleSeedDemoData}
              disabled={isSeeding}
              className="px-3 py-2 text-xs font-mono font-bold bg-zinc-900 border border-zinc-800 hover:border-amber-500 text-zinc-200 hover:text-white transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50 rounded-none"
              title="Cargar o restaurar datos demo de la cafetería y el bodegón"
            >
              <RefreshCw className={`w-3.5 h-3.5 text-amber-500 ${isSeeding ? 'animate-spin' : ''}`} />
              <span className="hidden sm:inline">Cargar Datos Demo</span>
            </button>

            {/* Style / Theme selector button (visible in admin panel) */}
            <ThemeTriggerButton variant="inline" />

            {/* Tone Toggle switch */}
            <button
              id="btn-toggle-sound"
              onClick={() => setSoundEnabled(prev => !prev)}
              className={`p-2 rounded-none border flex items-center justify-center transition-all ${
                soundEnabled 
                  ? 'bg-zinc-900 border-zinc-750 text-amber-500' 
                  : 'bg-zinc-950 border-zinc-850 text-zinc-600'
              }`}
              title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido de pedidos'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              id="btn-admin-logout"
              onClick={handleLogout}
              className="px-3.5 py-2 rounded-none bg-zinc-900 border border-zinc-805 hover:bg-zinc-850 text-xs font-black uppercase tracking-wider text-zinc-400 hover:text-white flex items-center transition cursor-pointer"
            >
              <Power className="w-3.5 h-3.5 mr-1" />
              Salir
            </button>
          </div>
        </div>
      </header>

      {/* Primary views split */}
      <div className="flex-1 max-w-7xl w-full mx-auto px-4 md:px-6 py-6 flex flex-col md:flex-row gap-6">
        
        {/* Left Side: Layout Navigation rail */}
        <aside className="w-full md:w-56 shrink-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto scrollbar-none pb-2 md:pb-0 border-b md:border-b-0 md:border-r border-zinc-850 pr-0 md:pr-4">
          <button
            id="tab-btn-pedidos"
            onClick={() => setActiveTab('pedidos')}
            className={`px-4 py-3 rounded-none text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center justify-between transition min-w-[124px] md:w-full shrink-0 border ${
              activeTab === 'pedidos' 
                ? 'bg-white text-black border-white' 
                : 'text-zinc-450 border-transparent bg-transparent hover:text-white hover:border-zinc-800'
            }`}
          >
            <span className="flex items-center">
              <Bell className="w-4 h-4 mr-2.5" />
              Monitor Pedidos
            </span>
            {activeOrdersList.length > 0 && (
              <span id="active-orders-counter" className="text-[9px] font-black bg-red-600 text-white border border-red-500 px-1.5 py-0.5 rounded-none font-mono animate-bounce shrink-0">
                {activeOrdersList.length}
              </span>
            )}
          </button>

          {/* Guard sections dynamically based on waiter role limitations (RF-A13) */}
          {currentUser.role === 'admin' ? (
            <>
              <button
                id="tab-btn-diseño_mesas"
                onClick={() => setActiveTab('diseño_mesas')}
                className={`px-4 py-3 rounded-none text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
                  activeTab === 'diseño_mesas' 
                    ? 'bg-white text-black border-white' 
                    : 'text-zinc-450 border-transparent bg-transparent hover:text-white hover:border-zinc-800'
                }`}
              >
                <Users className="w-4 h-4 mr-2.5" />
                Mesas & QRs
              </button>

              <button
                id="tab-btn-menu_items"
                onClick={() => setActiveTab('menu_items')}
                className={`px-4 py-3 rounded-none text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
                  activeTab === 'menu_items' 
                    ? 'bg-white text-black border-white' 
                    : 'text-zinc-450 border-transparent bg-transparent hover:text-white hover:border-zinc-800'
                }`}
              >
                <Utensils className="w-4 h-4 mr-2.5" />
                Catálogo Menú
              </button>
            </>
          ) : (
            <div className="hidden md:flex flex-col items-center p-4 bg-zinc-900/30 rounded-none border border-zinc-850 text-center space-y-1.5 my-2">
              <ShieldAlert className="w-4.5 h-4.5 text-zinc-500" />
              <p className="text-[9px] font-black uppercase font-mono text-zinc-400 tracking-wider">Acceso Mesero</p>
              <p className="text-[9px] text-zinc-550 font-medium">Catálogo de Menú y Mesas bloqueados</p>
            </div>
          )}

          <button
            id="tab-btn-historial"
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-3 rounded-none text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
              activeTab === 'historial' 
                ? 'bg-white text-black border-white' 
                : 'text-zinc-450 border-transparent bg-transparent hover:text-white hover:border-zinc-800'
            }`}
          >
            <TrendingUp className="w-4 h-4 mr-2.5" />
            Historial de Cierre
          </button>

          <button
            id="tab-btn-launcher"
            onClick={onBackToLauncher}
            className="md:mt-auto px-4 py-3 rounded-none text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center text-zinc-400 hover:bg-zinc-900 hover:text-white transition min-w-[124px] md:w-full shrink-0 border border-transparent"
          >
            <X className="w-4 h-4 mr-2.5" />
            Lanzador Demo
          </button>
        </aside>

        {/* Right Side: Tab Panel Content Container */}
        <main className="flex-1 min-w-0">
          
          {/* TAB 1: Real-time orders monitor */}
          {activeTab === 'pedidos' && (
            <div className="space-y-6">
              
              {/* Header metrics card */}
              <div className="bg-zinc-900/40 border border-zinc-850 rounded-none p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 my-0.5">
                  <h2 className="text-sm font-black uppercase text-white tracking-widest">Monitor de Pedidos Activos</h2>
                  <p className="text-xs text-zinc-400 font-medium">Atención de comandas en tiempo real. Utiliza los controles de avance y cancelación.</p>
                </div>
                
                <div className="flex items-center gap-2 bg-zinc-950 px-4 py-2 border border-zinc-850 rounded-none font-mono">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">En línea (SSE)</span>
                </div>
              </div>

              {/* Grid of active orders arranged nicely */}
              {activeOrdersList.length === 0 ? (
                <div className="text-center py-24 bg-zinc-900/30 border border-zinc-850 rounded-none p-6">
                  <Bell className="w-10 h-10 text-zinc-700 mx-auto mb-4" />
                  <h3 className="text-xs font-black uppercase tracking-wider text-white mb-1.5">Tranquilidad absoluta</h3>
                  <p className="text-xs text-zinc-400 max-w-sm mx-auto leading-relaxed font-semibold">No hay pedidos pendientes para este local en este momento. Escanea un código QR como Cliente para enviar una comanda.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  {activeOrdersList.map((ord) => {
                    const totalOrderPrice = ord.items.reduce((acc, i) => acc + (i.price * i.quantity), 0);
                    return (
                      <motion.div
                        id={`order-card-${ord.id}`}
                        key={ord.id}
                        initial={{ opacity: 0, scale: 0.98 }}
                        animate={{ opacity: 1, scale: 1 }}
                        className="bg-zinc-900/30 border border-zinc-850 p-4.5 rounded-none flex flex-col justify-between hover:border-zinc-750 transition"
                      >
                        {/* Upper Section */}
                        <div className="space-y-4">
                          <div className="flex items-center justify-between border-b border-zinc-850 pb-3">
                            <div>
                              <h4 className="font-black text-sm text-white tracking-wide uppercase">{ord.tableName}</h4>
                              <p className="text-[10px] text-zinc-500 mt-1 flex items-center font-mono">
                                <Clock className="w-3.5 h-3.5 mr-1 text-zinc-500" />
                                Espera: {getWaitingTime(ord.createdAt)}
                              </p>
                            </div>

                            <span className={`text-[9px] font-black font-mono uppercase px-2.5 py-1 rounded-none border tracking-widest flex items-center space-x-1 ${
                              ord.status === 'Recibido' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                              ord.status === 'En preparación' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                              'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
                            }`}>
                              <span>{ord.status}</span>
                            </span>
                          </div>

                          {/* Items listing */}
                          <div className="space-y-3">
                            {ord.items.map((i) => (
                              <div key={i.id} className="text-xs">
                                <div className="flex items-start justify-between">
                                  <p className="font-medium text-zinc-100">
                                    <span className="font-mono text-amber-500 font-bold mr-2">{i.quantity}x</span>
                                    {i.name}
                                  </p>
                                  <span className="text-[10px] font-mono text-zinc-500 font-bold">{formatPrice(i.price * i.quantity)}</span>
                                </div>
                                {i.comment && (
                                  <div className="mt-1.5 ml-6 px-2 py-1.5 border-l-2 border-amber-500 bg-amber-500/5 text-amber-400 text-[10px] font-medium leading-normal rounded-none max-w-xs truncate italic">
                                    "{i.comment}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Lower section actions */}
                        <div className="mt-6 border-t border-zinc-850/80 pt-4 flex items-center justify-between gap-3">
                          <div>
                            <span className="text-[9px] text-zinc-550 font-mono uppercase tracking-widest block font-bold">Monto total</span>
                            <span id={`order-total-${ord.id}`} className="font-mono text-sm font-black text-amber-500">{formatPrice(totalOrderPrice)}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              id={`btn-cancel-order-${ord.id}`}
                              onClick={() => {
                                setSelectedOrder(ord);
                                setIsCancelModalOpen(true);
                              }}
                              className="px-3 py-2 rounded-none text-xs font-black uppercase tracking-widest text-rose-400 hover:bg-rose-950/20 border border-zinc-800 transition cursor-pointer"
                              title="Cancelar Pedido con justificación"
                            >
                              Cancelar
                            </button>

                            <button
                              id={`btn-advance-order-${ord.id}`}
                              onClick={() => handleAdvanceStatus(ord)}
                              className="px-4 py-2 rounded-none text-xs font-black text-zinc-950 bg-white hover:bg-zinc-200 transition cursor-pointer uppercase font-mono tracking-widest"
                            >
                              {ord.status === 'Recibido' ? 'Preparar' :
                               ord.status === 'En preparación' ? 'Listo' :
                               'Entregar'}
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Table design & generating printable QRs (RF-A10) */}
          {activeTab === 'diseño_mesas' && currentUser.role === 'admin' && (
            <div className="space-y-6">
              
              <div className="bg-zinc-900/40 border border-zinc-850 rounded-none p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 my-0.5">
                  <h2 className="text-sm font-black uppercase text-white tracking-widest">Mesas e Impresión QR</h2>
                  <p className="text-xs text-zinc-400 font-medium">Administra los códigos QR de cada mesa. Los códigos enlazan automáticamente la mesa con el pedido.</p>
                </div>

                <button
                  id="btn-create-table"
                  onClick={() => {
                    setEditingTable({ name: '', active: true });
                    setIsTableModalOpen(true);
                  }}
                  className="px-4.5 py-3 rounded-none text-xs font-black text-black bg-white hover:bg-zinc-200 transition flex items-center space-x-2 cursor-pointer uppercase tracking-widest"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Nueva Mesa</span>
                </button>
              </div>

              {/* Grid of tables */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-5">
                {tables.map((table) => {
                  const cleanOrigin = window.location.origin;
                  const finalClientUrl = `${cleanOrigin}/?establishment=${activeEstId}&table=${table.id}`;
                  const qrApiUrl = `https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(finalClientUrl)}`;

                  return (
                    <div
                      id={`table-card-${table.id}`}
                      key={table.id}
                      className={`bg-zinc-900/30 border ${
                        table.active ? 'border-zinc-850' : 'border-zinc-900 opacity-40'
                      } rounded-none p-4.5 flex flex-col justify-between`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className="font-black text-xs text-white uppercase tracking-wider">{table.name}</h4>
                          <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 rounded-none border ${
                            table.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-zinc-900 border-zinc-800 text-zinc-550'
                          }`}>
                            {table.active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>

                        {/* Interactive mini QR placard */}
                        <div className="bg-white p-2 text-center rounded-none border border-zinc-800 max-w-[124px] mx-auto select-none flex flex-col items-center justify-center">
                          <img 
                            src={qrApiUrl} 
                            alt={`QR ${table.name}`} 
                            referrerPolicy="no-referrer"
                            className="w-24 h-24" 
                          />
                        </div>
                        
                        <p className="text-[10px] text-zinc-550 font-mono text-center select-all truncate px-1">
                          {finalClientUrl.slice(0, 30)}...
                        </p>
                      </div>

                      <div className="mt-4 pt-3.5 border-t border-zinc-850/80 flex items-center justify-between gap-1">
                        <button
                          id={`btn-edit-table-${table.id}`}
                          onClick={() => {
                            setEditingTable(table);
                            setIsTableModalOpen(true);
                          }}
                          className="p-2.5 rounded-none text-zinc-400 hover:text-white bg-zinc-950 border border-zinc-850 hover:bg-zinc-900 transition"
                          title="Editar mesa"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>

                        <button
                          id={`btn-delete-table-${table.id}`}
                          onClick={() => handleDeleteTable(table.id)}
                          className="p-2.5 rounded-none text-rose-450 hover:text-rose-400 bg-zinc-950 border border-zinc-850 hover:bg-zinc-900 transition"
                          title="Eliminar mesa"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>

                        <button
                          id={`btn-download-qr-${table.id}`}
                          onClick={() => triggerQrDownload(table)}
                          className="px-3 py-1.5 rounded-none bg-zinc-950 border border-zinc-800 hover:bg-white hover:text-black text-zinc-300 text-[10px] font-black uppercase tracking-widest transition flex items-center space-x-1.5 cursor-pointer"
                          title="Descargar carpa de mesa tamaño grande listo para imprimir"
                        >
                          <Download className="w-3 h-3" />
                          <span>Descargar Carpa</span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* TAB 3: Menu Catalog Management (CRUD) */}
          {activeTab === 'menu_items' && currentUser.role === 'admin' && (
            <div className="space-y-6">
              
              {/* Toolbar */}
              <div className="bg-zinc-900/40 border border-zinc-850 rounded-none p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 my-0.5">
                  <h2 className="text-sm font-black uppercase text-white tracking-widest">Catálogo de Categorías y Platos</h2>
                  <p className="text-xs text-zinc-400 font-medium">Sube platos, ajusta precios e inhabilita instantáneamente los insumos agotados.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    id="btn-add-category"
                    onClick={() => {
                      setEditingCategory({ name: '' });
                      setIsCategoryModalOpen(true);
                    }}
                    className="px-4.5 py-3 rounded-none text-xs font-black text-white bg-zinc-900 border border-zinc-800 hover:bg-zinc-850 transition flex items-center space-x-1.5 cursor-pointer uppercase tracking-widest"
                  >
                    <Layers className="w-4 h-4" />
                    <span>Categorías</span>
                  </button>

                  <button
                    id="btn-add-menu-item"
                    onClick={() => {
                      setEditingItem({ name: '', description: '', price: 0, available: true, categoryId: categories[0]?.id || '' });
                      setIsItemModalOpen(true);
                    }}
                    disabled={categories.length === 0}
                    className="px-4.5 py-3 bg-white hover:bg-zinc-200 disabled:bg-zinc-900 disabled:text-zinc-700 text-black text-xs font-black rounded-none transition flex items-center space-x-2 cursor-pointer uppercase tracking-widest"
                  >
                    <Plus className="w-4 h-4" />
                    <span>Nuevo Item</span>
                  </button>
                </div>
              </div>

              {/* Filters selector */}
              <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
                <div className="relative w-full sm:max-w-xs">
                  <input
                    id="input-filter-menu"
                    type="text"
                    placeholder="Filtrar por nombre..."
                    value={menuSearch}
                    onChange={(e) => setMenuSearch(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-850 py-3 pl-10 pr-4 rounded-none text-xs text-white focus:outline-none focus:border-white font-medium"
                  />
                  <Search className="w-4 h-4 text-zinc-550 absolute left-3.5 top-3.5" />
                </div>

                <div className="flex space-x-2 overflow-x-auto w-full sm:w-auto scrollbar-none py-1">
                  <button
                    id="filter-cat-all"
                    onClick={() => setMenuCatFilter('all')}
                    className={`px-3.5 py-2 rounded-none text-[10px] font-black uppercase tracking-wider transition-all border ${
                      menuCatFilter === 'all' 
                        ? 'bg-white text-black border-white' 
                        : 'bg-zinc-900 text-zinc-400 border-zinc-850 hover:border-zinc-805 hover:text-white'
                    }`}
                  >
                    Todos
                  </button>
                  {categories.map((cat) => (
                    <button
                      id={`filter-cat-${cat.id}`}
                      key={cat.id}
                      onClick={() => setMenuCatFilter(cat.id)}
                      className={`px-3.5 py-2 rounded-none text-[10px] font-black uppercase tracking-wider transition-all border ${
                        menuCatFilter === cat.id 
                          ? 'bg-white text-black border-white' 
                          : 'bg-zinc-900 text-zinc-400 border-zinc-850 hover:border-zinc-805 hover:text-white'
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items Table List */}
              <div className="bg-zinc-900/35 border border-zinc-850 rounded-none overflow-hidden">
                
                {/* Visual view of Categories manager inside panel */}
                <div className="p-4 bg-zinc-950 border-b border-zinc-850 flex items-center justify-between flex-wrap gap-2">
                  <span className="text-[10px] tracking-wider font-mono font-black text-zinc-450 uppercase">
                    Categorías registradas del local ({categories.length})
                  </span>
                </div>

                {categories.length === 0 ? (
                  <p className="text-xs text-zinc-500 p-4 italic text-center">Debes crear al menos una categoría primero.</p>
                ) : (
                  <div className="p-4 flex flex-wrap gap-2.5">
                    {categories.map(cat => (
                      <span 
                        id={`cat-badge-${cat.id}`}
                        key={cat.id} 
                        className="bg-zinc-950 text-zinc-300 py-1.5 px-3 rounded-none text-xs font-medium border border-zinc-850 flex items-center font-mono uppercase tracking-wide"
                      >
                        <span className="mr-2 text-zinc-500 font-bold">#{cat.order}</span>
                        <span className="font-semibold">{cat.name}</span>
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            setIsCategoryModalOpen(true);
                          }}
                          className="ml-2.5 p-1 text-zinc-500 hover:text-white rounded-none hover:bg-zinc-900 transition"
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="ml-1.5 p-1 text-rose-500 hover:text-rose-400 rounded-none hover:bg-zinc-900 transition"
                        >
                          <Trash className="w-3.5 h-3.5" />
                        </button>
                      </span>
                    ))}
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse">
                    <thead>
                      <tr className="border-b border-zinc-850 bg-zinc-950 text-zinc-500 font-mono text-[9px] uppercase tracking-widest font-bold">
                        <th className="p-4">Bocado / Detalle</th>
                        <th className="p-4">Categoría</th>
                        <th className="p-4">Monto</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-850 text-xs">
                      {filteredMenuItems.map((item) => {
                        const cat = categories.find(c => c.id === item.categoryId);
                        return (
                          <tr id={`menu-item-row-${item.id}`} key={item.id} className="hover:bg-zinc-900/30">
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className="w-10 h-10 rounded-none object-cover bg-zinc-950 border border-zinc-805 shrink-0"
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200';
                                  }}
                                />
                                <div className="min-w-0 max-w-[180px] sm:max-w-xs">
                                  <p className="font-bold text-white truncate">{item.name}</p>
                                  <p className="text-[10px] text-zinc-550 truncate mt-0.5">{item.description}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className="font-mono text-[9px] bg-zinc-950 border border-zinc-850 text-zinc-350 font-black px-2 py-0.5 rounded-none uppercase tracking-wider">
                                {cat ? cat.name : 'Descargado'}
                              </span>
                            </td>
                            <td className="p-4 font-mono font-bold text-zinc-300">{formatPrice(item.price)}</td>
                            <td className="p-4">
                              <button
                                id={`btn-toggle-availability-${item.id}`}
                                onClick={async () => {
                                  try {
                                    const payload = { ...item, available: !item.available };
                                    await fetch('/api/menu-items', {
                                      method: 'POST',
                                      headers: { 'Content-Type': 'application/json' },
                                      credentials: 'include',
                                      body: JSON.stringify(payload)
                                    });
                                    fetchDbState();
                                  } catch (e) {
                                    console.error(e);
                                  }
                                }}
                                className={`px-2 py-0.5 rounded-none text-[9px] font-black border tracking-widest uppercase cursor-pointer ${
                                  item.available 
                                    ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' 
                                    : 'bg-rose-500/10 text-rose-400 border-rose-500/20'
                                }`}
                                title="Hacer clic para cambiar disponibilidad al instante"
                              >
                                {item.available ? 'Disponible' : 'Agotado'}
                              </button>
                            </td>
                            <td className="p-4 text-right">
                              <div className="flex items-center justify-end space-x-1.5">
                                <button
                                  id={`btn-edit-item-${item.id}`}
                                  onClick={() => {
                                    setEditingItem(item);
                                    setIsItemModalOpen(true);
                                  }}
                                  className="p-1 px-2 rounded-none hover:bg-zinc-850 text-zinc-350 hover:text-white border border-zinc-850 transition"
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`btn-delete-item-${item.id}`}
                                  onClick={() => handleDeleteMenuItem(item.id)}
                                  className="p-1 px-2 rounded-none hover:bg-zinc-850/80 text-rose-450 hover:text-rose-450 border border-zinc-850 transition"
                                >
                                  <Trash className="w-3.5 h-3.5" />
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })}

                      {filteredMenuItems.length === 0 && (
                        <tr>
                          <td colSpan={5} className="py-8 text-center text-zinc-550 font-bold italic">
                            No se encontraron platos.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 4: Daily Revenue list */}
          {activeTab === 'historial' && (
            <div className="space-y-6">
              
              <div className="bg-zinc-900/40 border border-zinc-850 rounded-none p-5 flex flex-wrap items-center justify-between gap-4">
                <div className="space-y-1 my-0.5">
                  <h2 className="text-sm font-black uppercase text-white tracking-widest">Historial de Turno & Cierre</h2>
                  <p className="text-xs text-zinc-400 font-medium">Revisa las finanzas e historial del día. En el MVP, los montos representan el total estimado de comandas entregadas.</p>
                </div>

                <div className="flex flex-col bg-zinc-950 px-4 py-2 border border-zinc-850 rounded-none font-mono text-left">
                  <span className="text-[9px] text-zinc-500 font-mono block font-black uppercase tracking-widest">Recaudación Estimada</span>
                  <span id="revenue-indicator" className="text-md font-black text-amber-500 mt-0.5">{formatPrice(totalDayRevenue)}</span>
                </div>
              </div>

              {/* Day orders list of deliveries and cancellations */}
              <div className="bg-zinc-900/35 border border-zinc-850 rounded-none shadow overflow-hidden">
                <div className="p-4 bg-zinc-950 border-b border-zinc-850 flex items-center justify-between font-mono text-[9px] text-zinc-450 tracking-widest uppercase">
                  <span>PEDIDOS ARCHIVADOS ({historyOrdersList.length})</span>
                  
                  <div className="flex items-center gap-2">
                    <span>Mesa:</span>
                    <select
                      id="history-table-filter font-mono"
                      value={historyTableFilter}
                      onChange={(e) => setHistoryTableFilter(e.target.value)}
                      className="bg-zinc-900 border border-zinc-800 text-[9px] px-2 py-1 rounded-none text-white focus:outline-none focus:border-white font-mono"
                    >
                      <option value="all">Todas</option>
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="divide-y divide-zinc-850">
                  {historyOrdersList.map((ord) => {
                    const ordTotal = ord.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    const localTime = new Date(ord.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div id={`history-row-${ord.id}`} key={ord.id} className="p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:bg-zinc-900/10 transition">
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className="font-bold text-xs text-zinc-200">{ord.tableName}</span>
                            <span className="text-[10px] text-zinc-550 font-mono">({localTime})</span>
                          </div>
                          <div className="text-xs text-slate-400 space-y-0.5">
                            {ord.items.map((i, iIdx) => (
                              <div key={i.id || iIdx}>
                                <span>{i.quantity}x {i.name}</span>
                                {i.comment && (
                                  <span className="text-[10px] text-amber-400 italic ml-2">("{i.comment}")</span>
                                )}
                              </div>
                            ))}
                          </div>
                          {ord.status === 'Cancelado' && ord.cancellationReason && (
                            <p className="text-[10px] text-rose-400 font-mono italic">
                              Motivo cancelación: "{ord.cancellationReason}"
                            </p>
                          )}
                        </div>

                        <div className="flex items-center gap-3.5 self-end sm:self-auto font-mono text-xs">
                          <span className="font-black text-zinc-200">{formatPrice(ordTotal)}</span>
                          <span className={`px-2.5 py-1 rounded-none text-[9px] font-mono font-black uppercase border ${
                            ord.status === 'Entregado' 
                              ? 'bg-zinc-900 text-zinc-400 border border-zinc-805' 
                              : 'bg-rose-950/20 text-rose-450 border border-rose-950'
                          }`}>
                            {ord.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {historyOrdersList.length === 0 && (
                    <p className="text-center py-12 text-slate-500 italic text-xs leading-none">Ningún pedido cerrado aún en este turno.</p>
                  )}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* MODAL 1: Interactive Cancellation Modal featuring item disabler (RF-A07) */}
      <AnimatePresence>
        {isCancelModalOpen && selectedOrder && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCancelModalOpen(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-850 w-full max-w-md rounded-none p-6 relative font-sans"
            >
              <div className="flex items-center space-x-2 text-rose-450 mb-4">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className="font-black text-sm uppercase tracking-wider text-white">Cancelar Pedido de {selectedOrder.tableName}</h3>
              </div>

              <div className="space-y-4 text-xs text-slate-300">
                <p>El cliente verá reflejado el estado "Cancelado" inmediatamente. Por favor especifica las razones.</p>
                
                <div>
                  <label className="block text-[10px] uppercase font-mono font-bold tracking-wider text-slate-400 mb-1">
                    Motivo (Opcional)
                  </label>
                  <input
                    id="input-cancellation-reason"
                    type="text"
                    placeholder="Ej. Insumo agotado, error de caja..."
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs text-white outline-none focus:border-white font-mono"
                  />
                </div>

                {/* RF-A07 Core feature: Disable the causing menu item instantly */}
                <div className="bg-zinc-950 border border-zinc-850 p-3.5 rounded-none space-y-2">
                  <div className="flex items-center space-x-1.5 text-amber-500 mb-1">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-[11px]">Acción Inteligente: Deshabilitar Insumo</span>
                  </div>
                  <p className="text-[10px] text-slate-400 leading-normal mb-2">
                    Si el pedido fracasó porque algún plato se agotó en cocina, elígelo abajo para marcarlo automáticamente como **Agotado / Sin stock** en el menú digital.
                  </p>

                  <div className="space-y-1.5">
                    <label className="flex items-center space-x-2 p-1 text-[10px] text-slate-400 font-mono font-bold uppercase tracking-wider">
                      <span>Selecciona el plato causante:</span>
                    </label>
                    <select
                      id="cancellation-item-disabler"
                      value={disableItemOnCancelId}
                      onChange={(e) => setDisableItemOnCancelId(e.target.value)}
                      className="w-full bg-zinc-900 border border-zinc-850 p-2 text-zinc-300 rounded-none text-xs"
                    >
                      <option value="">-- No deshabilitar ningún plato --</option>
                      {selectedOrder.items.map(item => (
                        <option key={item.id} value={item.menuItemId}>
                          {item.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-zinc-850 flex items-center justify-end space-x-2.5">
                <button
                  id="btn-cancel-modal-close"
                  onClick={() => setIsCancelModalOpen(false)}
                  className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white rounded-none bg-zinc-950 border border-zinc-850 transition cursor-pointer"
                >
                  Regresar
                </button>
                <button
                  id="btn-confirm-cancel-order"
                  onClick={handleCancelOrder}
                  className="px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-700 text-white rounded-none transition cursor-pointer"
                >
                  Confirmar Cancelación
                </button>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 2: Category Editor Modal (CRUD Categories) */}
      <AnimatePresence>
        {isCategoryModalOpen && editingCategory && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCategoryModalOpen(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-850 w-full max-w-sm rounded-none p-6 relative font-sans"
            >
              <h3 className="font-black text-sm uppercase tracking-wider mb-4 text-white">
                {editingCategory.id ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>

              <form onSubmit={handleSaveCategory} className="space-y-4 text-xs font-sans text-zinc-300">
                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-400 mb-1">
                    Nombre de Categoría
                  </label>
                  <input
                    id="input-category-name"
                    type="text"
                    required
                    value={editingCategory.name || ''}
                    onChange={(e) => setEditingCategory(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white font-mono text-white"
                    placeholder="Ej. Postres, Vinos..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-400 mb-1">
                    Orden de Visualización
                  </label>
                  <input
                    id="input-category-order"
                    type="number"
                    value={editingCategory.order || ''}
                    onChange={(e) => setEditingCategory(prev => ({ ...prev, order: parseInt(e.target.value) }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white font-mono text-white"
                    placeholder="Ej. 1"
                  />
                </div>

                <div className="pt-4 border-t border-zinc-850 flex items-center justify-end space-x-2.5">
                  <button
                    id="btn-category-modal-close"
                    type="button"
                    onClick={() => setIsCategoryModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white rounded-none bg-zinc-950 border border-zinc-850 transition cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    id="btn-category-modal-submit"
                    type="submit"
                    className="px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-white text-black hover:bg-zinc-200 rounded-none transition cursor-pointer"
                  >
                    Guardar Categoría
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 3: Menu Item Editor Modal (CRUD Dishes) */}
      <AnimatePresence>
        {isItemModalOpen && editingItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsItemModalOpen(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-850 w-full max-w-md rounded-none p-6 relative font-sans shadow-2xl overflow-y-auto max-h-[90vh]"
            >
              <h3 className="font-black text-sm uppercase tracking-wider mb-4 text-white">
                {editingItem.id ? 'Editar Ítem de Menú' : 'Crear Plato / Ítem'}
              </h3>

              <form onSubmit={handleSaveMenuItem} className="space-y-4 text-xs font-sans text-zinc-300">
                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-405 mb-1">
                    Categoría
                  </label>
                  <select
                    id="selector-item-category"
                    required
                    value={editingItem.categoryId || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, categoryId: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white text-white font-mono"
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-405 mb-1">
                    Nombre del Ítem
                  </label>
                  <input
                    id="input-item-name"
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white text-white"
                    placeholder="Ej. Suprema napolitana"
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-405 mb-1">
                    Descripción del Plato
                  </label>
                  <textarea
                    id="input-item-description"
                    required
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white leading-normal text-white"
                    placeholder="Detalla los ingredientes y proporciones..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-405 mb-1">
                      Monto de venta ($ ARS)
                    </label>
                    <input
                      id="input-item-price"
                      type="number"
                      required
                      value={editingItem.price || ''}
                      onChange={(e) => setEditingItem(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                      className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white font-mono text-white"
                    />
                  </div>

                  <div>
                    <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-405 mb-1">
                      Disponibilidad inicial
                    </label>
                    <select
                      id="selector-item-available"
                      value={editingItem.available ? 'true' : 'false'}
                      onChange={(e) => setEditingItem(prev => ({ ...prev, available: e.target.value === 'true' }))}
                      className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none text-white font-mono"
                    >
                      <option value="true">Disponible (En stock)</option>
                      <option value="false">Agotado (Sin stock)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-405 mb-1">
                    URL de la Imagen / Foto
                  </label>
                  <input
                    id="input-item-image"
                    type="url"
                    value={editingItem.imageUrl || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, imageUrl: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white font-mono text-white"
                    placeholder="https://images.unsplash.com/photo-..."
                  />
                </div>

                <div className="pt-4 border-t border-zinc-850 flex items-center justify-end space-x-2.5">
                  <button
                    id="btn-item-modal-close"
                    type="button"
                    onClick={() => setIsItemModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-404 hover:text-white rounded-none bg-zinc-950 border border-zinc-850 transition cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    id="btn-item-modal-submit"
                    type="submit"
                    className="px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-white text-black hover:bg-zinc-200 rounded-none transition cursor-pointer"
                  >
                    Guardar Ítem
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL 4: Table Editor Modal (CRUD Tables) */}
      <AnimatePresence>
        {isTableModalOpen && editingTable && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsTableModalOpen(false)}
              className="absolute inset-0 bg-black"
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-zinc-900 border border-zinc-850 w-full max-w-sm rounded-none p-6 relative font-sans shadow-2xl"
            >
              <h3 className="font-black text-sm uppercase tracking-wider mb-4 text-white">
                {editingTable.id ? 'Editar Mesa' : 'Nueva Mesa QR'}
              </h3>

              <form onSubmit={handleSaveTable} className="space-y-4 text-xs font-sans text-zinc-300">
                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-400 mb-1">
                    Identificador / Nombre de la Mesa
                  </label>
                  <input
                    id="input-table-name"
                    type="text"
                    required
                    value={editingTable.name || ''}
                    onChange={(e) => setEditingTable(prev => ({ ...prev, name: e.target.value }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none focus:border-white text-white"
                    placeholder="Ej. Mesa 14, Comedor Familiar..."
                  />
                </div>

                <div>
                  <label className="block text-[10px] uppercase font-mono font-black tracking-widest text-zinc-400 mb-1">
                    Estado Operativo
                  </label>
                  <select
                    id="selector-table-active"
                    value={editingTable.active ? 'true' : 'false'}
                    onChange={(e) => setEditingTable(prev => ({ ...prev, active: e.target.value === 'true' }))}
                    className="w-full bg-zinc-950 border border-zinc-850 p-3 rounded-none text-xs outline-none text-white font-mono"
                  >
                    <option value="true">Activa (Acepta comensales y pedidos)</option>
                    <option value="false">Inactiva (Fuera de servicio / Bloqueada)</option>
                  </select>
                </div>

                <div className="pt-4 border-t border-zinc-850 flex items-center justify-end space-x-2.5">
                  <button
                    id="btn-table-modal-close"
                    type="button"
                    onClick={() => setIsTableModalOpen(false)}
                    className="px-4 py-2.5 text-xs font-black uppercase tracking-widest text-zinc-400 hover:text-white rounded-none bg-zinc-950 border border-zinc-850 transition cursor-pointer"
                  >
                    Descartar
                  </button>
                  <button
                    id="btn-table-modal-submit"
                    type="submit"
                    className="px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-white text-black hover:bg-zinc-200 rounded-none transition cursor-pointer"
                  >
                    Guardar Mesa
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
