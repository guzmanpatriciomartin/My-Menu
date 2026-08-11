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
  Globe
} from 'lucide-react';
import { Establishment, Category, MenuItem, Table, Order, OrderItem, OrderStatus } from '../types';

interface ClientViewProps {
  establishmentId: string;
  tableId: string;
  onBackToLauncher: () => void;
}

export default function ClientView({ establishmentId, tableId, onBackToLauncher }: ClientViewProps) {
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

  // Data states
  const [establishment, setEstablishment] = useState<Establishment | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [menuItems, setMenuItems] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<Table[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Interaction states
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [cart, setCart] = useState<Array<{ item: MenuItem; quantity: number; comment: string }>>([]);
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [orderSubmitting, setOrderSubmitting] = useState(false);
  
  // Notification states
  const [addedItemName, setAddedItemName] = useState<string | null>(null);
  const [tipDismissed, setTipDismissed] = useState(false);

  // Persistence of submitted orders (Session based, RF-C10)
  const [sessionOrderIds, setSessionOrderIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem(`mimenu_orders_${establishmentId}_${tableId}`);
      return saved ? JSON.parse(saved) : [];
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
        // ALTO-1: scoped lookup — we only ask for OUR own order ids on OUR table.
        // The server never enumerates other diners' orders.
        const res = await fetch(`/api/establishments/${establishmentId}/orders/lookup`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tableId, orderIds: sessionOrderIds }),
        });
        const matchingOrders: Order[] = await res.json();
        // Sort newest first
        matchingOrders.sort((a,b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        setActiveOrders(matchingOrders);
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
      // ALTO-3: identify as a diner for THIS establishment + table. The server only
      // streams us MENU_CHANGED and status changes for our own table.
      sse = new EventSource(
        `/api/realtime?establishmentId=${encodeURIComponent(establishmentId)}&tableId=${encodeURIComponent(tableId)}`
      );

      sse.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.type === 'ORDER_STATUS_CHANGED') {
            const updatedOrder: Order = msg.payload.order;
            if (sessionOrderIds.includes(updatedOrder.id)) {
              setActiveOrders(prev => {
                const index = prev.findIndex(o => o.id === updatedOrder.id);
                if (index === -1) return [updatedOrder, ...prev];
                const clone = [...prev];
                clone[index] = updatedOrder;
                return clone;
              });
            }
          } else if (msg.type === 'MENU_CHANGED' && msg.payload.establishmentId === establishmentId) {
            // Hot reload menu availability in real-time
            fetch(`/api/establishments/${establishmentId}/menu-items`)
              .then(r => r.json())
              .then(items => setMenuItems(items));
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
    if (!product.available) return; // Agotado blocker (RF-C03)

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

  // Submit actual order to server (RF-C07)
  const submitOrder = async () => {
    if (cart.length === 0) return;
    setOrderSubmitting(true);

    try {
      // ALTO-2: send only menuItemId + quantity + comment. The server recomputes
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
        body: JSON.stringify({ tableId, items })
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

      // Store in session list
      const updatedSessions = [...sessionOrderIds, orderObj.id];
      setSessionOrderIds(updatedSessions);
      localStorage.setItem(`mimenu_orders_${establishmentId}_${tableId}`, JSON.stringify(updatedSessions));

      // Reset local cart and close
      setCart([]);
      setIsCartOpen(false);

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
    <div className="min-h-screen bg-zinc-950 text-white pb-24 relative font-sans selection:bg-amber-500 selection:text-zinc-950">
      
      {/* Floating success screen (RF-C07) */}
      <AnimatePresence>
        {showSuccessBadge && (
          <motion.div 
            initial={{ opacity: 0, y: -50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -50 }}
            className="fixed top-4 left-4 right-4 z-50 bg-white text-black p-4 rounded-none shadow-2xl flex items-center space-x-3 border-2 border-white font-sans"
          >
            <div className="p-2 bg-zinc-950 rounded-none shrink-0">
              <Check className="w-5 h-5 text-white" />
            </div>
            <div>
              <h4 className="font-black uppercase tracking-wider text-xs">{t.orderSuccess}</h4>
              <p className="text-[11px] text-zinc-650 font-medium">{t.orderSuccessSub}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Static Header Section */}
      <header className="bg-zinc-950 border-b border-zinc-800 sticky top-0 z-30 transition-all">
        <div className="max-w-xl mx-auto px-4 py-3.5 flex items-center justify-between">
          <button 
            id="btn-back-to-launcher"
            onClick={onBackToLauncher}
            className="p-2 text-zinc-400 hover:text-white transition hover:bg-zinc-900 rounded-none flex items-center justify-center"
            title={t.backToLaucher}
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          
          <div className="text-center flex-1 mx-2">
            <h1 className="font-sans font-black text-lg tracking-tight uppercase line-clamp-1 text-white">
              {establishment?.name}
            </h1>
            <p className="text-[9px] font-mono tracking-[0.2em] text-zinc-500 uppercase mt-0.5">
              {tableName} · {t.statusRecibido} vía QR
            </p>
          </div>

          <div className="flex items-center space-x-2">
            {/* Lang switcher (RF-C11) */}
            <button 
              id="btn-lang-switcher"
              onClick={() => setLang(prev => prev === 'es' ? 'en' : 'es')}
              className="p-2 text-zinc-450 hover:text-white rounded-none hover:bg-zinc-900 flex items-center justify-center text-[10px] font-black uppercase tracking-widest"
              title="Cambiar idioma / Change language"
            >
              <Globe className="w-3.5 h-3.5 mr-1 text-zinc-400" />
              {lang}
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto px-4 mt-5 space-y-6">
        
        {/* Banner with Restaurant Details */}
        <div className="bg-zinc-900/40 rounded-none p-5 border border-zinc-850">
          <p className="text-xs text-zinc-440 leading-relaxed font-medium italic">{establishment?.description}</p>
        </div>

        {/* Dynamic Prominent Tip Banner (RF-C04) — Notice about Custom Notes */}
        {!tipDismissed && (
          <motion.div 
            id="chef-tip-banner"
            layout
            className="p-4 rounded-none border border-zinc-800 bg-zinc-900/60 text-zinc-300 flex items-start space-x-3 relative"
          >
            <Sparkles className="w-4.5 h-4.5 shrink-0 text-amber-500 mt-0.5" />
            <div className="pr-6">
              <h4 className="text-[10px] uppercase tracking-[0.25em] font-black text-amber-500 mb-1">{t.tipTitle}</h4>
              <p className="text-[11px] text-zinc-400 leading-relaxed font-medium">{t.tipBody}</p>
            </div>
            <button 
              id="btn-dismiss-tip"
              onClick={() => setTipDismissed(true)}
              className="absolute top-2 right-2 p-1 text-zinc-500 hover:text-white transition hover:bg-zinc-800"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        )}

        {/* Real-time Diners Session Orders (RF-C08, RF-C10) */}
        {activeOrders.length > 0 && (
          <div className="p-4.5 bg-zinc-950 text-white rounded-none border border-zinc-800 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-850 pb-2.5">
              <h3 className="text-[10px] font-black tracking-[0.25em] uppercase text-zinc-400 font-sans flex items-center">
                <Clock className="w-3.5 h-3.5 mr-2 animate-pulse text-amber-500" />
                {t.activeOrders}
              </h3>
              <span className="text-[9px] bg-zinc-900 text-zinc-300 px-2 py-0.5 rounded-none font-mono font-bold tracking-wider uppercase">
                {activeOrders.length} {activeOrders.length === 1 ? 'pedido' : 'pedidos'}
              </span>
            </div>

            <div className="space-y-4 divide-y divide-zinc-850">
              {activeOrders.map((ord, idx) => {
                const timeStr = new Date(ord.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
                return (
                  <div key={ord.id} className={`pt-3.5 ${idx === 0 ? '' : 'pt-4'}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center space-x-2">
                          <p className="text-xs font-mono font-bold text-zinc-300">{t.orderId}{ord.id.slice(-4)}</p>
                          <span className="text-[10px] text-zinc-500 font-mono">({timeStr})</span>
                        </div>
                        <p className="text-[11px] text-zinc-400 mt-1 line-clamp-1">
                          {ord.items.map(i => `${i.quantity}x ${i.name}`).join(', ')}
                        </p>
                      </div>
                      <span className={`text-[9px] uppercase font-black px-2.5 py-0.5 rounded-none border flex items-center space-x-1 ${getStatusColor(ord.status)}`}>
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
                      <div className="mt-2 text-[11px] bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 p-2.5 rounded-none font-medium">
                        {t.readyNotice}
                      </div>
                    )}

                    {ord.status === 'Cancelado' && (
                      <div className="mt-2 text-[11px] bg-rose-500/10 border border-rose-500/30 text-rose-400 p-2.5 rounded-none">
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
            className="w-full bg-zinc-900 text-white pl-11 pr-10 py-3.5 rounded-none border border-zinc-800 text-sm focus:outline-none focus:ring-1 focus:ring-white focus:border-zinc-700 transition-all font-medium"
          />
          <Search className="w-4.5 h-4.5 text-zinc-500 absolute left-4 top-4" />
          {searchQuery && (
            <button 
              id="btn-clear-search"
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-3 p-1.5 rounded-none text-zinc-500 hover:text-white"
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
              className={`px-4.5 py-2.5 rounded-none text-[11px] font-black uppercase tracking-wider transition-all border ${
                selectedCategory === 'all'
                  ? 'text-black bg-white border-white'
                  : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-750 hover:text-white'
              }`}
            >
              {t.all}
            </button>
            {categories.map((cat) => (
              <button
                id={`cat-tab-${cat.id}`}
                key={cat.id}
                onClick={() => setSelectedCategory(cat.id)}
                className={`px-4.5 py-2.5 rounded-none text-[11px] font-black uppercase tracking-wider transition-all border ${
                  selectedCategory === cat.id
                    ? 'text-black bg-white border-white'
                    : 'bg-zinc-900 text-zinc-400 border-zinc-800 hover:border-zinc-750 hover:text-white'
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
                className={`bg-zinc-900/40 border border-zinc-850 rounded-none p-4 flex items-start space-x-5 transition-all relative ${
                  !item.available ? 'opacity-40' : 'hover:border-zinc-700'
                }`}
              >
                {/* Photo or Premium Placeholder */}
                <div className="w-20 h-20 rounded-none overflow-hidden shrink-0 bg-zinc-950 relative border border-zinc-800">
                  <img
                    src={item.imageUrl}
                    alt={item.name}
                    referrerPolicy="no-referrer"
                    className="w-full h-full object-cover transition-transform duration-500 hover:scale-110"
                    onError={(e) => {
                      (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?auto=format&fit=crop&q=80&w=200';
                    }}
                  />
                  {!item.available && (
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
                    <h3 className="font-sans font-black text-sm text-white uppercase tracking-tight line-clamp-1 leading-tight">
                      {item.name}
                    </h3>
                    <p className="text-[11px] text-zinc-400 line-clamp-2 mt-1 leading-relaxed font-medium">
                      {item.description}
                    </p>
                  </div>

                  <div className="flex items-center justify-between mt-1">
                    <span id={`price-display-${item.id}`} className="font-mono text-xs font-black tracking-wide text-amber-500">
                      {formatPrice(item.price)}
                    </span>

                    {item.available ? (
                      <button
                        id={`btn-add-item-${item.id}`}
                        onClick={() => addToCart(item)}
                        className="w-8 h-8 rounded-none border border-white bg-white hover:bg-zinc-200 text-black flex items-center justify-center transition-all cursor-pointer shadow-md"
                      >
                        <Plus className="w-4 h-4 text-black font-black" />
                      </button>
                    ) : (
                      <span className="text-[10px] text-zinc-500 font-mono italic uppercase tracking-wider">
                        {t.soldOut}
                      </span>
                    )}
                  </div>
                </div>
              </motion.div>
            ))}
          </AnimatePresence>

          {filteredMenuItems.length === 0 && (
            <div className="text-center py-16 px-4 bg-zinc-900/30 border border-zinc-850 rounded-none">
              <Search className="w-8 h-8 text-zinc-650 mx-auto mb-3" />
              <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">No se encontraron bocados que coincidan.</p>
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
        <div className="fixed bottom-0 left-0 right-0 z-40 bg-zinc-950/95 backdrop-blur-md border-t border-zinc-800 pt-3.5 pb-4.5">
          <div className="max-w-xl mx-auto px-4 flex items-center justify-between">
            <div>
              <p className="text-[9px] text-zinc-500 font-mono uppercase tracking-[0.2em]">
                {cartQuantity} {cartQuantity === 1 ? 'ítem seleccionado' : 'ítems seleccionados'}
              </p>
              <p className="text-lg font-mono font-black text-amber-500 mt-0.5">
                {formatPrice(cartTotal)}
              </p>
            </div>
            
            <button
              id="btn-open-cart"
              onClick={() => setIsCartOpen(true)}
              className="px-6 py-3.5 rounded-none font-black text-xs text-black bg-white hover:bg-zinc-200 transition-all flex items-center space-x-2 tracking-[0.2em] uppercase cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-black" />
              <span>Ver Pedido</span>
              <ChevronRight className="w-4 h-4 text-black" />
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
              className="fixed bottom-0 left-0 right-0 z-50 bg-zinc-950 border-t border-zinc-800 max-h-[85vh] overflow-y-auto flex flex-col font-sans"
            >
              {/* Header */}
              <div className="px-5 py-4 border-b border-zinc-850 flex items-center justify-between sticky top-0 bg-zinc-950 z-10">
                <div className="flex items-center space-x-2">
                  <ShoppingBag className="w-4.5 h-4.5 text-white" />
                  <h2 className="text-xs font-sans font-black text-white uppercase tracking-[0.25em]">{t.cartTitle}</h2>
                  <span className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-300 px-2 py-0.5 rounded-none font-mono font-bold tracking-wider">
                    {cartQuantity}
                  </span>
                </div>
                <button 
                  id="btn-close-cart"
                  onClick={() => setIsCartOpen(false)}
                  className="p-1 px-2.5 bg-zinc-900 border border-zinc-850 text-zinc-400 hover:text-white rounded-none text-xs font-mono uppercase tracking-widest text-[10px]"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Items List */}
              <div className="flex-1 px-5 py-5 overflow-y-auto space-y-5 bg-zinc-950/40">
                
                {/* Advisor Banner about notes (RF-C04) — Repeated inside cart explicitly */}
                <div className="p-4 bg-zinc-905 border border-zinc-850 rounded-none flex items-start space-x-2.5 text-[11px] text-zinc-400 leading-relaxed font-medium">
                  <Sparkles className="w-4.5 h-4.5 text-amber-500 shrink-0 mt-0.5" />
                  <span>{t.tipBody}</span>
                </div>

                {cart.length === 0 ? (
                  <div className="text-center py-16">
                    <ShoppingBag className="w-8 h-8 text-zinc-700 mx-auto mb-3" />
                    <p className="text-xs text-zinc-400 font-bold uppercase tracking-wider">{t.emptyCart}</p>
                  </div>
                ) : (
                  <div className="space-y-4 divide-y divide-zinc-850 pt-1">
                    {cart.map((cartItem) => (
                      <div key={cartItem.item.id} className="pt-4 first:pt-0">
                        <div className="flex items-start justify-between space-x-4">
                          <div className="flex-1 min-w-0">
                            <h4 className="text-xs font-black uppercase text-white tracking-wide leading-tight">
                              {cartItem.item.name}
                            </h4>
                            <p className="text-xs text-amber-500 font-mono font-bold mt-1.5 tracking-wide">
                              {formatPrice(cartItem.item.price * cartItem.quantity)}
                            </p>
                          </div>

                          {/* Quantities stepper */}
                          <div className="flex items-center space-x-3 bg-zinc-900 border border-zinc-800 p-1 rounded-none shrink-0">
                            <button
                              id={`btn-cart-minus-${cartItem.item.id}`}
                              onClick={() => removeFromCart(cartItem.item.id)}
                              className="w-6 h-6 rounded-none bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 hover:text-white flex items-center justify-center text-zinc-400 font-bold text-xs"
                            >
                              <Minus className="w-3 h-3" />
                            </button>
                            <span className="text-xs font-mono font-bold text-white min-w-[18px] text-center">
                              {cartItem.quantity}
                            </span>
                            <button
                              id={`btn-cart-plus-${cartItem.item.id}`}
                              onClick={() => addToCart(cartItem.item.id as any)}
                              className="w-6 h-6 rounded-none bg-zinc-950 border border-zinc-800 hover:bg-zinc-800 hover:text-white flex items-center justify-center text-zinc-400 font-bold text-xs"
                            >
                              <Plus className="w-3 h-3" />
                            </button>
                          </div>
                        </div>

                        {/* Note Input for Item Custom Note (RF-C05) */}
                        <div className="mt-3.5 bg-zinc-900/60 rounded-none p-3 border border-zinc-850/80">
                          <div className="flex items-center space-x-2 mb-2">
                            <MessageSquare className="w-3.5 h-3.5 text-zinc-550" />
                            <span className="text-[9px] uppercase tracking-[0.2em] text-zinc-500 font-sans font-black">
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
                            className="w-full text-xs font-medium bg-zinc-950 py-2 px-3 rounded-none border border-zinc-800 outline-none focus:ring-1 focus:ring-white text-white"
                          />
                          <div className="flex justify-between items-center mt-1.5 font-mono text-[9px] text-zinc-550">
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
                <div className="px-5 py-4 border-t border-zinc-850 sticky bottom-0 bg-zinc-950 space-y-4">
                  <div className="flex items-center justify-between pb-1 border-b border-zinc-900">
                    <span className="text-[10px] text-zinc-500 font-mono uppercase tracking-[0.2em]">{t.total}</span>
                    <span className="text-xl font-mono font-black text-amber-500">
                      {formatPrice(cartTotal)}
                    </span>
                  </div>

                  <button
                    id="btn-submit-order"
                    onClick={submitOrder}
                    disabled={orderSubmitting}
                    className="w-full py-4 rounded-none text-xs font-black text-black bg-white hover:bg-zinc-200 uppercase tracking-[0.2em] flex items-center justify-center space-x-2 disabled:bg-zinc-800 disabled:text-zinc-600 border border-transparent shadow-xl cursor-pointer"
                  >
                    {orderSubmitting ? (
                      <>
                        <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin"></div>
                        <span>{t.sending}</span>
                      </>
                    ) : (
                      <>
                        <Check className="w-4 h-4 text-black font-black" />
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
    </div>
  );
}
