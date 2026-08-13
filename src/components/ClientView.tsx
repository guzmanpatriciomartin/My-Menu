import React, { useState, useEffect, useMemo } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Search, 
  ShoppingBag, 
  Plus, 
  Minus, 
  ChevronRight, 
  Clock, 
  Check, 
  X, 
  MessageSquare, 
  ArrowLeft, 
  Sparkles, 
  CheckCircle, 
  AlertTriangle,
  RotateCcw,
  Globe,
  Palette,
  Utensils,
  Bell,
  User,
  Receipt,
  FileText
} from 'lucide-react';
import { Establishment, Category, MenuItem, Table, Order, OrderItem, OrderStatus } from '../types';
import { useTheme } from '../theme/ThemeContext';
import ThemeTriggerButton from './ThemeTriggerButton';

interface ClientViewProps {
  establishmentId: string;
  tableId: string;
  onBackToLauncher: () => void;
}

export default function ClientView({ establishmentId, tableId, onBackToLauncher }: ClientViewProps) {
  const { classes, isDark } = useTheme();
  // Lang state (RF-C11)
  const [lang, setLang] = useState<'es' | 'en'>('es');

  // Load browser language automatically
  useEffect(() => {
    try {
      const browserLang = navigator.language || (navigator as any).userLanguage;
      if (browserLang && browserLang.startsWith('en')) {
        setLang('en');
      } else {
        setLang('es');
      }
    } catch (e) {
      // Fallback
    }
  }, []);

  const t = {
    es: {
      searchPlaceholder: 'Buscar en el menú...',
      all: 'Todos',
      addedToCart: '¡Agregado al carrito!',
      cartTitle: 'Tu Pedido',
      emptyCart: 'Tu carrito está vacío.',
      tipTitle: '💡 Consejo del Chef',
      tipBody: '¿Tienes alguna preferencia o alergia? Haz clic en "Agregar nota" en cada ítem del carrito para personalizarlo (ej. "sin cebolla", "bien cocido").',
      addNote: 'Agregar nota',
      editNote: 'Editar nota',
      notePlaceholder: 'Ej: sin aderezos, bien cocido...',
      total: 'Total',
      sendOrder: 'Confirmar y Enviar Pedido',
      sending: 'Enviando...',
      orderSuccess: '¡Pedido Enviado!',
      orderSuccessSub: 'Tu pedido ha sido recibido y se confirmará de inmediato.',
      activeOrders: 'Pedidos Activos en la Mesa',
      orderId: 'Pedido #',
      status: 'Estado',
      time: 'Hora',
      noActiveOrders: 'No tienes pedidos activos en esta sesión.',
      backMenu: 'Volver al Menú',
      soldOut: 'Agotado',
      addToCart: 'Agregar al Carrito',
      backToLaucher: 'Volver al Inicio',
      historyTitle: 'Historial de Sesión',
      reason: 'Motivo:',
      clearSession: 'Limpiar sesión / Nueva mesa',
      clearSessionConfirm: '¿Deseas borrar el historial de pedidos anteriores para esta mesa?',
      statusRecibido: 'Recibido',
      statusPreparacion: 'En preparación',
      statusListo: 'Listo para retirar',
      statusEntregado: 'Entregado',
      statusCancelado: 'Cancelado',
      statusCancelDesc: 'Este bocado no pudo ser preparado. Revisa los detalles.',
      readyNotice: '🛎️ ¡Tu pedido está listo! Retíralo en la barra o aguarda un momento.',
      limitReached: 'Límite de caracteres (200 max)',
    },
    en: {
      searchPlaceholder: 'Search the menu...',
      all: 'All',
      addedToCart: 'Added to cart!',
      cartTitle: 'Your Order',
      emptyCart: 'Your cart is empty.',
      tipTitle: '💡 Chef Tip',
      tipBody: 'Have any preferences or allergies? Feel free to add custom notes on any cart item to customize it (eg: "no onions", "medium-well").',
      addNote: 'Add custom note',
      editNote: 'Edit note',
      notePlaceholder: 'Eg: no dressing, extra crispy...',
      total: 'Total',
      sendOrder: 'Confirm & Place Order',
      sending: 'Sending...',
      orderSuccess: 'Order Placed!',
      orderSuccessSub: 'Your order has been received and confirmed automatically.',
      activeOrders: 'Active Table Orders',
      orderId: 'Order #',
      status: 'Status',
      time: 'Placed at',
      noActiveOrders: 'No active orders in this session.',
      backMenu: 'Back to Menu',
      soldOut: 'Sold Out',
      addToCart: 'Add to Cart',
      backToLaucher: 'Back to Demo Launcher',
      historyTitle: 'Session History',
      reason: 'Reason:',
      clearSession: 'Clear session / New table',
      clearSessionConfirm: 'Do you want to clear previous orders history for this table?',
      statusRecibido: 'Received',
      statusPreparacion: 'In preparation',
      statusListo: 'Ready for pick-up',
      statusEntregado: 'Delivered',
      statusCancelado: 'Cancelled',
      statusCancelDesc: 'This item could not be prepared. Check details.',
      readyNotice: '🛎️ Your order is ready! Pick it up at the bar or wait for service.',
      limitReached: 'Character limit reached (max 200)',
    }
  }[lang];

  // Check if accessed via QR URL or QR scanner session
  const isQrAccess = useMemo(() => {
    if (typeof window === 'undefined') return false;
    try {
      const params = new URLSearchParams(window.location.search);
      return !!(params.get('establishment') || params.get('table'));
    } catch {
      return false;
    }
  }, []);

  // Data states
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  
  // When the current sitting started. Compared against the table's closedAt so a past
  // close does not terminate the session of the next diner.
  const sessionStartKey = `mimenu_session_start_${establishmentId}_${tableId}`;

  // Diner name session state
  const [dinerName, setDinerName] = useState<string>(() => {
    try {
      return localStorage.getItem(`mimenu_diner_${establishmentId}_${tableId}`) || '';
    } catch {
      return '';
    }
  });
  const [nameInput, setNameInput] = useState<string>('');
  const [isWelcomeModalOpen, setIsWelcomeModalOpen] = useState<boolean>(() => {
    try {
      return !localStorage.getItem(`mimenu_diner_${establishmentId}_${tableId}`);
    } catch {
      return true;
    }
  });
  const [sessionEnded, setSessionEnded] = useState<boolean>(false);
  const [callSending, setCallSending] = useState<boolean>(false);
  const [callNotice, setCallNotice] = useState<string | null>(null);

  // Interaction states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Array<{ item: MenuItem; quantity: number; comment: string }>>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  
  // Notification states
  const [addedItemName, setAddedItemName] = useState<string | null>(null);
  const [tipDismissed, setTipDismissed] = useState(false);
  const [waiterCallCooldown, setWaiterCallCooldown] = useState(0);
  const [billRequestCooldown, setBillRequestCooldown] = useState(0);

  // Cooldown countdown effect
  useEffect(() => {
    if (waiterCallCooldown <= 0 && billRequestCooldown <= 0) return;
    const timer = setInterval(() => {
      setWaiterCallCooldown(prev => Math.max(0, prev - 1));
      setBillRequestCooldown(prev => Math.max(0, prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [waiterCallCooldown, billRequestCooldown]);

  // Persistence of submitted orders (Session based, RF-C10)
  const [sessionOrderIds, setSessionOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`mimenu_orders_${establishmentId}_${tableId}`);
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? Array.from(new Set<string>(parsed)) : [];
    } catch {
      return [];
    }
  });

  const [activeOrders, setActiveOrders] = useState<Order[]>([]);

  // Fetch initial establishment data
  const loadData = async () => {
    try {
      const [estRes, catRes, menuRes, tabRes] = await Promise.all([
        fetch(`/api/establishments/${establishmentId}`).then(r => r.json()),
        fetch(`/api/establishments/${establishmentId}/categories`).then(r => r.json()),
        fetch(`/api/establishments/${establishmentId}/menu-items`).then(r => r.json()),
        fetch(`/api/establishments/${establishmentId}/tables`).then(r => r.json())
      ]);

      setEstablishment(estRes);
      setCategories(catRes);
      setMenuItems(menuRes);
      setTables(tabRes);
    } catch (e) {
      console.error('Error fetching client data', e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, [establishmentId]);

  // Sync active orders from sessionOrderIds
  useEffect(() => {
    const fetchSessionOrders = async () => {
      if (sessionOrderIds.length === 0) {
        setActiveOrders([]);
        return;
      }
      try {
        const uniqueIds = Array.from(new Set(sessionOrderIds));
        // F-4: scoped lookup — we only ask for OUR own order ids on OUR table.
        // The server never enumerates other diners' orders.
        const res = await fetch(`/api/establishments/${establishmentId}/orders/lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId, orderIds: uniqueIds }),
        });
        const matchingOrders: Order[] = await res.json();
        if (Array.isArray(matchingOrders)) {
          const map = new Map<string, Order>();
          matchingOrders.forEach(o => map.set(o.id, o));
          const sorted = Array.from(map.values()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          setActiveOrders(sorted);
        }
      } catch (err) {
        console.error('Error loading session orders:', err);
      }
    };

    fetchSessionOrders();

    // Set up short polling (fallback in case socket closed or SSE delayed, giving absolute guarantee)
    const interval = setInterval(fetchSessionOrders, 4000);
    return () => clearInterval(interval);
  }, [sessionOrderIds, establishmentId, tableId]);

  // Connect to SSE for instant real-time status updates (RF-C08)
  useEffect(() => {
    let sse: EventSource | null = null;
    try {
      // F-6: identify as a diner for THIS establishment + table. The server only
      // streams us MENU_CHANGED and status changes for our own table.
      sse = new EventSource(
        `/api/realtime?establishmentId=${encodeURIComponent(establishmentId)}&tableId=${encodeURIComponent(tableId)}`
      );

      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ORDER_CREATED' && msg.payload.establishmentId === establishmentId && msg.payload.order.tableId === tableId) {
            const newOrd: Order = msg.payload.order;
            setSessionOrderIds(prev => {
              if (!prev.includes(newOrd.id)) {
                const next = [...prev, newOrd.id];
                try {
                  localStorage.setItem(`mimenu_orders_${establishmentId}_${tableId}`, JSON.stringify(next));
                } catch (err) {}
                return next;
              }
              return prev;
            });
            setActiveOrders(prev => {
              const map = new Map<string, Order>();
              map.set(newOrd.id, newOrd);
              prev.forEach(o => map.set(o.id, o));
              return Array.from(map.values()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
            });
          } else if (msg.type === 'ORDER_STATUS_CHANGED') {
            const updatedOrder: Order = msg.payload.order;
            if (sessionOrderIds.includes(updatedOrder.id)) {
              setActiveOrders(prev => {
                const map = new Map<string, Order>();
                prev.forEach(o => map.set(o.id, o));
                map.set(updatedOrder.id, updatedOrder);
                return Array.from(map.values()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
              });
            }
          } else if (msg.type === 'MENU_CHANGED' && msg.payload.establishmentId === establishmentId) {
            // Hot reload menu availability in real-time
            fetch(`/api/establishments/${establishmentId}/menu-items`)
              .then(r => r.json())
              .then(items => setMenuItems(items));
          } else if (msg.type === 'TABLE_SESSION_CLOSED' && msg.payload.establishmentId === establishmentId) {
            handleEndClientSession();
          }
        } catch (e) {
          // ignore parsing errors
        }
      };
    } catch (e) {
      console.warn('Real-time updates failed to initialize', e);
    }

    return () => {
      if (sse) sse.close();
    };
  }, [sessionOrderIds, establishmentId, tableId]);

  // Solve correct table name
  const tableName = useMemo(() => {
    const found = tables.find(t => t.id === tableId);
    return found ? found.name : 'Mesa';
  }, [tables, tableId]);

  // Client menu filtration (RF-C09)
  const filteredMenuItems = useMemo(() => {
    let result = menuItems;
    
    // Filter by Category
    if (selectedCategory !== 'all') {
      result = result.filter(item => item.categoryId === selectedCategory);
    }

    // Filter by Search Query (debounce or immediate matches)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.name.toLowerCase().includes(q) || 
        item.description.toLowerCase().includes(q)
      );
    }

    return result;
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart operations
  const addToCart = (product: MenuItem) => {
    if (product.available === false) return; // Agotado blocker (RF-C03)

    setCart(prev => {
      const exists = prev.find(item => item.item.id === product.id);
      if (exists) {
        return prev.map(item => 
          item.item.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { item: product, quantity: 1, comment: '' }];
    });

    setAddedItemName(product.name);
    setTimeout(() => {
      setAddedItemName(null);
    }, 2500);
  };

  const removeFromCart = (productId: string) => {
    setCart(prev => {
      const item = prev.find(i => i.item.id === productId);
      if (!item) return prev;
      if (item.quantity === 1) {
        return prev.filter(i => i.item.id !== productId);
      }
      return prev.map(i => 
        i.item.id === productId ? { ...i, quantity: i.quantity - 1 } : i
      );
    });
  };

  const updateItemComment = (productId: string, comment: string) => {
    const truncated = comment.slice(0, 200); // 200 max character cap
    setCart(prev => prev.map(i => 
      i.item.id === productId ? { ...i, comment: truncated } : i
    ));
  };

  const cartTotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + (item.item.price * item.quantity), 0);
  }, [cart]);

  const cartQuantity = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  // Wipe client session and show completion screen when table is closed by admin
  const handleEndClientSession = () => {
    try {
      localStorage.removeItem(`mimenu_orders_${establishmentId}_${tableId}`);
      localStorage.removeItem(`mimenu_diner_${establishmentId}_${tableId}`);
      // Dropped too, so the next diner stamps a fresh start instead of inheriting one
      // older than the close that just happened.
      localStorage.removeItem(sessionStartKey);
    } catch (err) {}
    setSessionOrderIds([]);
    setActiveOrders([]);
    setCart([]);
    setDinerName('');
    setNameInput('');
    setSessionEnded(true);
  };

  // Check if the table was closed by the staff (polling).
  //
  // The server remembers the LAST closedAt of a table indefinitely, so "closedAt exists"
  // is not enough to end a session: after a close, the next diner would be wiped and
  // re-prompted for their name every poll. We only end the session when the table was
  // closed AFTER this sitting started.
  useEffect(() => {
    if (sessionEnded) return; // already finished — nothing left to wipe

    const checkSessionStatus = async () => {
      try {
        const res = await fetch(`/api/establishments/${establishmentId}/tables/${tableId}/session`);
        if (!res.ok) return;
        const data = await res.json();
        if (!data.closedAt) return;

        const startedAt = (() => {
          try {
            return localStorage.getItem(sessionStartKey);
          } catch {
            return null;
          }
        })();

        // No stamp means this session predates the fix; treat the close as already
        // consumed and stamp now, so an old close cannot loop the UI.
        if (!startedAt) {
          try {
            localStorage.setItem(sessionStartKey, new Date().toISOString());
          } catch (err) {}
          return;
        }

        if (new Date(data.closedAt).getTime() > new Date(startedAt).getTime()) {
          handleEndClientSession();
        }
      } catch (e) {
        // ignore network error during polling
      }
    };

    const interval = setInterval(checkSessionStatus, 4000);
    return () => clearInterval(interval);
  }, [establishmentId, tableId, sessionEnded]);

  // Send table call to waiter / request bill
  const handleSendTableCall = async (type: 'waiter_call' | 'bill_request') => {
    if (callSending) return;
    if (type === 'waiter_call' && waiterCallCooldown > 0) return;
    if (type === 'bill_request' && billRequestCooldown > 0) return;

    setCallSending(true);
    try {
      const res = await fetch(`/api/establishments/${establishmentId}/calls`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tableId,
          dinerName: dinerName || 'Mesa',
          type,
        }),
      });
      if (res.ok) {
        if (type === 'waiter_call') setWaiterCallCooldown(30);
        if (type === 'bill_request') setBillRequestCooldown(30);
        const msg = type === 'waiter_call' ? '🛎️ ¡Se ha notificado al mozo!' : '🧾 ¡Se ha solicitado la cuenta!';
        setCallNotice(msg);
        setTimeout(() => setCallNotice(null), 3500);
      }
    } catch (err) {
      console.error('Error sending call', err);
    } finally {
      setCallSending(false);
    }
  };

  // Submit actual order to server (RF-C07)
  const submitOrder = async () => {
    if (cart.length === 0 || orderSubmitting) return;
    setOrderSubmitting(true);

    try {
      // F-3: send only menuItemId + quantity + comment. The server recomputes
      // name/price from the catalog and rejects unavailable items, so we never trust
      // client-side prices.
      const items = cart.map(c => ({
        menuItemId: c.item.id,
        quantity: c.quantity,
        comment: c.comment.trim() || undefined
      }));

      const res = await fetch(`/api/establishments/${establishmentId}/orders`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({
          tableId,
          dinerName: dinerName || nameInput || 'Comensal',
          items
        })
      });

      if (res.status === 409) {
        // Some items became unavailable between browsing and checkout.
        await res.json().catch(() => null);
        alert('Algunos ítems ya no están disponibles. Actualizamos el menú, revisá tu pedido.');
        loadData();
        return;
      }

      if (!res.ok) throw new Error('Failed to create order');
      const orderObj: Order = await res.json();

      // Clear local cart immediately to prevent re-submitting old items
      setCart([]);
      setIsCartOpen(false);

      // Store in session list
      const updatedSessions = Array.from(new Set([...sessionOrderIds, orderObj.id]));
      setSessionOrderIds(updatedSessions);
      try {
        localStorage.setItem(`mimenu_orders_${establishmentId}_${tableId}`, JSON.stringify(updatedSessions));
      } catch (err) {}

      // Immediately display order in Active Table Orders UI
      setActiveOrders(prev => {
        const map = new Map<string, Order>();
        map.set(orderObj.id, orderObj);
        prev.forEach(o => map.set(o.id, o));
        return Array.from(map.values()).sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
      });

      // Trigger temporary success screen
      setShowSuccessBadge(true);
      setTimeout(() => {
        setShowSuccessBadge(false);
      }, 5000);

    } catch (e) {
      alert('Error al enviar el pedido. Por favor intenta de nuevo.');
      console.error(e);
    } finally {
      setOrderSubmitting(false);
    }
  };

  const [showSuccessBadge, setShowSuccessBadge] = useState(false);

  // Helpers for order state visualization
  const getStatusColor = (status: OrderStatus) => {
    switch (status) {
      case 'Recibido': return 'bg-amber-100 text-amber-800 border-amber-200';
      case 'En preparación': return 'bg-indigo-100 text-indigo-800 border-indigo-200';
      case 'Listo': return 'bg-emerald-100 text-emerald-800 border-emerald-300 animate-pulse';
      case 'Entregado': return 'bg-gray-100 text-gray-700 border-gray-200';
      case 'Cancelado': return 'bg-rose-100 text-rose-800 border-rose-200';
      default: return 'bg-gray-100 text-gray-800';
    }
  };

  const getStatusIcon = (status: OrderStatus) => {
    switch (status) {
      case 'Recibido': return <Clock className="w-4 h-4 text-amber-600" />;
      case 'En preparación': return <Sparkles className="w-4 h-4 text-indigo-600" />;
      case 'Listo': return <CheckCircle className="w-4 h-4 text-emerald-600" />;
      case 'Entregado': return <Check className="w-4 h-4 text-gray-400" />;
      case 'Cancelado': return <X className="w-4 h-4 text-rose-600" />;
    }
  };

  const formatPrice = (price: number) => {
    return new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS', minimumFractionDigits: 0 }).format(price);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-zinc-950 flex flex-col items-center justify-center p-6 selection:bg-amber-500">
        <div className="flex flex-col items-center space-y-6 text-center">
          <div className="w-10 h-10 border-2 border-white border-t-transparent rounded-full animate-spin mb-2"></div>
          <p className="text-xs font-black uppercase tracking-[0.25em] text-zinc-400">Cargando catálogo / Loading...</p>
        </div>
      </div>
    );
  }

  const primaryColor = establishment?.accentColor || '#d97706';

  return (
    <div className={`min-h-screen ${classes.bgApp} pb-24 relative font-sans transition-colors duration-300`}>
      
      {/* Floating success screen (RF-C07) */}
      <AnimatePresence>
        {showSuccessBadge && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className={`fixed top-4 left-4 right-4 z-50 ${classes.bgCard} ${classes.textPrimary} p-4 ${classes.radiusCard} shadow-2xl flex items-center space-x-3 border ${classes.borderCard} font-sans`}
          >
            <div className={`p-2 ${classes.badgeAccent} ${classes.radiusBtn} shrink-0`}>
              <Check className="w-5 h-5 text-current" />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-wider text-xs">{t.orderSuccess}</h4>
              <p className={`text-[11px] ${classes.textMuted} font-medium`}>{t.orderSuccessSub}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Static Header Section */}
      <header className={`${classes.bgHeader} ${classes.blurClass} sticky top-0 z-30 transition-all`}>
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between">
          {!isQrAccess ? (
            <button 
              id="btn-back-to-launcher"
              onClick={onBackToLauncher}
              className={`p-2 ${classes.textMuted} hover:${classes.textPrimary} transition ${classes.radiusBtn} flex items-center justify-center`}
              title={t.backToLaucher}
            >
              <ArrowLeft className="w-5 h-5" />
            </button>
          ) : (
            <div className={`p-2 ${classes.textMuted} flex items-center justify-center`}>
              <Utensils className="w-5 h-5 text-amber-500" />
            </div>
          )}
          
          <div className="text-center flex-1 mx-2">
            <h1 className={`font-sans font-black text-lg tracking-tight uppercase line-clamp-1 ${classes.textPrimary}`}>
              {establishment?.name}
            </h1>
            <p className={`text-[9px] font-mono tracking-[0.2em] ${classes.textMuted} uppercase mt-0.5`}>
              {tableName} · {t.statusRecibido} vía QR
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {/* Lang switcher (RF-C11) */}
            <button 
              id="btn-lang-switcher"
              onClick={() => setLang(prev => prev === 'es' ? 'en' : 'es')}
              className={`p-2 ${classes.textMuted} hover:${classes.textPrimary} ${classes.radiusBtn} flex items-center justify-center text-[10px] font-black uppercase tracking-widest`}
              title="Cambiar idioma / Change language"
            >
              <Globe className="w-3.5 h-3.5 mr-1 text-current" />
              {lang}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-6">
        
        {/* Banner with Restaurant Details & Call Actions */}
        <div className={`${classes.bgCard} ${classes.radiusCard} p-5 border ${classes.borderCard} space-y-4`}>
          <p className={`text-xs ${classes.textSecondary} leading-relaxed font-medium italic`}>{establishment?.description}</p>
          
          <div className={`pt-3 border-t ${classes.borderDivider} flex items-center justify-between gap-2`}>
            <div className="flex items-center space-x-2">
              <div className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></div>
              <span className={`text-xs font-black uppercase tracking-wide ${classes.textPrimary}`}>
                {dinerName ? `Hola, ${dinerName}` : tableName}
              </span>
            </div>

            <div className="flex items-center space-x-2">
              <button
                id="btn-call-waiter"
                onClick={() => handleSendTableCall('waiter_call')}
                disabled={callSending || waiterCallCooldown > 0}
                className={`px-3 py-1.5 rounded-xl border ${classes.borderCard} ${classes.bgApp} hover:border-amber-500 text-[10px] font-black uppercase tracking-wider ${classes.textPrimary} flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                title={waiterCallCooldown > 0 ? `Llamado enviado (${waiterCallCooldown}s)` : 'Llamar al mozo a la mesa'}
              >
                <Bell className={`w-3.5 h-3.5 ${waiterCallCooldown > 0 ? 'text-amber-400 animate-pulse' : 'text-amber-500'}`} />
                <span>{waiterCallCooldown > 0 ? `Mozo (${waiterCallCooldown}s)` : 'Mozo'}</span>
              </button>

              <button
                id="btn-request-bill"
                onClick={() => handleSendTableCall('bill_request')}
                disabled={callSending || billRequestCooldown > 0}
                className={`px-3 py-1.5 rounded-xl border ${classes.borderCard} ${classes.bgApp} hover:border-emerald-500 text-[10px] font-black uppercase tracking-wider ${classes.textPrimary} flex items-center space-x-1.5 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
                title={billRequestCooldown > 0 ? `Solicitud enviada (${billRequestCooldown}s)` : 'Pedir la cuenta de la mesa'}
              >
                <ShoppingBag className={`w-3.5 h-3.5 ${billRequestCooldown > 0 ? 'text-emerald-400 animate-pulse' : 'text-emerald-500'}`} />
                <span>{billRequestCooldown > 0 ? `Cuenta pedida (${billRequestCooldown}s)` : 'Pedir Cuenta'}</span>
              </button>
            </div>
          </div>
        </div>

        {/* Call Toast Notification */}
        <AnimatePresence>
          {callNotice && (
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="fixed top-16 left-4 right-4 z-40 bg-amber-500 text-zinc-950 font-black text-xs px-4 py-3 rounded-xl text-center shadow-xl uppercase tracking-wider border border-amber-400"
            >
              {callNotice}
            </motion.div>
          )}
        </AnimatePresence>

        {/* Dynamic Prominent Tip Banner (RF-C04) — Notice about Custom Notes */}
        {!tipDismissed && (
          <motion.div 
            id="chef-tip-banner"
            layout
            className={`p-4 ${classes.radiusCard} border ${classes.borderCard} ${classes.bgCard} ${classes.textSecondary} flex items-start space-x-3 relative`}
          >
            <Sparkles className="w-4.5 h-4.5 shrink-0 text-amber-500 mt-0.5" />
            <div className="pr-6">
              <h4 className="text-[10px] uppercase tracking-[0.25em] font-black text-amber-500 mb-1">{t.tipTitle}</h4>
              <p className={`text-[11px] ${classes.textMuted} leading-relaxed font-medium`}>{t.tipBody}</p>
            </div>
            <button 
              id="btn-dismiss-tip"
              onClick={() => setTipDismissed(true)}
              className={`absolute top-2 right-2 p-1 ${classes.textMuted} hover:${classes.textPrimary} transition`}
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

        {/* Real-time Diners Session Orders (RF-C08, RF-C10) */}
        {activeOrders.length > 0 && (
          <div className={`p-4.5 ${classes.bgCard} ${classes.radiusCard} border ${classes.borderCard} shadow-xl space-y-4`}>
            <div className={`flex items-center justify-between border-b ${classes.borderDivider} pb-2.5`}>
              <h3 className={`text-[10px] font-black tracking-[0.25em] uppercase ${classes.textMuted} font-sans flex items-center`}>
                <Clock className="w-3.5 h-3.5 mr-2 animate-pulse text-amber-500" />
                {t.activeOrders}
              </h3>
              <div className="flex items-center space-x-2">
                <span className={`text-[9px] ${classes.badgeMuted} ${classes.radiusPill} px-2.5 py-0.5 font-mono font-bold tracking-wider uppercase`}>
                  {activeOrders.length} {activeOrders.length === 1 ? 'pedido' : 'pedidos'}
                </span>
              </div>
            </div>

            <div className={`space-y-4 divide-y ${classes.borderDivider}`}>
              {activeOrders.map((ord, idx) => {
                const timeStr = new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={ord.id} className={`pt-3.5 ${idx === 0 ? '' : 'pt-4'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className={`text-xs font-mono font-bold ${classes.textSecondary}`}>
                            {ord.dinerName ? `${ord.dinerName} (${ord.id.slice(-4)})` : `${t.orderId}${ord.id.slice(-4)}`}
                          </p>
                          <span className={`text-[10px] ${classes.textMuted} font-mono`}>({timeStr})</span>
                        </div>
                        <div className="mt-1 space-y-1.5">
                          {ord.items.map((i, iIdx) => {
                            const matched = menuItems.find(m => m.id === i.menuItemId);
                            return (
                              <div key={i.id || iIdx} className="flex items-center justify-between space-x-2">
                                <div>
                                  <p className={`text-[11px] ${classes.textMuted}`}>
                                    <span className="font-bold">{i.quantity}x</span> {i.name}
                                  </p>
                                  {i.comment && (
                                    <p className="text-[10px] text-amber-500 italic pl-2.5 border-l-2 border-amber-500/50 mt-0.5">
                                      "{i.comment}"
                                    </p>
                                  )}
                                </div>
                                {matched && matched.available !== false && (
                                  <button
                                    id={`btn-reorder-item-${matched.id}`}
                                    onClick={() => {
                                      addToCart(matched);
                                      setIsCartOpen(true);
                                    }}
                                    className={`px-2 py-0.5 text-[9px] font-black uppercase tracking-wider ${classes.secondaryBtn} ${classes.radiusBtn} border border-amber-500/30 text-amber-500 flex items-center space-x-1 hover:bg-amber-500/10 transition shrink-0 cursor-pointer`}
                                    title="Sumar 1 más al carrito"
                                  >
                                    <Plus className="w-2.5 h-2.5" />
                                    <span>Sumar</span>
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                      <span className={`text-[9px] uppercase font-black px-2.5 py-0.5 ${classes.radiusPill} border flex items-center space-x-1 ${getStatusColor(ord.status)}`}>
                        {getStatusIcon(ord.status)}
                        <span className="tracking-wider">
                          {ord.status === 'Recibido' ? t.statusRecibido :
                           ord.status === 'En preparación' ? t.statusPreparacion :
                           ord.status === 'Listo' ? t.statusListo :
                           ord.status === 'Entregado' ? t.statusEntregado :
                           t.statusCancelado}
                        </span>
                      </span>
                    </div>

                    {/* Specific notices per state */}
                    {ord.status === 'Listo' && (
                      <div className={`mt-2 text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2.5 ${classes.radiusCard} font-medium`}>
                        {t.readyNotice}
                      </div>
                    )}

                    {ord.status === 'Cancelado' && (
                      <div className={`mt-2 text-[11px] bg-rose-500/10 border border-rose-500/30 text-rose-400 p-2.5 ${classes.radiusCard}`}>
                        <p className="font-bold flex items-center uppercase tracking-wide text-[10px]">
                          <AlertTriangle className="w-3.5 h-3.5 mr-1" />
                          {t.statusCancelDesc}
                        </p>
                        {ord.cancellationReason && (
                          <p className="text-[10px] text-rose-300 mt-1 italic">
                            {t.reason} "{ord.cancellationReason}"
                          </p>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Dynamic Search & Debounced-like instant filter (RF-C09) */}
        <div className="relative">
          <input
            id="input-search-menu"
            type="text"
            placeholder={t.searchPlaceholder}
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className={`w-full ${classes.inputBg} ${classes.radiusCard} pl-11 pr-10 py-3.5 border ${classes.inputBorder} text-sm focus:outline-none transition-all font-medium`}
          />
          <Search className={`w-4.5 h-4.5 ${classes.textMuted} absolute left-4 top-4`} />
          {searchQuery && (
            <button 
              id="btn-clear-search"
              onClick={() => setSearchQuery('')}
              className={`absolute right-3 top-3 p-1.5 ${classes.radiusBtn} ${classes.textMuted} hover:${classes.textPrimary}`}
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Custom categories horizontal scroller (RF-C02) */}
        <div className="overflow-x-auto scrollbar-none -mx-4 px-4 py-1">
          <div className="flex space-x-2.5 min-w-max">
            <button
              id={`cat-tab-all`}
              onClick={() => setSelectedCategory('all')}
              className={`px-4.5 py-2.5 ${classes.radiusBtn} text-[11px] font-black uppercase tracking-wider transition-all border ${
                selectedCategory === 'all'
                  ? `${classes.primaryBtn}`
                  : `${classes.secondaryBtn}`
              }`}
            >
              {t.all}
            </button>
            {categories.map((cat) => (
              <button
                id={`cat-tab-${cat.id}`}
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4.5 py-2.5 ${classes.radiusBtn} text-[11px] font-black uppercase tracking-wider transition-all border ${
                  selectedCategory === cat.id
                    ? `${classes.primaryBtn}`
                    : `${classes.secondaryBtn}`
                }`}
              >
                {cat.name}
              </button>
            ))}
          </div>
        </div>

        {/* Menu Items Grid Layout (RF-C02) */}
        <div className="space-y-4">
          <AnimatePresence mode="popLayout">
            {filteredMenuItems.map((item) => (
              <motion.div
                id={`menu-item-row-${item.id}`}
                key={item.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                className={`${classes.bgCard} ${classes.borderCard} ${classes.radiusCard} ${classes.bgCardHover} p-4 flex items-start space-x-5 transition-all relative ${
                  item.available === false ? 'opacity-40' : ''
                }`}
              >
                {/* Photo or Premium Placeholder */}
                <div className={`w-20 h-20 ${classes.radiusCard} overflow-hidden shrink-0 bg-black/20 relative border ${classes.borderCard}`}>
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200';
                    }}
                  />
                  {item.available === false && (
                    <div className="absolute inset-0 bg-black/60 flex items-center justify-center">
                      <span className="text-[9px] font-black text-white uppercase tracking-wider font-mono px-2 py-0.5 border border-white/35 bg-black/80">
                        {t.soldOut}
                      </span>
                    </div>
                  )}
                </div>

                {/* Info & Content */}
                <div className="flex-1 min-w-0 pr-1 flex flex-col justify-between h-20">
                  <div>
                    <h3 className={`font-sans font-black text-sm ${classes.textPrimary} uppercase tracking-tight line-clamp-1 leading-tight`}>
                      {item.name}
                    </h3>
                    <p className={`text-[11px] ${classes.textMuted} line-clamp-2 mt-1 leading-relaxed font-medium`}>
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <span id={`price-display-${item.id}`} className={`font-mono text-xs font-black tracking-wide ${classes.textAccent}`}>
                      {formatPrice(item.price)}
                    </span>

                    {item.available !== false ? (
                      <button
                        id={`btn-add-item-${item.id}`}
                        onClick={() => addToCart(item)}
                        className={`w-8 h-8 ${classes.radiusBtn} ${classes.primaryBtn} flex items-center justify-center transition-all cursor-pointer shadow-md`}
                      >
                        <Plus className="w-4 h-4 font-black" />
                      </button>
                    ) : (
                      <span className={`text-[10px] ${classes.textMuted} font-mono italic uppercase tracking-wider`}>
                        {t.soldOut}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredMenuItems.length === 0 && (
            <div className={`text-center py-16 px-4 ${classes.bgCard} ${classes.radiusCard} border ${classes.borderCard}`}>
              <Search className={`w-8 h-8 ${classes.textMuted} mx-auto mb-3`} />
              <p className={`text-xs ${classes.textMuted} font-bold uppercase tracking-wider`}>No se encontraron bocados que coincidan.</p>
            </div>
          )}
        </div>
      </main>

      {/* Floating item notification badge */}
      <AnimatePresence>
        {addedItemName && (
          <motion.div 
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="fixed bottom-24 left-6 right-6 z-40 bg-white text-black p-4 rounded-none shadow-2xl flex items-center justify-center space-x-2 border-2 border-zinc-900"
          >
            <Check className="w-4 h-4 text-black shrink-0 font-extrabold" />
            <span className="text-xs font-black uppercase tracking-wider whitespace-nowrap truncate max-w-[160px]">
              {addedItemName}
            </span>
            <span className="text-[10px] text-zinc-650 font-mono">({t.addedToCart})</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bottom Sticky Action Rail */}
      {cartQuantity > 0 && (
        <div className={`fixed bottom-0 left-0 right-0 z-40 ${classes.bgHeader} ${classes.blurClass} border-t ${classes.borderCard} pt-3.5 pb-4.5`}>
          <div className="max-w-xl mx-auto px-4 flex items-center justify-between">
            <div>
              <p className={`text-[9px] ${classes.textMuted} font-mono uppercase tracking-[0.2em]`}>
                {cartQuantity} {cartQuantity === 1 ? 'ítem seleccionado' : 'ítems seleccionados'}
              </p>
              <p className={`text-lg font-mono font-black ${classes.textAccent} mt-0.5`}>
                {formatPrice(cartTotal)}
              </p>
            </div>
            
            <button
              id="btn-open-cart"
              onClick={() => setIsCartOpen(true)}
              className={`px-6 py-3.5 ${classes.radiusBtn} font-black text-xs ${classes.primaryBtn} flex items-center space-x-2 tracking-[0.2em] uppercase cursor-pointer shadow-lg`}
            >
              <ShoppingBag className="w-4 h-4 text-current" />
              <span>Ver Pedido</span>
              <ChevronRight className="w-4 h-4 text-current" />
            </button>
          </div>
        </div>
      )}

      {/* Slide-over Shopping Cart Sheet Drawer */}
      <AnimatePresence>
        {isCartOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.7 }}
              exit={{ opacity: 0 }}
              onClick={() => setIsCartOpen(false)}
              className="fixed inset-0 z-50 bg-black/80"
            />
            
            {/* Drawer Sheet */}
            <motion.div
              initial={{ y: '100%' }}
              animate={{ y: 0 }}
              exit={{ y: '105%' }}
              transition={{ type: 'spring', damping: 25, stiffness: 220 }}
              className={`fixed bottom-0 left-0 right-0 z-50 ${classes.bgDrawer} ${classes.borderCard} border-t max-h-[85vh] overflow-y-auto flex flex-col font-sans ${classes.radiusCard}`}
            >
              {/* Header */}
              <div className={`px-5 py-4 border-b ${classes.borderDivider} flex items-center justify-between sticky top-0 ${classes.bgHeader} ${classes.blurClass} z-10`}>
                <div className="flex items-center space-x-2">
                  <ShoppingBag className={`w-4.5 h-4.5 ${classes.textPrimary}`} />
                  <h2 className={`text-xs font-sans font-black ${classes.textPrimary} uppercase tracking-[0.25em]`}>{t.cartTitle}</h2>
                  <span className={`text-[10px] ${classes.badgeMuted} ${classes.radiusPill} px-2 py-0.5 font-mono font-bold tracking-wider`}>
                    {cartQuantity}
                  </span>
                </div>
                <button 
                  id="btn-close-cart"
                  onClick={() => setIsCartOpen(false)}
                  className={`p-1 px-2.5 ${classes.secondaryBtn} ${classes.radiusBtn} text-xs font-mono uppercase tracking-widest text-[10px]`}
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 px-5 py-5 overflow-y-auto space-y-5">
                
                {/* Advisor Banner about notes (RF-C04) — Repeated inside cart explicitly */}
                <div className={`p-4 ${classes.bgCard} ${classes.borderCard} ${classes.radiusCard} border flex items-start space-x-2.5 text-[11px] ${classes.textMuted} leading-relaxed font-medium`}>
                  <Sparkles className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{t.tipBody}</span>
                </div>

                {cart.length === 0 ? (
                  <div className="text-center py-16">
                    <ShoppingBag className={`w-8 h-8 ${classes.textMuted} mx-auto mb-3`} />
                    <p className={`text-xs ${classes.textMuted} font-bold uppercase tracking-wider`}>{t.emptyCart}</p>
                  </div>
                ) : (
                  <div className={`space-y-4 divide-y ${classes.borderDivider} pt-1`}>
                    {cart.map((cartItem) => (
                      <div key={cartItem.item.id} className="pt-4 first:pt-0">
                        <div className="flex items-start justify-between space-x-4">
                          <div className="flex-1 min-w-0">
                            <h4 className={`text-xs font-black uppercase ${classes.textPrimary} tracking-wide leading-tight`}>
                              {cartItem.item.name}
                            </h4>
                            <p className={`text-xs ${classes.textAccent} font-mono font-bold mt-1.5 tracking-wide`}>
                              {formatPrice(cartItem.item.price * cartItem.quantity)}
                            </p>
                          </div>

                          {/* Quantities stepper */}
                          <div className={`flex items-center space-x-3 ${classes.bgCard} ${classes.borderCard} p-1 ${classes.radiusCard} shrink-0`}>
                            <button
                              id={`btn-cart-minus-${cartItem.item.id}`}
                              onClick={() => removeFromCart(cartItem.item.id)}
                              className={`w-6 h-6 ${classes.radiusBtn} ${classes.secondaryBtn} flex items-center justify-center font-bold text-xs`}
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className={`text-xs font-mono font-bold ${classes.textPrimary} min-w-[18px] text-center`}>
                              {cartItem.quantity}
                            </span>
                            <button
                              id={`btn-cart-plus-${cartItem.item.id}`}
                              onClick={() => addToCart(cartItem.item)}
                              className={`w-6 h-6 ${classes.radiusBtn} ${classes.secondaryBtn} flex items-center justify-center font-bold text-xs`}
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Note Input for Item Custom Note (RF-C05) */}
                        <div className={`mt-3.5 ${classes.bgCard} ${classes.radiusCard} p-3 border ${classes.borderCard}`}>
                          <div className="flex items-center space-x-2 mb-2">
                            <MessageSquare className={`w-3.5 h-3.5 ${classes.textMuted}`} />
                            <span className={`text-[9px] uppercase tracking-[0.2em] ${classes.textMuted} font-sans font-black`}>
                              Comentario / Nota Especial
                            </span>
                          </div>
                          
                          <input
                            id={`input-cart-comment-${cartItem.item.id}`}
                            type="text"
                            placeholder={t.notePlaceholder}
                            maxLength={200}
                            value={cartItem.comment}
                            onChange={(e) => updateItemComment(cartItem.item.id, e.target.value)}
                            className={`w-full text-xs font-medium ${classes.inputBg} py-2 px-3 ${classes.radiusCard} border ${classes.inputBorder} outline-none ${classes.textPrimary}`}
                          />
                          <div className={`flex justify-between items-center mt-1.5 font-mono text-[9px] ${classes.textMuted}`}>
                            <span>
                              {cartItem.comment.length} / 200 {lang === 'es' ? 'caract.' : 'chars'}
                            </span>
                            {cartItem.comment.length >= 200 && (
                              <span className="text-rose-450 font-bold uppercase tracking-wide">
                                {t.limitReached}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Action and Price Summary */}
              {cart.length > 0 && (
                <div className={`px-5 py-4 border-t ${classes.borderDivider} sticky bottom-0 ${classes.bgHeader} space-y-4`}>
                  <div className={`flex items-center justify-between pb-1 border-b ${classes.borderDivider}`}>
                    <span className={`text-[10px] ${classes.textMuted} font-mono uppercase tracking-[0.2em]`}>{t.total}</span>
                    <span className={`text-xl font-mono font-black ${classes.textAccent}`}>
                      {formatPrice(cartTotal)}
                    </span>
                  </div>

                  <button
                    id="btn-submit-order"
                    onClick={submitOrder}
                    disabled={orderSubmitting}
                    className={`w-full py-4 ${classes.radiusBtn} text-xs font-black ${classes.primaryBtn} uppercase tracking-[0.2em] flex items-center justify-center space-x-2 disabled:opacity-50 border border-transparent shadow-xl cursor-pointer`}
                  >
                    {orderSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin"></div>
                        <span>{t.sending}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 font-black" />
                        <span>{t.sendOrder}</span>
                      </>
                    )}
                  </button>
                </div>
              )}
            </motion.div>
          </>
        )}
      </AnimatePresence>

      {/* Welcome Name Prompt Modal */}
      <AnimatePresence>
        {isWelcomeModalOpen && !sessionEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/85 backdrop-blur-md flex items-center justify-center p-4 font-sans"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-6 max-w-sm w-full space-y-5 text-center shadow-2xl`}
            >
              <div className="w-12 h-12 bg-amber-500/10 text-amber-500 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
                <Utensils className="w-6 h-6" />
              </div>
              
              <div>
                <h3 className={`text-base font-black uppercase tracking-wider ${classes.textPrimary}`}>
                  ¡Bienvenido/a a {establishment?.name}!
                </h3>
                <p className={`text-xs ${classes.textMuted} mt-1 font-mono uppercase font-bold text-amber-500`}>
                  {tableName}
                </p>
                <p className={`text-xs ${classes.textSecondary} mt-2 font-medium leading-relaxed`}>
                  Por favor, decinos tu nombre para identificar tus pedidos en la mesa:
                </p>
              </div>

              <form onSubmit={(e) => {
                e.preventDefault();
                const trimmed = nameInput.trim();
                if (!trimmed) return;
                setDinerName(trimmed);
                try {
                  localStorage.setItem(`mimenu_diner_${establishmentId}_${tableId}`, trimmed);
                  // Stamp when this sitting began. The server keeps the last closedAt of
                  // the table forever, so without this the previous close would keep
                  // killing every new session (see the session poll below).
                  localStorage.setItem(sessionStartKey, new Date().toISOString());
                } catch (err) {}
                setIsWelcomeModalOpen(false);
              }} className="space-y-4">
                <input
                  id="input-diner-name"
                  type="text"
                  required
                  placeholder="Ej: Juan / María"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className={`w-full px-4 py-3 text-sm rounded-xl border ${classes.borderCard} ${classes.bgApp} ${classes.textPrimary} focus:outline-none focus:border-amber-500 transition text-center font-bold`}
                  autoFocus
                />

                <button
                  id="btn-confirm-diner-name"
                  type="submit"
                  className="w-full py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest bg-amber-500 text-zinc-950 hover:bg-amber-400 transition cursor-pointer shadow-lg"
                >
                  Ver Menú y Pedir
                </button>
              </form>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Session Ended Overlay (when closed manually by admin) */}
      <AnimatePresence>
        {sessionEnded && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 text-center font-sans"
          >
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-6 max-w-sm w-full space-y-5 shadow-2xl`}>
              <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto border border-emerald-500/20">
                <CheckCircle className="w-8 h-8" />
              </div>

              <div className="space-y-2">
                <h3 className={`text-base font-black uppercase tracking-wider ${classes.textPrimary}`}>
                  ¡Muchas Gracias por tu Visita!
                </h3>
                <p className={`text-xs ${classes.textMuted} font-mono font-bold uppercase text-amber-500`}>
                  {tableName}
                </p>
                <p className={`text-xs ${classes.textSecondary} leading-relaxed`}>
                  La mesa ha sido cerrada por el personal. Se guardaron los datos de tu pedido y la sesión fue finalizada.
                </p>
              </div>

              <button
                id="btn-restart-client-session"
                onClick={() => {
                  setSessionEnded(false);
                  setDinerName('');
                  setNameInput('');
                  setIsWelcomeModalOpen(true);
                }}
                className="w-full py-3.5 px-4 rounded-xl text-xs font-black uppercase tracking-widest bg-amber-500 text-zinc-950 hover:bg-amber-400 transition cursor-pointer shadow-lg"
              >
                Iniciar Nueva Sesión
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
