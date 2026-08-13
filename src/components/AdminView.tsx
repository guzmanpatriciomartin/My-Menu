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
  RefreshCw,
  Wallet,
  BarChart3,
  Printer
} from 'lucide-react';
import { Establishment, Category, MenuItem, Table, Order, OrderStatus, UserSession, UserRole, TableCall, CashClose, MetricsSummary } from '../types';

// Mirrors the /api/my/cash-close/preview payload (server-computed; never derived here).
interface CashClosePreview {
  periodStart: string;
  periodEnd: string;
  totals: { orderCount: number; totalRevenue: number; averageTicket: number };
  orderCount: number;
  topProducts: { menuItemId: string; name: string; units: number; revenue: number }[];
  byTable: { tableId: string; tableName: string; orderCount: number; revenue: number }[];
}
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
  const [tableCalls, setTableCalls] = useState<TableCall[]>([]);
  
  // Active states
  const [loading, setLoading] = useState(true);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [activeTab, setActiveTab] = useState<'diseño_mesas' | 'pedidos' | 'menu_items' | 'historial' | 'caja' | 'metricas'>('pedidos');

  // Cash close (ADR-005). Preview is what the shift has pending right now; closes is the
  // history. Both are available to waiters — closing the register is shift work.
  const [cashPreview, setCashPreview] = useState<CashClosePreview | null>(null);
  const [cashCloses, setCashCloses] = useState<CashClose[]>([]);
  const [isClosingCash, setIsClosingCash] = useState(false);
  const [confirmCashClose, setConfirmCashClose] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<CashClose | null>(null);
  const [cashError, setCashError] = useState('');

  // Metrics panel (admin only).
  const [metrics, setMetrics] = useState<MetricsSummary | null>(null);
  const [metricsDay, setMetricsDay] = useState('');
  const [metricsLoading, setMetricsLoading] = useState(false);

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

  // Store pre-played order and call count to detect new events and synthesize chime
  const orderCountRef = useRef<number>(0);
  const callCountRef = useRef<number>(0);

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
      const [estRes, catRes, menuRes, tabRes, ordRes, callsRes] = await Promise.all([
        fetch('/api/establishments', { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/establishments/${estId}/categories`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/establishments/${estId}/menu-items`, { credentials: 'include' }).then(r => r.json()),
        fetch(`/api/establishments/${estId}/tables`, { credentials: 'include' }).then(r => r.json()),
        fetch('/api/my/orders', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/my/calls', { credentials: 'include' }).then(r => r.json()).catch(() => [])
      ]);

      if (Array.isArray(estRes)) setEstablishments(estRes);
      if (Array.isArray(catRes)) setCategories(catRes);
      if (Array.isArray(menuRes)) setMenuItems(menuRes);
      if (Array.isArray(tabRes)) setTables(tabRes);
      if (Array.isArray(callsRes)) setTableCalls(callsRes);
      if (Array.isArray(ordRes)) {
        const orderMap = new Map<string, Order>();
        ordRes.forEach((o: Order) => orderMap.set(o.id, o));
        setOrders(Array.from(orderMap.values()));
      }

      // Sound notification triggers on new orders count raising or new pending calls (RF-A03)
      const currentReceivedOrders = Array.isArray(ordRes)
        ? ordRes.filter((o: Order) => o.status === 'Recibido').length
        : 0;
      const currentPendingCalls = Array.isArray(callsRes)
        ? callsRes.filter((c: TableCall) => c.status === 'pending').length
        : 0;

      if ((orderCountRef.current !== null && currentReceivedOrders > orderCountRef.current) ||
          (callCountRef.current !== null && currentPendingCalls > callCountRef.current)) {
        if (soundEnabled) {
          playNewOrderSound();
        }
      }
      orderCountRef.current = currentReceivedOrders;
      callCountRef.current = currentPendingCalls;

    } catch (err) {
      console.error('Error fetching admin data', err);
    } finally {
      setLoading(false);
    }
  };

  const handleAttendCall = async (callId: string) => {
    try {
      const res = await fetch(`/api/calls/${callId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'attended' })
      });
      if (res.ok) {
        fetchDbState();
      }
    } catch (err) {
      console.error('Error attending call', err);
    }
  };

  const handleCloseTableSession = async (tableId: string, tableName: string) => {
    if (!window.confirm(`¿Estás seguro/a de cerrar manualmente la mesa "${tableName}"?\n\nEsto finalizará la sesión del cliente de forma inmediata y registrará las compras del comensal.`)) {
      return;
    }
    try {
      const res = await fetch(`/api/tables/${tableId}/close`, {
        method: 'POST',
        credentials: 'include'
      });
      if (res.ok) {
        fetchDbState();
      }
    } catch (err) {
      console.error('Error closing table session', err);
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

  // Load tab data on demand: neither panel is needed until it is opened, and the metrics
  // endpoint is admin-only (a waiter opening the app should never call it).
  useEffect(() => {
    if (!currentUser) return;
    if (activeTab === 'caja') fetchCashState();
    if (activeTab === 'metricas' && currentUser.role === 'admin') fetchMetrics(metricsDay || undefined);
  }, [activeTab, currentUser]);

  // SSE handler for instantaneous real-time refresh (RF-A03, RF-C08)
  useEffect(() => {
    if (!currentUser) return;
    let sse: EventSource | null = null;
    try {
      sse = new EventSource('/api/realtime');
      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if ((msg.type === 'ORDER_CREATED' || msg.type === 'TABLE_CALL_CREATED') && msg.payload.establishmentId === activeEstId) {
            // Hot trigger sound and pull fresh lists
            if (soundEnabled) playNewOrderSound();
            fetchDbState();
          } else if ((msg.type === 'ORDER_STATUS_CHANGED' || msg.type === 'TABLE_SESSION_CLOSED') && msg.payload.establishmentId === activeEstId) {
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

  const pendingCalls = useMemo(() => {
    return tableCalls.filter(c => c.status === 'pending');
  }, [tableCalls]);

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

  const formatDateTime = (iso: string) => {
    if (!iso) return '—';
    return new Date(iso).toLocaleString('es-AR', {
      timeZone: 'America/Argentina/Buenos_Aires',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  // --- Cash close (ADR-005) ---

  const fetchCashState = async () => {
    try {
      const [previewRes, closesRes] = await Promise.all([
        fetch('/api/my/cash-close/preview', { credentials: 'include' }).then(r => r.json()),
        fetch('/api/my/cash-closes', { credentials: 'include' }).then(r => r.json()).catch(() => [])
      ]);
      if (previewRes && previewRes.totals) setCashPreview(previewRes);
      if (Array.isArray(closesRes)) setCashCloses(closesRes);
    } catch (err) {
      console.error('Failed to load cash state', err);
    }
  };

  const handleCashClose = async () => {
    setIsClosingCash(true);
    setCashError('');
    try {
      const res = await fetch('/api/my/cash-close', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({})
      });

      if (res.status === 409) {
        setCashError('No hay pedidos entregados pendientes de cierre.');
        return;
      }
      if (!res.ok) {
        setCashError('No se pudo cerrar la caja. Intentá de nuevo.');
        return;
      }

      const receipt: CashClose = await res.json();
      setLastReceipt(receipt);
      setConfirmCashClose(false);
      // Re-read instead of patching locally: the server is the source of truth for what
      // ended up inside the close.
      await Promise.all([fetchCashState(), fetchDbState()]);
    } catch (err) {
      console.error('Cash close failed', err);
      setCashError('No se pudo conectar con el servidor.');
    } finally {
      setIsClosingCash(false);
    }
  };

  // --- Metrics (admin only) ---

  const fetchMetrics = async (day?: string) => {
    setMetricsLoading(true);
    try {
      const url = day ? `/api/my/metrics?day=${encodeURIComponent(day)}` : '/api/my/metrics';
      const res = await fetch(url, { credentials: 'include' });
      if (!res.ok) return;
      const data: MetricsSummary = await res.json();
      setMetrics(data);
      setMetricsDay(data.day);
    } catch (err) {
      console.error('Failed to load metrics', err);
    } finally {
      setMetricsLoading(false);
    }
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
      <div className={`min-h-screen ${classes.bgApp} flex flex-col items-center justify-center p-6 selection:bg-amber-500 selection:text-zinc-950 font-sans transition-colors duration-300`}>
        <div id="login-container" className={`max-w-md w-full ${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-8 relative overflow-hidden shadow-2xl`}>
          
          <div className="absolute top-0 left-0 right-0 h-1 bg-amber-500"></div>

          <div className="text-center mb-6">
            <h1 className={`text-xl font-black ${classes.textPrimary} tracking-widest flex items-center justify-center space-x-2.5 uppercase`}>
              <ClipboardList className="w-5 h-5 text-amber-500" />
              <span>Mi Menu · Gestión</span>
            </h1>
            <p className={`text-[10px] font-mono tracking-wider uppercase ${classes.textMuted} mt-2`}>
              Soporte multi-establecimiento & comandas QR
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-5">
            <div>
              <label className={`block text-[10px] font-black ${classes.textSecondary} uppercase tracking-widest mb-2 font-mono`}>
                Seleccionar Establecimiento & Cuenta
              </label>
              <select
                id="demo-user-selector"
                value={selectedUserKey}
                disabled={isLoggingIn}
                className={`w-full ${classes.inputBg} border ${classes.inputBorder} ${classes.radiusCard} p-3.5 text-xs ${classes.textPrimary} focus:outline-none font-mono uppercase tracking-wide cursor-pointer disabled:opacity-50`}
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
              <label className={`block text-[10px] font-black ${classes.textSecondary} uppercase tracking-widest mb-2 font-mono`}>
                Correo Electrónico
              </label>
              <input
                id="input-login-email"
                type="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                disabled={isLoggingIn}
                className={`w-full ${classes.inputBg} border ${classes.inputBorder} ${classes.radiusCard} p-3.5 text-xs ${classes.textPrimary} focus:outline-none font-medium disabled:opacity-50`}
                required
              />
            </div>

            <div>
              <label className={`block text-[10px] font-black ${classes.textSecondary} uppercase tracking-widest mb-2 font-mono`}>
                Contraseña
              </label>
              <input
                id="input-login-password"
                type="password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                disabled={isLoggingIn}
                className={`w-full ${classes.inputBg} border ${classes.inputBorder} ${classes.radiusCard} p-3.5 text-xs ${classes.textPrimary} focus:outline-none font-mono disabled:opacity-50`}
                required
              />
            </div>

            {loginError && (
              <p className={`text-[11px] text-rose-400 bg-rose-950/10 border border-rose-900/30 p-3 ${classes.radiusCard} flex items-center font-medium`}>
                <AlertTriangle className="w-4 h-4 mr-2 shrink-0 text-rose-400" />
                {loginError}
              </p>
            )}

            <button
              id="btn-login"
              type="submit"
              disabled={isLoggingIn}
              className={`w-full py-4 ${classes.radiusBtn} font-black text-xs text-zinc-950 bg-amber-500 hover:bg-amber-400 uppercase tracking-[0.2em] cursor-pointer transition-all disabled:opacity-50 flex items-center justify-center space-x-2 shadow-lg shadow-amber-500/20`}
            >
              {isLoggingIn ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin text-zinc-950" />
                  <span>Ingresando...</span>
                </>
              ) : (
                <span>Acceder al Panel Admin</span>
              )}
            </button>
          </form>

          {/* Direct Tenant Quick Selection Buttons */}
          <div className={`mt-6 pt-5 border-t ${classes.borderCard} space-y-3`}>
            <p className={`text-[10px] font-black ${classes.textMuted} uppercase tracking-widest font-mono`}>
              Acceso Rápido por Establecimiento:
            </p>
            <div className="space-y-3">
              {demoAccounts.map((group) => (
                <div key={group.tenantId} className={`${classes.inputBg} border ${classes.inputBorder} ${classes.radiusCard} p-3 space-y-2`}>
                  <span className="text-[10px] font-bold text-amber-500 font-mono uppercase tracking-wider block">
                    {group.badge} — {group.tenant}
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    {group.accounts.map((acc) => (
                      <button
                        key={acc.key}
                        type="button"
                        onClick={() => fillAndLogin(acc.email, acc.pass)}
                        className={`text-left p-2 border transition text-[10px] font-mono cursor-pointer ${classes.radiusBtn} ${
                          loginEmail === acc.email
                            ? `${classes.bgCard} border-amber-500 ${classes.textPrimary} font-bold shadow-sm`
                            : `${classes.inputBg} ${classes.borderCard} ${classes.textMuted} hover:${classes.textPrimary}`
                        }`}
                      >
                        <p className={`${classes.textPrimary} font-bold`}>{acc.name} ({acc.role})</p>
                        <p className={`text-[9px] ${classes.textMuted} truncate`}>{acc.email}</p>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className={`mt-6 pt-4 border-t ${classes.borderCard} flex items-center justify-between text-[10px] ${classes.textMuted} font-mono uppercase tracking-wider`}>
            <span>MVP v0.2</span>
            <button 
              onClick={onBackToLauncher}
              className={`${classes.textPrimary} hover:underline font-bold`}
            >
              Volver al Lanzador
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={`min-h-screen ${classes.bgApp} flex flex-col font-sans transition-colors duration-300 selection:bg-amber-500 selection:text-zinc-950`}>
      
      {/* Dynamic Multi-tenant Header (RF-A11) */}
      <header className={`${classes.bgHeader} ${classes.blurClass} border-b ${classes.borderCard} sticky top-0 z-40 transition-all`}>
        <div className="max-w-7xl mx-auto px-4 md:px-6 py-4 flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          
          <div className="flex items-center space-x-3">
            <ClipboardList className="w-5 h-5 text-amber-500" />
            <div>
              <h1 className={`text-sm font-black tracking-widest ${classes.textPrimary} uppercase flex items-center`}>
                Mi Menú · Panel
                <span className={`ml-2.5 text-[9px] ${classes.bgCard} ${classes.textSecondary} border ${classes.borderCard} ${classes.radiusPill} px-2 py-0.5 font-mono font-bold tracking-widest uppercase`}>
                  {currentUser.email} · {currentUser.role === 'admin' ? 'Admin' : 'Mesero'}
                </span>
              </h1>
            </div>
          </div>

          {/* Active establishment — fixed to the authenticated tenant, not switchable (RF-A11) */}
          <div className="flex items-center gap-2">
            <span className={`text-[10px] ${classes.textMuted} font-mono uppercase ${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} py-1.5 px-3.5 flex items-center tracking-wider`}>
              <MapPin className="w-3.5 h-3.5 mr-1.5 text-amber-500" />
              Establecimiento Activo:
            </span>
            <span
              id="establishment-active-label"
              className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} text-xs px-3 py-2 ${classes.textPrimary} font-bold`}
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
              className={`px-3 py-2 text-xs font-mono font-bold ${classes.bgCard} border ${classes.borderCard} ${classes.radiusBtn} hover:border-amber-500 ${classes.textSecondary} hover:${classes.textPrimary} transition cursor-pointer flex items-center space-x-1.5 disabled:opacity-50`}
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
              className={`p-2 ${classes.radiusBtn} border flex items-center justify-center transition-all ${
                soundEnabled 
                  ? `${classes.bgCard} border-amber-500 text-amber-500` 
                  : `${classes.bgCard} ${classes.borderCard} ${classes.textMuted}`
              }`}
              title={soundEnabled ? 'Silenciar notificaciones' : 'Activar sonido de pedidos'}
            >
              {soundEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
            </button>

            <button
              id="btn-admin-logout"
              onClick={handleLogout}
              className={`px-3.5 py-2 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:bg-rose-500/10 hover:border-rose-500/30 text-xs font-black uppercase tracking-wider ${classes.textMuted} hover:text-rose-400 flex items-center transition cursor-pointer`}
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
        <aside className={`w-full md:w-56 shrink-0 flex flex-row md:flex-col gap-1.5 overflow-x-auto scrollbar-none pb-2 md:pb-0 border-b md:border-b-0 md:border-r ${classes.borderCard} pr-0 md:pr-4`}>
          <button
            id="tab-btn-pedidos"
            onClick={() => setActiveTab('pedidos')}
            className={`px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center justify-between transition min-w-[124px] md:w-full shrink-0 border ${
              activeTab === 'pedidos' 
                ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold shadow-md' 
                : `${classes.textMuted} border-transparent bg-transparent hover:${classes.textPrimary} hover:${classes.borderCard}`
            }`}
          >
            <span className="flex items-center">
              <Bell className="w-4 h-4 mr-2.5" />
              Monitor Pedidos
            </span>
            <div className="flex items-center space-x-1 shrink-0">
              {pendingCalls.length > 0 && (
                <span id="pending-calls-counter" className="text-[9px] font-black bg-amber-500 text-zinc-950 border border-amber-400 px-1.5 py-0.5 rounded-full font-mono animate-pulse shrink-0 flex items-center gap-0.5" title="Llamados de mesa pendientes">
                  🔔 {pendingCalls.length}
                </span>
              )}
              {activeOrdersList.length > 0 && (
                <span id="active-orders-counter" className="text-[9px] font-black bg-red-600 text-white border border-red-500 px-1.5 py-0.5 rounded-full font-mono animate-bounce shrink-0" title="Pedidos activos">
                  {activeOrdersList.length}
                </span>
              )}
            </div>
          </button>

          {/* Mesas & QRs is available to waiters too: closing a table and printing a QR
              are floor tasks. The admin-only bits (create/edit/delete table) are hidden
              inside the panel, and the server enforces that split regardless. */}
          <button
            id="tab-btn-diseño_mesas"
            onClick={() => setActiveTab('diseño_mesas')}
            className={`px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
              activeTab === 'diseño_mesas'
                ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold shadow-md'
                : `${classes.textMuted} border-transparent bg-transparent hover:${classes.textPrimary} hover:${classes.borderCard}`
            }`}
          >
            <Users className="w-4 h-4 mr-2.5" />
            Mesas & QRs
          </button>

          <button
            id="tab-btn-caja"
            onClick={() => setActiveTab('caja')}
            className={`px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
              activeTab === 'caja'
                ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold shadow-md'
                : `${classes.textMuted} border-transparent bg-transparent hover:${classes.textPrimary} hover:${classes.borderCard}`
            }`}
          >
            <Wallet className="w-4 h-4 mr-2.5" />
            Cierre de Caja
          </button>

          {/* Guard sections dynamically based on waiter role limitations (RF-A13) */}
          {currentUser.role === 'admin' ? (
            <>
              <button
                id="tab-btn-menu_items"
                onClick={() => setActiveTab('menu_items')}
                className={`px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
                  activeTab === 'menu_items'
                    ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold shadow-md'
                    : `${classes.textMuted} border-transparent bg-transparent hover:${classes.textPrimary} hover:${classes.borderCard}`
                }`}
              >
                <Utensils className="w-4 h-4 mr-2.5" />
                Catálogo Menú
              </button>

              <button
                id="tab-btn-metricas"
                onClick={() => setActiveTab('metricas')}
                className={`px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
                  activeTab === 'metricas'
                    ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold shadow-md'
                    : `${classes.textMuted} border-transparent bg-transparent hover:${classes.textPrimary} hover:${classes.borderCard}`
                }`}
              >
                <BarChart3 className="w-4 h-4 mr-2.5" />
                Métricas
              </button>
            </>
          ) : (
            <div className={`hidden md:flex flex-col items-center p-4 ${classes.bgCard} ${classes.radiusCard} border ${classes.borderCard} text-center space-y-1.5 my-2`}>
              <ShieldAlert className="w-4.5 h-4.5 text-zinc-500" />
              <p className={`text-[9px] font-black uppercase font-mono ${classes.textMuted} tracking-wider`}>Acceso Mesero</p>
              <p className={`text-[9px] ${classes.textMuted} font-medium`}>Catálogo y métricas bloqueados</p>
            </div>
          )}

          <button
            id="tab-btn-historial"
            onClick={() => setActiveTab('historial')}
            className={`px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center transition min-w-[124px] md:w-full shrink-0 border ${
              activeTab === 'historial' 
                ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold shadow-md' 
                : `${classes.textMuted} border-transparent bg-transparent hover:${classes.textPrimary} hover:${classes.borderCard}`
            }`}
          >
            <TrendingUp className="w-4 h-4 mr-2.5" />
            Historial de Cierre
          </button>

          <button
            id="tab-btn-launcher"
            onClick={onBackToLauncher}
            className={`md:mt-auto px-4 py-3 ${classes.radiusBtn} text-[11px] font-black font-sans uppercase tracking-widest text-left flex items-center ${classes.textMuted} hover:${classes.bgCard} hover:${classes.textPrimary} transition min-w-[124px] md:w-full shrink-0 border border-transparent`}
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
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 flex flex-wrap items-center justify-between gap-4`}>
                <div className="space-y-1 my-0.5">
                  <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Monitor de Pedidos Activos</h2>
                  <p className={`text-xs ${classes.textMuted} font-medium`}>Atención de comandas en tiempo real. Utiliza los controles de avance y cancelación.</p>
                </div>
                
                <div className={`flex items-center gap-2 ${classes.inputBg} px-4 py-2 border ${classes.borderCard} ${classes.radiusCard} font-mono`}>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-emerald-400 uppercase tracking-widest">En línea (SSE)</span>
                </div>
              </div>

              {/* Table Calls Notifications Section */}
              {pendingCalls.length > 0 && (
                <div className={`${classes.bgCard} border border-amber-500/40 p-4.5 ${classes.radiusCard} space-y-3 shadow-lg bg-amber-500/5`}>
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-black uppercase tracking-wider text-amber-500 flex items-center space-x-2">
                      <Bell className="w-4 h-4 animate-bounce" />
                      <span>Llamados y Solicitudes de Mesa ({pendingCalls.length})</span>
                    </h3>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {pendingCalls.map((call) => (
                      <div
                        key={call.id}
                        className={`${classes.bgApp} border ${classes.borderCard} p-3.5 ${classes.radiusCard} flex items-center justify-between gap-3 shadow-sm`}
                      >
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className={`px-2 py-0.5 text-[9px] font-black uppercase rounded-md font-mono ${
                              call.type === 'waiter_call' ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                            }`}>
                              {call.type === 'waiter_call' ? '🛎️ Llamado Mozo' : '🧾 Cuenta'}
                            </span>
                            <span className={`text-xs font-black ${classes.textPrimary}`}>
                              {call.tableName}
                            </span>
                          </div>
                          <p className={`text-[11px] ${classes.textMuted} font-medium`}>
                            Comensal: <span className="font-bold text-amber-500">{call.dinerName}</span>
                          </p>
                        </div>

                        <button
                          id={`btn-attend-call-${call.id}`}
                          onClick={() => handleAttendCall(call.id)}
                          className="px-3 py-1.5 rounded-lg text-[10px] font-black uppercase tracking-wider bg-amber-500 text-zinc-950 hover:bg-amber-400 transition cursor-pointer shrink-0 shadow"
                        >
                          Atender
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Grid of active orders arranged nicely */}
              {activeOrdersList.length === 0 ? (
                <div className={`text-center py-24 ${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-6`}>
                  <Bell className={`w-10 h-10 ${classes.textMuted} mx-auto mb-4`} />
                  <h3 className={`text-xs font-black uppercase tracking-wider ${classes.textPrimary} mb-1.5`}>Tranquilidad absoluta</h3>
                  <p className={`text-xs ${classes.textMuted} max-w-sm mx-auto leading-relaxed font-semibold`}>No hay pedidos pendientes para este local en este momento. Escanea un código QR como Cliente para enviar una comanda.</p>
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
                        className={`${classes.bgCard} ${classes.bgCardHover} border ${classes.borderCard} p-4.5 ${classes.radiusCard} flex flex-col justify-between transition`}
                      >
                        {/* Upper Section */}
                        <div className="space-y-4">
                          <div className={`flex items-center justify-between border-b ${classes.borderCard} pb-3`}>
                            <div>
                              <div className="flex items-center space-x-2">
                                <h4 className={`font-black text-sm ${classes.textPrimary} tracking-wide uppercase`}>{ord.tableName}</h4>
                                {ord.dinerName && (
                                  <span className="text-[10px] font-bold text-amber-500 bg-amber-500/10 px-2 py-0.5 rounded-md border border-amber-500/20">
                                    {ord.dinerName}
                                  </span>
                                )}
                              </div>
                              <p className={`text-[10px] ${classes.textMuted} mt-1 flex items-center font-mono`}>
                                <Clock className={`w-3.5 h-3.5 mr-1 ${classes.textMuted}`} />
                                Espera: {getWaitingTime(ord.createdAt)}
                              </p>
                            </div>

                            <div className="flex items-center space-x-2">
                              <span className={`text-[9px] font-black font-mono uppercase px-2.5 py-1 ${classes.radiusPill} border tracking-widest flex items-center space-x-1 ${
                                ord.status === 'Recibido' ? 'bg-amber-500/10 text-amber-500 border-amber-500/20' :
                                ord.status === 'En preparación' ? 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20' :
                                'bg-emerald-500/10 text-emerald-400 border-emerald-500/20 animate-pulse'
                              }`}>
                                <span>{ord.status}</span>
                              </span>

                              <button
                                id={`btn-close-table-${ord.tableId}`}
                                onClick={() => handleCloseTableSession(ord.tableId, ord.tableName)}
                                className={`p-1.5 text-[9px] font-black uppercase rounded-lg border ${classes.borderCard} hover:border-rose-500 text-rose-400 transition`}
                                title={`Cerrar sesión de ${ord.tableName} manualmente`}
                              >
                                Cerrar Mesa
                              </button>
                            </div>
                          </div>

                          {/* Items listing */}
                          <div className="space-y-3">
                            {ord.items.map((i) => (
                              <div key={i.id} className="text-xs">
                                <div className="flex items-start justify-between">
                                  <p className={`font-medium ${classes.textPrimary}`}>
                                    <span className="font-mono text-amber-500 font-bold mr-2">{i.quantity}x</span>
                                    {i.name}
                                  </p>
                                  <span className={`text-[10px] font-mono ${classes.textMuted} font-bold`}>{formatPrice(i.price * i.quantity)}</span>
                                </div>
                                {i.comment && (
                                  <div className={`mt-1.5 ml-6 px-2 py-1.5 border-l-2 border-amber-500 bg-amber-500/5 text-amber-500 text-[10px] font-medium leading-normal ${classes.radiusCard} max-w-xs truncate italic`}>
                                    "{i.comment}"
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Lower section actions */}
                        <div className={`mt-6 border-t ${classes.borderCard} pt-4 flex items-center justify-between gap-3`}>
                          <div>
                            <span className={`text-[9px] ${classes.textMuted} font-mono uppercase tracking-widest block font-bold`}>Monto total</span>
                            <span id={`order-total-${ord.id}`} className="font-mono text-sm font-black text-amber-500">{formatPrice(totalOrderPrice)}</span>
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <button
                              id={`btn-cancel-order-${ord.id}`}
                              onClick={() => {
                                setSelectedOrder(ord);
                                setIsCancelModalOpen(true);
                              }}
                              className={`px-3 py-2 ${classes.radiusBtn} text-xs font-black uppercase tracking-widest text-rose-500 hover:bg-rose-500/10 border ${classes.borderCard} transition cursor-pointer`}
                              title="Cancelar Pedido con justificación"
                            >
                              Cancelar
                            </button>

                            <button
                              id={`btn-advance-order-${ord.id}`}
                              onClick={() => handleAdvanceStatus(ord)}
                              className={`px-4 py-2 ${classes.radiusBtn} text-xs font-black ${classes.textPrimary} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 transition cursor-pointer uppercase font-mono tracking-widest shadow-sm`}
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
          {activeTab === 'diseño_mesas' && (
            <div className="space-y-6">
              
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 flex flex-wrap items-center justify-between gap-4`}>
                <div className="space-y-1 my-0.5">
                  <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Mesas e Impresión QR</h2>
                  <p className={`text-xs ${classes.textMuted} font-medium`}>Administra los códigos QR de cada mesa. Los códigos enlazan automáticamente la mesa con el pedido.</p>
                </div>

                {/* Creating tables is admin-only (the server rejects it for a waiter). */}
                {currentUser.role === 'admin' && (
                  <button
                    id="btn-create-table"
                    onClick={() => {
                      setEditingTable({ name: '', active: true });
                      setIsTableModalOpen(true);
                    }}
                    className={`px-4.5 py-3 ${classes.radiusBtn} text-xs font-black text-zinc-950 bg-amber-500 hover:bg-amber-400 transition flex items-center space-x-2 cursor-pointer uppercase tracking-widest shadow-md`}
                  >
                    <Plus className="w-4 h-4" />
                    <span>Crear Nueva Mesa</span>
                  </button>
                )}
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
                      className={`${classes.bgCard} border ${
                        table.active ? classes.borderCard : 'border-dashed opacity-40'
                      } ${classes.radiusCard} p-4.5 flex flex-col justify-between`}
                    >
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <h4 className={`font-black text-xs ${classes.textPrimary} uppercase tracking-wider`}>{table.name}</h4>
                          <span className={`text-[9px] font-mono font-black uppercase px-2 py-0.5 ${classes.radiusPill} border ${
                            table.active ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : `${classes.bgCard} ${classes.borderCard} ${classes.textMuted}`
                          }`}>
                            {table.active ? 'Activa' : 'Inactiva'}
                          </span>
                        </div>

                        {/* Interactive mini QR placard */}
                        <div className={`bg-white p-2 text-center ${classes.radiusCard} border ${classes.borderCard} max-w-[124px] mx-auto select-none flex flex-col items-center justify-center shadow-sm`}>
                          <img 
                            src={qrApiUrl} 
                            alt={`QR ${table.name}`} 
                            referrerPolicy="no-referrer"
                            className="w-24 h-24" 
                          />
                        </div>
                        
                        <p className={`text-[10px] ${classes.textMuted} font-mono text-center select-all truncate px-1`}>
                          {finalClientUrl.slice(0, 30)}...
                        </p>
                      </div>

                      <div className={`mt-4 pt-3.5 border-t ${classes.borderCard} flex items-center justify-between gap-1 flex-wrap`}>
                        {/* Editing and deleting a table are admin-only; a waiter sees an
                            empty slot here and keeps the floor actions on the right. */}
                        <div className="flex items-center space-x-1">
                          {currentUser.role === 'admin' && (
                            <>
                              <button
                                id={`btn-edit-table-${table.id}`}
                                onClick={() => {
                                  setEditingTable(table);
                                  setIsTableModalOpen(true);
                                }}
                                className={`p-2 ${classes.radiusBtn} ${classes.textMuted} hover:${classes.textPrimary} ${classes.bgCard} border ${classes.borderCard} transition`}
                                title="Editar mesa"
                              >
                                <Edit className="w-3.5 h-3.5" />
                              </button>

                              <button
                                id={`btn-delete-table-${table.id}`}
                                onClick={() => handleDeleteTable(table.id)}
                                className={`p-2 ${classes.radiusBtn} text-rose-500 hover:text-rose-400 ${classes.bgCard} border ${classes.borderCard} hover:bg-rose-500/10 transition`}
                                title="Eliminar mesa"
                              >
                                <Trash className="w-3.5 h-3.5" />
                              </button>
                            </>
                          )}
                        </div>

                        <div className="flex items-center space-x-1">
                          <button
                            id={`btn-close-table-card-${table.id}`}
                            onClick={() => handleCloseTableSession(table.id, table.name)}
                            className={`px-2.5 py-1.5 ${classes.radiusBtn} bg-rose-500/10 border border-rose-500/30 hover:border-rose-500 text-rose-400 text-[10px] font-black uppercase tracking-wider transition cursor-pointer`}
                            title="Cerrar la sesión de la mesa"
                          >
                            Cerrar Mesa
                          </button>

                          <button
                            id={`btn-download-qr-${table.id}`}
                            onClick={() => triggerQrDownload(table)}
                            className={`px-2.5 py-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 ${classes.textSecondary} hover:${classes.textPrimary} text-[10px] font-black uppercase tracking-widest transition flex items-center space-x-1 cursor-pointer`}
                            title="Descargar carpa de mesa tamaño grande listo para imprimir"
                          >
                            <Download className="w-3 h-3" />
                            <span>Carpa</span>
                          </button>
                        </div>
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
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 flex flex-wrap items-center justify-between gap-4`}>
                <div className="space-y-1 my-0.5">
                  <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Catálogo de Categorías y Platos</h2>
                  <p className={`text-xs ${classes.textMuted} font-medium`}>Sube platos, ajusta precios e inhabilita instantáneamente los insumos agotados.</p>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    id="btn-add-category"
                    onClick={() => {
                      setEditingCategory({ name: '' });
                      setIsCategoryModalOpen(true);
                    }}
                    className={`px-4.5 py-3 ${classes.radiusBtn} text-xs font-black ${classes.textPrimary} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 transition flex items-center space-x-1.5 cursor-pointer uppercase tracking-widest`}
                  >
                    <Layers className="w-4 h-4 text-amber-500" />
                    <span>Categorías</span>
                  </button>

                  <button
                    id="btn-add-menu-item"
                    onClick={() => {
                      setEditingItem({ name: '', description: '', price: 0, available: true, categoryId: categories[0]?.id || '' });
                      setIsItemModalOpen(true);
                    }}
                    disabled={categories.length === 0}
                    className={`px-4.5 py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-zinc-950 text-xs font-black ${classes.radiusBtn} transition flex items-center space-x-2 cursor-pointer uppercase tracking-widest shadow-md`}
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
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} py-3 pl-10 pr-4 ${classes.radiusCard} text-xs ${classes.textPrimary} focus:outline-none font-medium`}
                  />
                  <Search className={`w-4 h-4 ${classes.textMuted} absolute left-3.5 top-3.5`} />
                </div>

                <div className="flex space-x-2 overflow-x-auto w-full sm:w-auto scrollbar-none py-1">
                  <button
                    id="filter-cat-all"
                    onClick={() => setMenuCatFilter('all')}
                    className={`px-3.5 py-2 ${classes.radiusBtn} text-[10px] font-black uppercase tracking-wider transition-all border ${
                      menuCatFilter === 'all' 
                        ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold' 
                        : `${classes.bgCard} ${classes.textMuted} ${classes.borderCard} hover:${classes.textPrimary}`
                    }`}
                  >
                    Todos
                  </button>
                  {categories.map((cat) => (
                    <button
                      id={`filter-cat-${cat.id}`}
                      key={cat.id}
                      onClick={() => setMenuCatFilter(cat.id)}
                      className={`px-3.5 py-2 ${classes.radiusBtn} text-[10px] font-black uppercase tracking-wider transition-all border ${
                        menuCatFilter === cat.id 
                          ? 'bg-amber-500 text-zinc-950 border-amber-500 font-bold' 
                          : `${classes.bgCard} ${classes.textMuted} ${classes.borderCard} hover:${classes.textPrimary}`
                      }`}
                    >
                      {cat.name}
                    </button>
                  ))}
                </div>
              </div>

              {/* Items Table List */}
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden`}>
                
                {/* Visual view of Categories manager inside panel */}
                <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} flex items-center justify-between flex-wrap gap-2`}>
                  <span className={`text-[10px] tracking-wider font-mono font-black ${classes.textMuted} uppercase`}>
                    Categorías registradas del local ({categories.length})
                  </span>
                </div>

                {categories.length === 0 ? (
                  <p className={`text-xs ${classes.textMuted} p-4 italic text-center`}>Debes crear al menos una categoría primero.</p>
                ) : (
                  <div className="p-4 flex flex-wrap gap-2.5">
                    {categories.map(cat => (
                      <span 
                        id={`cat-badge-${cat.id}`}
                        key={cat.id} 
                        className={`${classes.inputBg} ${classes.textPrimary} py-1.5 px-3 ${classes.radiusCard} text-xs font-medium border ${classes.borderCard} flex items-center font-mono uppercase tracking-wide`}
                      >
                        <span className="mr-2 text-amber-500 font-bold">#{cat.order}</span>
                        <span className="font-semibold">{cat.name}</span>
                        <button
                          onClick={() => {
                            setEditingCategory(cat);
                            setIsCategoryModalOpen(true);
                          }}
                          className={`ml-2.5 p-1 ${classes.textMuted} hover:${classes.textPrimary} transition`}
                        >
                          <Edit className="w-3.5 h-3.5" />
                        </button>
                        <button
                          onClick={() => handleDeleteCategory(cat.id)}
                          className="ml-1.5 p-1 text-rose-500 hover:text-rose-400 transition"
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
                      <tr className={`border-b ${classes.borderCard} ${classes.bgHeader} ${classes.textMuted} font-mono text-[9px] uppercase tracking-widest font-bold`}>
                        <th className="p-4">Bocado / Detalle</th>
                        <th className="p-4">Categoría</th>
                        <th className="p-4">Monto</th>
                        <th className="p-4">Estado</th>
                        <th className="p-4 text-right">Acciones</th>
                      </tr>
                    </thead>
                    <tbody className={`divide-y ${classes.borderCard} text-xs`}>
                      {filteredMenuItems.map((item) => {
                        const cat = categories.find(c => c.id === item.categoryId);
                        return (
                          <tr id={`menu-item-row-${item.id}`} key={item.id} className={`hover:${classes.bgCardHover} transition-colors`}>
                            <td className="p-4">
                              <div className="flex items-center space-x-3">
                                <img
                                  src={item.imageUrl}
                                  alt={item.name}
                                  referrerPolicy="no-referrer"
                                  className={`w-10 h-10 ${classes.radiusCard} object-cover ${classes.inputBg} border ${classes.borderCard} shrink-0`}
                                  onError={(e) => {
                                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200';
                                  }}
                                />
                                <div className="min-w-0 max-w-[180px] sm:max-w-xs">
                                  <p className={`font-bold ${classes.textPrimary} truncate`}>{item.name}</p>
                                  <p className={`text-[10px] ${classes.textMuted} truncate mt-0.5`}>{item.description}</p>
                                </div>
                              </div>
                            </td>
                            <td className="p-4">
                              <span className={`font-mono text-[9px] ${classes.inputBg} border ${classes.borderCard} ${classes.textSecondary} font-black px-2 py-0.5 ${classes.radiusPill} uppercase tracking-wider`}>
                                {cat ? cat.name : 'Descargado'}
                              </span>
                            </td>
                            <td className={`p-4 font-mono font-bold ${classes.textPrimary}`}>{formatPrice(item.price)}</td>
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
                                className={`px-2.5 py-1 ${classes.radiusPill} text-[9px] font-black border tracking-widest uppercase cursor-pointer ${
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
                                  className={`p-1.5 px-2.5 ${classes.radiusBtn} ${classes.textMuted} hover:${classes.textPrimary} border ${classes.borderCard} transition`}
                                >
                                  <Edit className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  id={`btn-delete-item-${item.id}`}
                                  onClick={() => handleDeleteMenuItem(item.id)}
                                  className={`p-1.5 px-2.5 ${classes.radiusBtn} text-rose-500 hover:text-rose-400 border ${classes.borderCard} hover:bg-rose-500/10 transition`}
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
                          <td colSpan={5} className={`py-8 text-center ${classes.textMuted} font-bold italic`}>
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
          {/* TAB: Cash close — available to admin and waiter (shift work). */}
          {activeTab === 'caja' && (
            <div className="space-y-6">
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-1`}>
                <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Cierre de Caja</h2>
                <p className={`text-xs ${classes.textMuted} font-medium`}>
                  Solo se cuentan los pedidos <span className="font-black">entregados</span> que todavía no fueron cerrados. Al cerrar, quedan registrados y no se pueden modificar.
                </p>
              </div>

              {/* Open period */}
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-6 space-y-5`}>
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="space-y-1">
                    <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Total del turno</span>
                    <span id="cash-open-total" className="text-3xl font-black text-amber-500 block">
                      {formatPrice(cashPreview?.totals.totalRevenue ?? 0)}
                    </span>
                    <span className={`text-[10px] ${classes.textMuted} font-mono block pt-1`}>
                      Desde {formatDateTime(cashPreview?.periodStart || '')}
                    </span>
                  </div>

                  <div className="flex gap-6">
                    <div className="space-y-1">
                      <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Pedidos</span>
                      <span className={`text-xl font-black ${classes.textPrimary}`}>{cashPreview?.totals.orderCount ?? 0}</span>
                    </div>
                    <div className="space-y-1">
                      <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Ticket prom.</span>
                      <span className={`text-xl font-black ${classes.textPrimary}`}>{formatPrice(cashPreview?.totals.averageTicket ?? 0)}</span>
                    </div>
                  </div>
                </div>

                {cashError && (
                  <p className="text-[11px] font-black text-rose-400 font-mono uppercase tracking-wider">{cashError}</p>
                )}

                <button
                  id="btn-open-cash-close"
                  onClick={() => { setCashError(''); setConfirmCashClose(true); }}
                  disabled={isClosingCash || !cashPreview || cashPreview.totals.orderCount === 0}
                  className={`px-5 py-3 ${classes.radiusBtn} text-xs font-black uppercase tracking-widest transition flex items-center space-x-2 ${
                    !cashPreview || cashPreview.totals.orderCount === 0
                      ? `${classes.inputBg} ${classes.textMuted} cursor-not-allowed border ${classes.borderCard}`
                      : 'bg-amber-500 hover:bg-amber-400 text-zinc-950 cursor-pointer shadow-md'
                  }`}
                >
                  <Wallet className="w-4 h-4" />
                  <span>{cashPreview && cashPreview.totals.orderCount === 0 ? 'Nada para cerrar' : 'Cerrar caja'}</span>
                </button>
              </div>

              {/* Receipt of the close just made */}
              {lastReceipt && (
                <div id="cash-receipt" className={`${classes.bgCard} border-2 border-amber-500 ${classes.radiusCard} p-6 space-y-4`}>
                  <div className="flex items-center justify-between flex-wrap gap-3">
                    <h3 className={`text-xs font-black uppercase ${classes.textPrimary} tracking-widest flex items-center gap-2`}>
                      <CheckCircle className="w-4 h-4 text-amber-500" /> Cierre registrado
                    </h3>
                    <button
                      onClick={() => window.print()}
                      className={`px-3 py-2 ${classes.radiusBtn} ${classes.inputBg} border ${classes.borderCard} ${classes.textSecondary} hover:${classes.textPrimary} text-[10px] font-black uppercase tracking-widest flex items-center gap-1.5 cursor-pointer`}
                    >
                      <Printer className="w-3 h-3" /> Imprimir
                    </button>
                  </div>

                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4 font-mono">
                    <div>
                      <span className={`text-[9px] ${classes.textMuted} uppercase block tracking-widest`}>Responsable</span>
                      <span className={`text-xs font-black ${classes.textPrimary}`}>{lastReceipt.closedByName}</span>
                    </div>
                    <div>
                      <span className={`text-[9px] ${classes.textMuted} uppercase block tracking-widest`}>Cierre</span>
                      <span className={`text-xs font-black ${classes.textPrimary}`}>{formatDateTime(lastReceipt.periodEnd)}</span>
                    </div>
                    <div>
                      <span className={`text-[9px] ${classes.textMuted} uppercase block tracking-widest`}>Pedidos</span>
                      <span className={`text-xs font-black ${classes.textPrimary}`}>{lastReceipt.totals.orderCount}</span>
                    </div>
                    <div>
                      <span className={`text-[9px] ${classes.textMuted} uppercase block tracking-widest`}>Total</span>
                      <span className="text-xs font-black text-amber-500">{formatPrice(lastReceipt.totals.totalRevenue)}</span>
                    </div>
                  </div>

                  {lastReceipt.byTable.length > 0 && (
                    <div className={`border-t ${classes.borderCard} pt-3 space-y-1.5`}>
                      <span className={`text-[9px] ${classes.textMuted} font-mono uppercase tracking-widest block`}>Detalle por mesa</span>
                      {lastReceipt.byTable.map((t) => (
                        <div key={t.tableId} className="flex items-center justify-between text-xs">
                          <span className={classes.textSecondary}>{t.tableName} <span className={classes.textMuted}>({t.orderCount})</span></span>
                          <span className={`font-black ${classes.textPrimary} font-mono`}>{formatPrice(t.revenue)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Previous closes */}
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden`}>
                <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} font-mono text-[9px] ${classes.textMuted} tracking-widest uppercase font-black`}>
                  Cierres anteriores
                </div>
                {cashCloses.length === 0 ? (
                  <p className={`p-5 text-xs ${classes.textMuted} font-medium`}>Todavía no hay cierres registrados.</p>
                ) : (
                  <div className={`divide-y ${classes.borderCard}`}>
                    {cashCloses.map((c) => (
                      <div key={c.id} className="p-4 flex items-center justify-between flex-wrap gap-2">
                        <div className="space-y-0.5">
                          <span className={`text-xs font-black ${classes.textPrimary} block`}>{formatDateTime(c.periodEnd)}</span>
                          <span className={`text-[10px] ${classes.textMuted} font-mono`}>
                            {c.closedByName} · {c.totals.orderCount} pedidos
                          </span>
                        </div>
                        <span className="text-sm font-black text-amber-500 font-mono">{formatPrice(c.totals.totalRevenue)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: Metrics — admin only (the endpoint also enforces it). */}
          {activeTab === 'metricas' && currentUser.role === 'admin' && (
            <div className="space-y-6">
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 flex flex-wrap items-center justify-between gap-4`}>
                <div className="space-y-1">
                  <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Métricas de Venta</h2>
                  <p className={`text-xs ${classes.textMuted} font-medium`}>Solo pedidos entregados. Horarios en hora local.</p>
                </div>
                <input
                  id="metrics-day"
                  type="date"
                  value={metricsDay}
                  onChange={(e) => { setMetricsDay(e.target.value); fetchMetrics(e.target.value); }}
                  className={`px-3 py-2 ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} text-xs font-mono`}
                />
              </div>

              {metricsLoading && !metrics ? (
                <p className={`text-xs ${classes.textMuted} font-mono`}>Cargando…</p>
              ) : metrics && (
                <>
                  {/* KPIs */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-1`}>
                      <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Recaudación</span>
                      <span id="metrics-revenue" className="text-2xl font-black text-amber-500 block">{formatPrice(metrics.totals.totalRevenue)}</span>
                      <div className="flex gap-3 pt-1 flex-wrap">
                        {/* null means "no history to compare", which is different from 0 */}
                        <span className={`text-[10px] font-mono ${classes.textMuted}`}>
                          vs ayer:{' '}
                          {metrics.comparison.vsYesterday?.pct == null ? (
                            <span className={classes.textMuted}>sin datos</span>
                          ) : (
                            <span className={metrics.comparison.vsYesterday.pct >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                              {metrics.comparison.vsYesterday.pct >= 0 ? '+' : ''}{metrics.comparison.vsYesterday.pct.toFixed(0)}%
                            </span>
                          )}
                        </span>
                        <span className={`text-[10px] font-mono ${classes.textMuted}`}>
                          vs prom. 7d:{' '}
                          {metrics.comparison.vsWeekAvg?.pct == null ? (
                            <span className={classes.textMuted}>sin datos</span>
                          ) : (
                            <span className={metrics.comparison.vsWeekAvg.pct >= 0 ? 'text-emerald-400 font-black' : 'text-rose-400 font-black'}>
                              {metrics.comparison.vsWeekAvg.pct >= 0 ? '+' : ''}{metrics.comparison.vsWeekAvg.pct.toFixed(0)}%
                            </span>
                          )}
                        </span>
                      </div>
                    </div>
                    <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-1`}>
                      <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Pedidos</span>
                      <span className={`text-2xl font-black ${classes.textPrimary} block`}>{metrics.totals.orderCount}</span>
                    </div>
                    <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-1`}>
                      <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Ticket promedio</span>
                      <span className={`text-2xl font-black ${classes.textPrimary} block`}>{formatPrice(metrics.totals.averageTicket)}</span>
                    </div>
                  </div>

                  {/* Sales by hour */}
                  <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-3`}>
                    <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Ventas por hora</span>
                    {(() => {
                      const peak = Math.max(...metrics.byHour.map((h) => h.revenue), 1);
                      return (
                        <div className="flex items-end gap-0.5 h-28">
                          {metrics.byHour.map((h) => (
                            <div key={h.hour} className="flex-1 flex flex-col items-center justify-end h-full group" title={`${h.hour}:00 — ${formatPrice(h.revenue)} (${h.orderCount})`}>
                              <div
                                className={`w-full ${h.revenue > 0 ? 'bg-amber-500' : classes.inputBg} rounded-sm transition-all group-hover:bg-amber-400`}
                                style={{ height: `${Math.max((h.revenue / peak) * 100, h.revenue > 0 ? 4 : 2)}%` }}
                              />
                              {h.hour % 6 === 0 && (
                                <span className={`text-[8px] ${classes.textMuted} font-mono mt-1`}>{h.hour}</span>
                              )}
                            </div>
                          ))}
                        </div>
                      );
                    })()}
                  </div>

                  {/* Top products & by table */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden`}>
                      <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} font-mono text-[9px] ${classes.textMuted} tracking-widest uppercase font-black`}>
                        Más vendidos
                      </div>
                      {metrics.topProducts.length === 0 ? (
                        <p className={`p-4 text-xs ${classes.textMuted}`}>Sin ventas en el día.</p>
                      ) : (
                        <div className={`divide-y ${classes.borderCard}`}>
                          {metrics.topProducts.slice(0, 8).map((p) => (
                            <div key={p.menuItemId} className="p-3 flex items-center justify-between gap-2">
                              <span className={`text-xs ${classes.textSecondary} truncate`}>{p.name}</span>
                              <span className="text-[10px] font-mono shrink-0">
                                <span className={`font-black ${classes.textPrimary}`}>{p.units}u</span>
                                <span className={`${classes.textMuted}`}> · {formatPrice(p.revenue)}</span>
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden`}>
                      <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} font-mono text-[9px] ${classes.textMuted} tracking-widest uppercase font-black`}>
                        Por mesa
                      </div>
                      {metrics.byTable.length === 0 ? (
                        <p className={`p-4 text-xs ${classes.textMuted}`}>Sin ventas en el día.</p>
                      ) : (
                        <div className={`divide-y ${classes.borderCard}`}>
                          {metrics.byTable.map((t) => (
                            <div key={t.tableId} className="p-3 flex items-center justify-between gap-2">
                              <span className={`text-xs ${classes.textSecondary}`}>{t.tableName} <span className={classes.textMuted}>({t.orderCount})</span></span>
                              <span className={`text-[10px] font-mono font-black ${classes.textPrimary}`}>{formatPrice(t.revenue)}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

          {activeTab === 'historial' && (
            <div className="space-y-6">
              
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 flex flex-wrap items-center justify-between gap-4`}>
                <div className="space-y-1 my-0.5">
                  <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Historial de Turno & Cierre</h2>
                  <p className={`text-xs ${classes.textMuted} font-medium`}>Revisa las finanzas e historial del día. En el MVP, los montos representan el total estimado de comandas entregadas.</p>
                </div>

                <div className={`flex flex-col ${classes.inputBg} px-4 py-2 border ${classes.borderCard} ${classes.radiusCard} font-mono text-left`}>
                  <span className={`text-[9px] ${classes.textMuted} font-mono block font-black uppercase tracking-widest`}>Recaudación Estimada</span>
                  <span id="revenue-indicator" className="text-md font-black text-amber-500 mt-0.5">{formatPrice(totalDayRevenue)}</span>
                </div>
              </div>

              {/* Day orders list of deliveries and cancellations */}
              <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden shadow`}>
                <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} flex items-center justify-between font-mono text-[9px] ${classes.textMuted} tracking-widest uppercase`}>
                  <span>PEDIDOS ARCHIVADOS ({historyOrdersList.length})</span>
                  
                  <div className="flex items-center gap-2">
                    <span>Mesa:</span>
                    <select
                      id="history-table-filter font-mono"
                      value={historyTableFilter}
                      onChange={(e) => setHistoryTableFilter(e.target.value)}
                      className={`${classes.inputBg} border ${classes.inputBorder} text-[9px] px-2 py-1 ${classes.radiusCard} ${classes.textPrimary} focus:outline-none font-mono`}
                    >
                      <option value="all">Todas</option>
                      {tables.map(t => (
                        <option key={t.id} value={t.id}>{t.name}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className={`divide-y ${classes.borderCard}`}>
                  {historyOrdersList.map((ord) => {
                    const ordTotal = ord.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
                    const localTime = new Date(ord.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                    
                    return (
                      <div id={`history-row-${ord.id}`} key={ord.id} className={`p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 hover:${classes.bgCardHover} transition`}>
                        <div className="space-y-1">
                          <div className="flex items-center space-x-2">
                            <span className={`font-bold text-xs ${classes.textPrimary}`}>{ord.tableName}</span>
                            <span className={`text-[10px] ${classes.textMuted} font-mono`}>({localTime})</span>
                          </div>
                          <div className={`text-xs ${classes.textSecondary} space-y-0.5`}>
                            {ord.items.map((i, iIdx) => (
                              <div key={i.id || iIdx}>
                                <span>{i.quantity}x {i.name}</span>
                                {i.comment && (
                                  <span className="text-[10px] text-amber-500 italic ml-2">("{i.comment}")</span>
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
                          <span className={`font-black ${classes.textPrimary}`}>{formatPrice(ordTotal)}</span>
                          <span className={`px-2.5 py-1 ${classes.radiusPill} text-[9px] font-mono font-black uppercase border ${
                            ord.status === 'Entregado' 
                              ? `${classes.bgCard} ${classes.textMuted} border ${classes.borderCard}` 
                              : 'bg-rose-950/20 text-rose-400 border border-rose-950'
                          }`}>
                            {ord.status}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {historyOrdersList.length === 0 && (
                    <p className={`text-center py-12 ${classes.textMuted} italic text-xs leading-none`}>Ningún pedido cerrado aún en este turno.</p>
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
              className={`absolute inset-0 ${classes.glassOverlay}`}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} w-full max-w-md p-6 relative font-sans shadow-2xl`}
            >
              <div className="flex items-center space-x-2 text-rose-500 mb-4">
                <AlertTriangle className="w-5 h-5 shrink-0" />
                <h3 className={`font-black text-sm uppercase tracking-wider ${classes.textPrimary}`}>Cancelar Pedido de {selectedOrder.tableName}</h3>
              </div>

              <div className={`space-y-4 text-xs ${classes.textSecondary}`}>
                <p>El cliente verá reflejado el estado "Cancelado" inmediatamente. Por favor especifica las razones.</p>
                
                <div>
                  <label className={`block text-[10px] uppercase font-mono font-bold tracking-wider ${classes.textMuted} mb-1`}>
                    Motivo (Opcional)
                  </label>
                  <input
                    id="input-cancellation-reason"
                    type="text"
                    placeholder="Ej. Insumo agotado, error de caja..."
                    value={cancellationReason}
                    onChange={(e) => setCancellationReason(e.target.value)}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs ${classes.textPrimary} outline-none focus:border-amber-500 font-mono`}
                  />
                </div>

                {/* RF-A07 Core feature: Disable the causing menu item instantly */}
                <div className={`${classes.inputBg} border ${classes.borderCard} p-3.5 ${classes.radiusCard} space-y-2`}>
                  <div className="flex items-center space-x-1.5 text-amber-500 mb-1">
                    <CheckCircle className="w-4 h-4 shrink-0" />
                    <span className="font-semibold text-[11px]">Acción Inteligente: Deshabilitar Insumo</span>
                  </div>
                  <p className={`text-[10px] ${classes.textMuted} leading-normal mb-2`}>
                    Si el pedido fracasó porque algún plato se agotó en cocina, elígelo abajo para marcarlo automáticamente como **Agotado / Sin stock** en el menú digital.
                  </p>

                  <div className="space-y-1.5">
                    <label className={`flex items-center space-x-2 p-1 text-[10px] ${classes.textMuted} font-mono font-bold uppercase tracking-wider`}>
                      <span>Selecciona el plato causante:</span>
                    </label>
                    <select
                      id="cancellation-item-disabler"
                      value={disableItemOnCancelId}
                      onChange={(e) => setDisableItemOnCancelId(e.target.value)}
                      className={`w-full ${classes.bgCard} border ${classes.borderCard} p-2 ${classes.textPrimary} ${classes.radiusCard} text-xs`}
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

              <div className={`mt-6 pt-4 border-t ${classes.borderCard} flex items-center justify-end space-x-2.5`}>
                <button
                  id="btn-cancel-modal-close"
                  onClick={() => setIsCancelModalOpen(false)}
                  className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest ${classes.textMuted} hover:${classes.textPrimary} ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} transition cursor-pointer`}
                >
                  Regresar
                </button>
                <button
                  id="btn-confirm-cancel-order"
                  onClick={handleCancelOrder}
                  className={`px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-rose-600 hover:bg-rose-700 text-white ${classes.radiusBtn} transition cursor-pointer shadow-md`}
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
              className={`absolute inset-0 ${classes.glassOverlay}`}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} w-full max-w-sm p-6 relative font-sans shadow-2xl`}
            >
              <h3 className={`font-black text-sm uppercase tracking-wider mb-4 ${classes.textPrimary}`}>
                {editingCategory.id ? 'Editar Categoría' : 'Nueva Categoría'}
              </h3>

              <form onSubmit={handleSaveCategory} className={`space-y-4 text-xs font-sans ${classes.textSecondary}`}>
                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Nombre de Categoría
                  </label>
                  <input
                    id="input-category-name"
                    type="text"
                    required
                    value={editingCategory.name || ''}
                    onChange={(e) => setEditingCategory(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 font-mono ${classes.textPrimary}`}
                    placeholder="Ej. Postres, Vinos..."
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Orden de Visualización
                  </label>
                  <input
                    id="input-category-order"
                    type="number"
                    value={editingCategory.order || ''}
                    onChange={(e) => setEditingCategory(prev => ({ ...prev, order: parseInt(e.target.value) }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 font-mono ${classes.textPrimary}`}
                    placeholder="Ej. 1"
                  />
                </div>

                <div className={`pt-4 border-t ${classes.borderCard} flex items-center justify-end space-x-2.5`}>
                  <button
                    id="btn-category-modal-close"
                    type="button"
                    onClick={() => setIsCategoryModalOpen(false)}
                    className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest ${classes.textMuted} hover:${classes.textPrimary} ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} transition cursor-pointer`}
                  >
                    Descartar
                  </button>
                  <button
                    id="btn-category-modal-submit"
                    type="submit"
                    className={`px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-amber-500 text-zinc-950 hover:bg-amber-400 ${classes.radiusBtn} transition cursor-pointer shadow-md`}
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
              className={`absolute inset-0 ${classes.glassOverlay}`}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} w-full max-w-md p-6 relative font-sans shadow-2xl overflow-y-auto max-h-[90vh]`}
            >
              <h3 className={`font-black text-sm uppercase tracking-wider mb-4 ${classes.textPrimary}`}>
                {editingItem.id ? 'Editar Ítem de Menú' : 'Crear Plato / Ítem'}
              </h3>

              <form onSubmit={handleSaveMenuItem} className={`space-y-4 text-xs font-sans ${classes.textSecondary}`}>
                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Categoría
                  </label>
                  <select
                    id="selector-item-category"
                    required
                    value={editingItem.categoryId || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, categoryId: e.target.value }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 ${classes.textPrimary} font-mono`}
                  >
                    {categories.map(c => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Nombre del Ítem
                  </label>
                  <input
                    id="input-item-name"
                    type="text"
                    required
                    value={editingItem.name || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 ${classes.textPrimary}`}
                    placeholder="Ej. Suprema napolitana"
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Descripción del Plato
                  </label>
                  <textarea
                    id="input-item-description"
                    required
                    value={editingItem.description || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, description: e.target.value }))}
                    rows={3}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 leading-normal ${classes.textPrimary}`}
                    placeholder="Detalla los ingredientes y proporciones..."
                  />
                </div>

                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                      Monto de venta ($ ARS)
                    </label>
                    <input
                      id="input-item-price"
                      type="number"
                      required
                      value={editingItem.price || ''}
                      onChange={(e) => setEditingItem(prev => ({ ...prev, price: parseFloat(e.target.value) }))}
                      className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 font-mono ${classes.textPrimary}`}
                    />
                  </div>

                  <div>
                    <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                      Disponibilidad inicial
                    </label>
                    <select
                      id="selector-item-available"
                      value={editingItem.available ? 'true' : 'false'}
                      onChange={(e) => setEditingItem(prev => ({ ...prev, available: e.target.value === 'true' }))}
                      className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none ${classes.textPrimary} font-mono`}
                    >
                      <option value="true">Disponible (En stock)</option>
                      <option value="false">Agotado (Sin stock)</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    URL de la Imagen / Foto
                  </label>
                  <input
                    id="input-item-image"
                    type="url"
                    value={editingItem.imageUrl || ''}
                    onChange={(e) => setEditingItem(prev => ({ ...prev, imageUrl: e.target.value }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 font-mono ${classes.textPrimary}`}
                    placeholder="https://images.unsplash.com/photo-..."
                  />
                </div>

                <div className={`pt-4 border-t ${classes.borderCard} flex items-center justify-end space-x-2.5`}>
                  <button
                    id="btn-item-modal-close"
                    type="button"
                    onClick={() => setIsItemModalOpen(false)}
                    className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest ${classes.textMuted} hover:${classes.textPrimary} ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} transition cursor-pointer`}
                  >
                    Descartar
                  </button>
                  <button
                    id="btn-item-modal-submit"
                    type="submit"
                    className={`px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-amber-500 text-zinc-950 hover:bg-amber-400 ${classes.radiusBtn} transition cursor-pointer shadow-md`}
                  >
                    Guardar Ítem
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* MODAL: Cash close confirmation — irreversible, so it shows the amount first */}
      <AnimatePresence>
        {confirmCashClose && cashPreview && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.5 }}
              exit={{ opacity: 0 }}
              onClick={() => !isClosingCash && setConfirmCashClose(false)}
              className="absolute inset-0 bg-black"
            />
            <motion.div
              initial={{ opacity: 0, scale: 0.96 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.96 }}
              className={`relative w-full max-w-md ${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-6 space-y-5 shadow-2xl`}
            >
              <div className="space-y-1.5">
                <h3 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>Confirmar cierre de caja</h3>
                <p className={`text-xs ${classes.textMuted} font-medium`}>
                  Se van a cerrar <span className="font-black">{cashPreview.totals.orderCount}</span> pedidos entregados. Una vez cerrados no se pueden modificar.
                </p>
              </div>

              <div className={`${classes.inputBg} border ${classes.borderCard} ${classes.radiusCard} p-4 text-center`}>
                <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>Total a cerrar</span>
                <span className="text-2xl font-black text-amber-500">{formatPrice(cashPreview.totals.totalRevenue)}</span>
              </div>

              <div className="flex gap-2">
                <button
                  onClick={() => setConfirmCashClose(false)}
                  disabled={isClosingCash}
                  className={`flex-1 px-4 py-3 ${classes.radiusBtn} ${classes.inputBg} border ${classes.borderCard} ${classes.textSecondary} text-xs font-black uppercase tracking-widest cursor-pointer`}
                >
                  Cancelar
                </button>
                <button
                  id="btn-confirm-cash-close"
                  onClick={handleCashClose}
                  disabled={isClosingCash}
                  className={`flex-1 px-4 py-3 ${classes.radiusBtn} bg-amber-500 hover:bg-amber-400 text-zinc-950 text-xs font-black uppercase tracking-widest cursor-pointer disabled:opacity-60 disabled:cursor-wait`}
                >
                  {isClosingCash ? 'Cerrando…' : 'Confirmar'}
                </button>
              </div>
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
              className={`absolute inset-0 ${classes.glassOverlay}`}
            />

            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} w-full max-w-sm p-6 relative font-sans shadow-2xl`}
            >
              <h3 className={`font-black text-sm uppercase tracking-wider mb-4 ${classes.textPrimary}`}>
                {editingTable.id ? 'Editar Mesa' : 'Nueva Mesa QR'}
              </h3>

              <form onSubmit={handleSaveTable} className={`space-y-4 text-xs font-sans ${classes.textSecondary}`}>
                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Identificador / Nombre de la Mesa
                  </label>
                  <input
                    id="input-table-name"
                    type="text"
                    required
                    value={editingTable.name || ''}
                    onChange={(e) => setEditingTable(prev => ({ ...prev, name: e.target.value }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none focus:border-amber-500 ${classes.textPrimary}`}
                    placeholder="Ej. Mesa 14, Comedor Familiar..."
                  />
                </div>

                <div>
                  <label className={`block text-[10px] uppercase font-mono font-black tracking-widest ${classes.textMuted} mb-1`}>
                    Estado Operativo
                  </label>
                  <select
                    id="selector-table-active"
                    value={editingTable.active ? 'true' : 'false'}
                    onChange={(e) => setEditingTable(prev => ({ ...prev, active: e.target.value === 'true' }))}
                    className={`w-full ${classes.inputBg} border ${classes.inputBorder} p-3 ${classes.radiusCard} text-xs outline-none ${classes.textPrimary} font-mono`}
                  >
                    <option value="true">Activa (Acepta comensales y pedidos)</option>
                    <option value="false">Inactiva (Fuera de servicio / Bloqueada)</option>
                  </select>
                </div>

                <div className={`pt-4 border-t ${classes.borderCard} flex items-center justify-end space-x-2.5`}>
                  <button
                    id="btn-table-modal-close"
                    type="button"
                    onClick={() => setIsTableModalOpen(false)}
                    className={`px-4 py-2.5 text-xs font-black uppercase tracking-widest ${classes.textMuted} hover:${classes.textPrimary} ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} transition cursor-pointer`}
                  >
                    Descartar
                  </button>
                  <button
                    id="btn-table-modal-submit"
                    type="submit"
                    className={`px-5 py-2.5 text-xs font-black uppercase tracking-widest bg-amber-500 text-zinc-950 hover:bg-amber-400 ${classes.radiusBtn} transition cursor-pointer shadow-md`}
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
