import React, { useState, useMemo } from 'react';
import {
  Table,
  MenuItem,
  Category,
  Order
} from '../types';
import {
  Search,
  Plus,
  Minus,
  Trash2,
  Send,
  User,
  Coffee,
  CheckCircle2,
  DollarSign,
  Receipt,
  UtensilsCrossed,
  MessageSquare,
  AlertCircle,
  X,
  CreditCard,
  Banknote,
  QrCode,
  Tag
} from 'lucide-react';
import { useTheme } from '../theme/ThemeContext';

interface POSProps {
  establishmentId: string;
  tables: Table[];
  categories: Category[];
  menuItems: MenuItem[];
  orders: Order[];
  formatPrice: (price: number) => string;
  onOrderCreated?: () => void;
  onOpenTableBill?: (tableId: string) => void;
}

interface CartItem {
  menuItem: MenuItem;
  quantity: number;
  comment: string;
}

export const TablePOS: React.FC<POSProps> = ({
  establishmentId,
  tables,
  categories,
  menuItems,
  orders,
  formatPrice,
  onOrderCreated,
  onOpenTableBill
}) => {
  const { classes, isDark, primaryColorConfig } = useTheme();

  // Active selected table
  const [selectedTableId, setSelectedTableId] = useState<string>(tables[0]?.id || '');
  const [dinerName, setDinerName] = useState<string>('Salón');
  
  // Menu selection & filters
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  // Cart state
  const [cart, setCart] = useState<CartItem[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [feedbackMsg, setFeedbackMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  
  // Item detail / note modal
  const [editingCartItemIndex, setEditingCartItemIndex] = useState<number | null>(null);
  const [tempNote, setTempNote] = useState<string>('');

  // Tables list (only active ones)
  const activeTables = useMemo(() => tables.filter((t) => t.active), [tables]);
  const currentTable = useMemo(() => tables.find((t) => t.id === selectedTableId), [tables, selectedTableId]);

  // Active orders for the selected table
  const activeTableOrders = useMemo(() => {
    if (!selectedTableId) return [];
    return orders.filter(
      (o) => o.tableId === selectedTableId && (o.status !== 'Cancelado' && o.paymentStatus !== 'paid')
    );
  }, [orders, selectedTableId]);

  // Total accumulated of active orders for the selected table
  const tableAccumulatedTotal = useMemo(() => {
    return activeTableOrders.reduce((sum, order) => {
      const orderSum = order.items.reduce((s, it) => s + (it.price * it.quantity), 0);
      return sum + orderSum;
    }, 0);
  }, [activeTableOrders]);

  // Filtered menu items
  const filteredMenuItems = useMemo(() => {
    return menuItems.filter((item) => {
      if (selectedCategory !== 'all' && item.categoryId !== selectedCategory) {
        return false;
      }
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = item.name.toLowerCase().includes(q);
        const matchDesc = (item.description || '').toLowerCase().includes(q);
        if (!matchName && !matchDesc) return false;
      }
      return true;
    });
  }, [menuItems, selectedCategory, searchQuery]);

  // Cart total calculations
  const cartSubtotal = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.menuItem.price * item.quantity, 0);
  }, [cart]);

  const cartItemsCount = useMemo(() => {
    return cart.reduce((count, item) => count + item.quantity, 0);
  }, [cart]);

  // Add item to cart
  const handleAddToCart = (item: MenuItem) => {
    if (!item.available) return;
    setCart((prev) => {
      const existingIdx = prev.findIndex((i) => i.menuItem.id === item.id && !i.comment);
      if (existingIdx >= 0) {
        const next = [...prev];
        next[existingIdx].quantity += 1;
        return next;
      }
      return [...prev, { menuItem: item, quantity: 1, comment: '' }];
    });
  };

  // Update quantity in cart
  const handleUpdateQuantity = (index: number, delta: number) => {
    setCart((prev) => {
      const next = [...prev];
      const newQty = next[index].quantity + delta;
      if (newQty <= 0) {
        return next.filter((_, i) => i !== index);
      }
      next[index].quantity = Math.min(99, newQty);
      return next;
    });
  };

  // Remove item from cart
  const handleRemoveFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, i) => i !== index));
  };

  // Open note modal
  const handleOpenNoteModal = (index: number) => {
    setEditingCartItemIndex(index);
    setTempNote(cart[index].comment || '');
  };

  // Save note to cart item
  const handleSaveNote = () => {
    if (editingCartItemIndex === null) return;
    setCart((prev) => {
      const next = [...prev];
      if (next[editingCartItemIndex]) {
        next[editingCartItemIndex].comment = tempNote.trim().slice(0, 200);
      }
      return next;
    });
    setEditingCartItemIndex(null);
  };

  // Clear cart
  const handleClearCart = () => {
    if (cart.length === 0) return;
    if (confirm('¿Vaciar la comanda actual?')) {
      setCart([]);
    }
  };

  // Submit order directly to kitchen/orders
  const handleSendOrder = async () => {
    if (!selectedTableId) {
      setFeedbackMsg({ type: 'error', text: 'Por favor selecciona una mesa.' });
      return;
    }
    if (cart.length === 0) {
      setFeedbackMsg({ type: 'error', text: 'Agrega al menos un producto a la comanda.' });
      return;
    }

    setIsSubmitting(true);
    setFeedbackMsg(null);

    const payload = {
      tableId: selectedTableId,
      dinerName: dinerName.trim() || 'Mozo / POS',
      items: cart.map((item) => ({
        menuItemId: item.menuItem.id,
        quantity: item.quantity,
        comment: item.comment || undefined,
      })),
    };

    try {
      const res = await fetch(`/api/establishments/${establishmentId}/orders`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (res.ok) {
        setCart([]);
        setFeedbackMsg({ type: 'success', text: '¡Comanda enviada a cocina con éxito!' });
        if (onOrderCreated) {
          onOrderCreated();
        }
        setTimeout(() => setFeedbackMsg(null), 4000);
      } else {
        const data = await res.json().catch(() => ({}));
        setFeedbackMsg({
          type: 'error',
          text: data.error || 'No se pudo registrar la comanda. Verifica la disponibilidad.',
        });
      }
    } catch (err) {
      console.error('Error sending POS order', err);
      setFeedbackMsg({ type: 'error', text: 'Error de conexión al enviar la comanda.' });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 font-sans">
      {/* Top Banner / Table Selector Bar */}
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-4 flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4 shadow-lg transition-colors`}>
        {/* Table Selector & Diner input */}
        <div className="flex flex-wrap items-center gap-3">
          <div className={`flex items-center gap-2 ${classes.inputBg} px-3.5 py-2 ${classes.radiusBtn} border ${classes.borderCard}`}>
            <UtensilsCrossed className={`w-4 h-4 ${classes.textAccent}`} />
            <span className={`text-xs font-bold ${classes.textMuted} uppercase tracking-wider font-mono`}>Mesa:</span>
            <select
              id="pos-table-select"
              value={selectedTableId}
              onChange={(e) => setSelectedTableId(e.target.value)}
              className={`bg-transparent text-sm font-black ${classes.textPrimary} outline-none cursor-pointer pr-2`}
            >
              {activeTables.map((t) => (
                <option key={t.id} value={t.id} className={isDark ? 'bg-zinc-900 text-white' : 'bg-white text-zinc-900'}>
                  {t.name} {t.isOccupied ? '• (Ocupada)' : '• (Libre)'}
                </option>
              ))}
            </select>
          </div>

          <div className={`flex items-center gap-2 ${classes.inputBg} px-3.5 py-2 ${classes.radiusBtn} border ${classes.borderCard}`}>
            <User className={`w-4 h-4 ${classes.textMuted}`} />
            <input
              id="pos-diner-name-input"
              type="text"
              value={dinerName}
              onChange={(e) => setDinerName(e.target.value)}
              placeholder="Mozo / Comensal"
              className={`bg-transparent text-xs font-medium ${classes.textPrimary} placeholder:${classes.textMuted} outline-none w-32 md:w-40`}
            />
          </div>
        </div>

        {/* Selected Table Live Status */}
        <div className="flex items-center gap-3">
          {currentTable && (
            <div className="flex items-center gap-2.5">
              <span
                className={`w-2.5 h-2.5 rounded-full ${
                  activeTableOrders.length > 0 ? `${primaryColorConfig.accentBg} animate-pulse` : 'bg-emerald-500'
                }`}
              />
              <span className={`text-xs font-bold ${classes.textSecondary} font-mono`}>
                {activeTableOrders.length > 0
                  ? `${activeTableOrders.length} pedido(s) activo(s) • ${formatPrice(tableAccumulatedTotal)}`
                  : 'Mesa libre / Sin consumos'}
              </span>
            </div>
          )}

          {activeTableOrders.length > 0 && onOpenTableBill && selectedTableId && (
            <button
              id="pos-open-table-bill-btn"
              onClick={() => onOpenTableBill(selectedTableId)}
              className={`px-3.5 py-2 ${classes.radiusBtn} ${classes.primaryBtn} font-black text-xs uppercase tracking-wider flex items-center gap-1.5 transition shadow-sm cursor-pointer`}
              title="Cerrar o cobrar la cuenta de esta mesa"
            >
              <Receipt className="w-3.5 h-3.5" />
              Cobrar Mesa
            </button>
          )}
        </div>
      </div>

      {/* Notification feedback */}
      {feedbackMsg && (
        <div
          className={`p-3.5 ${classes.radiusBtn} border flex items-center justify-between text-xs font-bold ${
            feedbackMsg.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-600 dark:text-emerald-400'
              : 'bg-rose-500/10 border-rose-500/30 text-rose-600 dark:text-rose-400'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackMsg.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0" />
            )}
            <span>{feedbackMsg.text}</span>
          </div>
          <button
            onClick={() => setFeedbackMsg(null)}
            className={`p-1 ${classes.radiusBtn} ${classes.textMuted} hover:${classes.textPrimary} transition`}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main Grid: Catalog on left, Live Cart on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Left column: Menu Categories & Items (8 cols) */}
        <div className="lg:col-span-7 xl:col-span-8 space-y-4">
          {/* Categories Pill Scroller & Search */}
          <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-3.5 space-y-3 shadow-sm`}>
            {/* Search Input */}
            <div className="relative">
              <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${classes.textMuted}`} />
              <input
                id="pos-search-menu-input"
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar plato, bebida o ingrediente..."
                className={`w-full ${classes.inputBg} border ${classes.inputBorder} ${classes.textPrimary} pl-10 pr-4 py-2.5 ${classes.radiusBtn} text-xs outline-none transition font-medium`}
              />
              {searchQuery && (
                <button
                  onClick={() => setSearchQuery('')}
                  className={`absolute right-3 top-1/2 -translate-y-1/2 ${classes.textMuted} hover:${classes.textPrimary}`}
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            {/* Category tabs */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 scrollbar-none">
              <button
                id="pos-cat-all"
                onClick={() => setSelectedCategory('all')}
                className={`px-3 py-1.5 ${classes.radiusBtn} text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                  selectedCategory === 'all'
                    ? `${classes.primaryBtn} shadow-sm`
                    : `${classes.inputBg} ${classes.textMuted} hover:${classes.textPrimary} border ${classes.borderCard}`
                }`}
              >
                Todos ({menuItems.length})
              </button>
              {categories.map((cat) => {
                const count = menuItems.filter((m) => m.categoryId === cat.id).length;
                return (
                  <button
                    key={cat.id}
                    id={`pos-cat-${cat.id}`}
                    onClick={() => setSelectedCategory(cat.id)}
                    className={`px-3 py-1.5 ${classes.radiusBtn} text-[11px] font-black uppercase tracking-wider whitespace-nowrap transition cursor-pointer ${
                      selectedCategory === cat.id
                        ? `${classes.primaryBtn} shadow-sm`
                        : `${classes.inputBg} ${classes.textMuted} hover:${classes.textPrimary} border ${classes.borderCard}`
                    }`}
                  >
                    {cat.name} ({count})
                  </button>
                );
              })}
            </div>
          </div>

          {/* Menu Items Grid */}
          {filteredMenuItems.length === 0 ? (
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-12 text-center`}>
              <Coffee className={`w-8 h-8 ${classes.textMuted} mx-auto mb-2 opacity-50`} />
              <p className={`text-xs font-bold ${classes.textMuted} uppercase tracking-wider`}>
                No hay productos disponibles con este filtro
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-4 gap-3">
              {filteredMenuItems.map((item) => {
                const inCartQty = cart
                  .filter((c) => c.menuItem.id === item.id)
                  .reduce((sum, c) => sum + c.quantity, 0);

                return (
                  <div
                    key={item.id}
                    id={`pos-item-card-${item.id}`}
                    onClick={() => handleAddToCart(item)}
                    className={`group relative ${classes.bgCard} ${classes.bgCardHover} border ${classes.borderCard} ${classes.radiusCard} p-3 flex flex-col justify-between transition-all duration-150 select-none ${
                      item.available
                        ? 'hover:shadow-lg active:scale-[0.98] cursor-pointer'
                        : 'opacity-40 cursor-not-allowed grayscale'
                    }`}
                  >
                    {/* Badge if in cart */}
                    {inCartQty > 0 && (
                      <span className={`absolute -top-2 -right-2 ${classes.primaryBtn} text-[10px] font-black w-6 h-6 rounded-full flex items-center justify-center shadow-md font-mono border-2 border-white dark:border-zinc-900 z-10 animate-scale-in`}>
                        {inCartQty}
                      </span>
                    )}

                    <div className="space-y-1.5">
                      {item.imageUrl ? (
                        <div className={`w-full h-24 ${classes.radiusBtn} overflow-hidden ${classes.inputBg} relative mb-2`}>
                          <img
                            src={item.imageUrl}
                            alt={item.name}
                            className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                            loading="lazy"
                          />
                        </div>
                      ) : (
                        <div className={`w-full h-16 ${classes.radiusBtn} ${classes.inputBg} flex items-center justify-center ${classes.textMuted} mb-2 opacity-50`}>
                          <UtensilsCrossed className="w-5 h-5" />
                        </div>
                      )}

                      <h4 className={`text-xs font-bold ${classes.textPrimary} line-clamp-1 group-hover:${classes.textAccent} transition-colors`}>
                        {item.name}
                      </h4>
                      {item.description && (
                        <p className={`text-[10px] ${classes.textMuted} line-clamp-2 leading-relaxed`}>
                          {item.description}
                        </p>
                      )}
                    </div>

                    <div className={`mt-3 pt-2 border-t ${classes.borderDivider} flex items-center justify-between`}>
                      <span className={`text-xs font-black font-mono ${classes.textAccent}`}>
                        {formatPrice(item.price)}
                      </span>

                      {item.available ? (
                        <span className={`w-6 h-6 ${classes.radiusBtn} ${classes.primaryBtn} flex items-center justify-center transition shadow-sm`}>
                          <Plus className="w-3.5 h-3.5" />
                        </span>
                      ) : (
                        <span className="text-[9px] font-bold uppercase text-rose-500 tracking-wider">
                          Agotado
                        </span>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right column: Cart & Commander Summary (5 cols) */}
        <div className="lg:col-span-5 xl:col-span-4 space-y-4">
          <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-4 flex flex-col h-full min-h-[500px] shadow-xl sticky top-4 transition-colors`}>
            {/* Cart Header */}
            <div className={`flex items-center justify-between pb-3 border-b ${classes.borderDivider}`}>
              <div className="space-y-0.5">
                <h3 className={`text-xs font-black ${classes.textPrimary} uppercase tracking-wider flex items-center gap-2`}>
                  <Receipt className={`w-4 h-4 ${classes.textAccent}`} />
                  Comanda POS
                </h3>
                <p className={`text-[10px] ${classes.textMuted}`}>
                  {currentTable?.name || 'Mesa'} • {cartItemsCount} {cartItemsCount === 1 ? 'ítem' : 'ítems'}
                </p>
              </div>

              {cart.length > 0 && (
                <button
                  id="pos-clear-cart-btn"
                  onClick={handleClearCart}
                  className={`text-[10px] font-bold ${classes.textMuted} hover:text-rose-500 uppercase tracking-wider transition cursor-pointer p-1`}
                >
                  Vaciar
                </button>
              )}
            </div>

            {/* Cart Items List */}
            <div className={`flex-1 overflow-y-auto py-3 space-y-2.5 divide-y ${classes.borderDivider}`}>
              {cart.length === 0 ? (
                <div className={`h-full flex flex-col items-center justify-center text-center py-12 ${classes.textMuted} space-y-2`}>
                  <UtensilsCrossed className="w-8 h-8 stroke-[1.5] opacity-40" />
                  <p className={`text-xs font-bold uppercase tracking-wider ${classes.textPrimary}`}>
                    Comanda vacía
                  </p>
                  <p className={`text-[11px] ${classes.textMuted} max-w-[200px]`}>
                    Toca los platos o bebidas del menú para sumarlos a esta mesa.
                  </p>
                </div>
              ) : (
                cart.map((item, idx) => (
                  <div key={`${item.menuItem.id}-${idx}`} className="pt-2.5 first:pt-0 space-y-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className={`text-xs font-bold ${classes.textPrimary} truncate`}>
                            {item.menuItem.name}
                          </span>
                        </div>
                        <span className={`text-[11px] font-mono ${classes.textMuted}`}>
                          {formatPrice(item.menuItem.price * item.quantity)}
                        </span>
                      </div>

                      {/* Quantity controls */}
                      <div className={`flex items-center gap-1 ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} p-0.5`}>
                        <button
                          onClick={() => handleUpdateQuantity(idx, -1)}
                          className={`w-6 h-6 ${classes.radiusBtn} flex items-center justify-center ${classes.textMuted} hover:${classes.textPrimary} hover:bg-black/5 dark:hover:bg-white/10 transition`}
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className={`w-6 text-center text-xs font-black font-mono ${classes.textPrimary}`}>
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => handleUpdateQuantity(idx, 1)}
                          className={`w-6 h-6 ${classes.radiusBtn} flex items-center justify-center ${classes.textMuted} hover:${classes.textPrimary} hover:bg-black/5 dark:hover:bg-white/10 transition`}
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Note row */}
                    <div className="flex items-center justify-between text-[10px]">
                      {item.comment ? (
                        <span className={`${classes.textAccent} italic truncate max-w-[200px] flex items-center gap-1 font-medium`}>
                          <MessageSquare className="w-3 h-3 shrink-0" />
                          "{item.comment}"
                        </span>
                      ) : (
                        <button
                          onClick={() => handleOpenNoteModal(idx)}
                          className={`${classes.textMuted} hover:${classes.textPrimary} flex items-center gap-1 transition`}
                        >
                          <MessageSquare className="w-3 h-3" />
                          + Agregar aclaración
                        </button>
                      )}

                      {item.comment && (
                        <button
                          onClick={() => handleOpenNoteModal(idx)}
                          className={`${classes.textMuted} hover:${classes.textPrimary} text-[10px] underline ml-2`}
                        >
                          Editar
                        </button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cart Footer: Totals & Send Button */}
            <div className={`pt-3 border-t ${classes.borderDivider} space-y-3 ${classes.bgCard}`}>
              <div className="space-y-1">
                <div className="flex items-center justify-between text-xs">
                  <span className={classes.textMuted}>Subtotal Comanda</span>
                  <span className={`font-mono font-bold ${classes.textSecondary}`}>{formatPrice(cartSubtotal)}</span>
                </div>
                <div className={`flex items-center justify-between text-sm font-black ${classes.textPrimary}`}>
                  <span>Total a Marchar</span>
                  <span className={`font-mono ${classes.textAccent} text-base`}>{formatPrice(cartSubtotal)}</span>
                </div>
              </div>

              <button
                id="pos-send-order-btn"
                disabled={cart.length === 0 || isSubmitting}
                onClick={handleSendOrder}
                className={`w-full py-3.5 ${classes.radiusBtn} font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 transition-all duration-150 shadow-md ${
                  cart.length === 0 || isSubmitting
                    ? `${classes.secondaryBtn} opacity-50 cursor-not-allowed`
                    : `${classes.primaryBtn} cursor-pointer`
                }`}
              >
                {isSubmitting ? (
                  <span className="animate-pulse">Enviando a Cocina...</span>
                ) : (
                  <>
                    <Send className="w-4 h-4" />
                    Marchar Comanda ({currentTable?.name || 'Mesa'})
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>

      {/* Note / Clarification Modal */}
      {editingCartItemIndex !== null && cart[editingCartItemIndex] && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} max-w-sm w-full p-5 space-y-4 shadow-2xl animate-scale-in`}>
            <div className={`flex items-center justify-between border-b ${classes.borderDivider} pb-3`}>
              <h4 className={`text-xs font-black uppercase tracking-wider ${classes.textPrimary} flex items-center gap-2`}>
                <MessageSquare className={`w-4 h-4 ${classes.textAccent}`} />
                Nota para Cocina
              </h4>
              <button
                onClick={() => setEditingCartItemIndex(null)}
                className={`${classes.textMuted} hover:${classes.textPrimary}`}
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="space-y-2">
              <p className={`text-xs font-bold ${classes.textPrimary}`}>
                {cart[editingCartItemIndex].menuItem.name}
              </p>
              <textarea
                id="pos-item-note-textarea"
                rows={3}
                value={tempNote}
                onChange={(e) => setTempNote(e.target.value)}
                placeholder="Ej: Sin sal, término medio, aderezo aparte, etc."
                className={`w-full ${classes.inputBg} border ${classes.inputBorder} ${classes.radiusBtn} p-3 text-xs ${classes.textPrimary} outline-none transition resize-none`}
                maxLength={200}
                autoFocus
              />
              <div className={`flex justify-between text-[10px] ${classes.textMuted}`}>
                <span>Instrucción especial para la comanda</span>
                <span>{tempNote.length}/200</span>
              </div>
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setEditingCartItemIndex(null)}
                className={`flex-1 py-2.5 ${classes.radiusBtn} ${classes.secondaryBtn} font-bold text-xs uppercase tracking-wider transition cursor-pointer`}
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleSaveNote}
                className={`flex-1 py-2.5 ${classes.radiusBtn} ${classes.primaryBtn} font-black text-xs uppercase tracking-wider transition cursor-pointer`}
              >
                Guardar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
