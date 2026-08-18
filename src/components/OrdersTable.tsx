import React, { useState, useMemo } from 'react';
import {
  Search,
  Filter,
  Download,
  Eye,
  Printer,
  Clock,
  CheckCircle,
  AlertTriangle,
  XCircle,
  ShoppingBag,
  X,
  ChevronLeft,
  ChevronRight,
  Calendar,
  RotateCcw,
  Tag,
  User,
  MapPin,
  DollarSign
} from 'lucide-react';
import { Order, OrderStatus, Table, UserRole } from '../types';
import { useTheme } from '../theme/ThemeContext';
import { printKitchenTicket } from '../lib/thermalPrint';

interface OrdersTableProps {
  orders: Order[];
  tables: Table[];
  role: UserRole;
  formatPrice: (price: number) => string;
}

export default function OrdersTable({
  orders,
  tables,
  role: _role,
  formatPrice
}: OrdersTableProps) {
  const { classes } = useTheme();

  // Filter & Search states
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [tableFilter, setTableFilter] = useState<string>('all');
  const [paymentFilter, setPaymentFilter] = useState<string>('all');
  const [dateFilter, setDateFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'date_desc' | 'date_asc' | 'total_desc' | 'total_asc'>('date_desc');

  // Pagination states
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(15);

  // Detail Modal state
  const [selectedOrder, setSelectedOrder] = useState<Order | null>(null);

  // Helper: calculate total for an order
  const getOrderTotal = (order: Order): number => {
    return order.items.reduce((sum, item) => sum + (item.price * item.quantity), 0);
  };

  // Helper: total item count for an order
  const getOrderItemCount = (order: Order): number => {
    return order.items.reduce((sum, item) => sum + item.quantity, 0);
  };

  // Status Badge Helper
  const getStatusBadge = (status: OrderStatus) => {
    switch (status) {
      case 'Recibido':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-blue-500/10 text-blue-400 border border-blue-500/20">
            <Clock className="w-3 h-3" />
            Recibido
          </span>
        );
      case 'En preparación':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-amber-500/10 text-amber-400 border border-amber-500/20">
            <ShoppingBag className="w-3 h-3 animate-pulse" />
            En preparación
          </span>
        );
      case 'Listo':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">
            <CheckCircle className="w-3 h-3" />
            Listo
          </span>
        );
      case 'Entregado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            <CheckCircle className="w-3 h-3" />
            Entregado
          </span>
        );
      case 'Cancelado':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-rose-500/10 text-rose-400 border border-rose-500/20">
            <XCircle className="w-3 h-3" />
            Cancelado
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-semibold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
            {status}
          </span>
        );
    }
  };

  // Payment Badge Helper
  const getPaymentBadge = (status: 'pending' | 'paid' | null) => {
    if (status === 'paid') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-emerald-500/15 text-emerald-400 border border-emerald-500/30">
          <DollarSign className="w-3 h-3" />
          Pagado
        </span>
      );
    }
    if (status === 'pending') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-500/15 text-amber-400 border border-amber-500/30">
          <Clock className="w-3 h-3" />
          Pendiente
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
        Sin cobrar
      </span>
    );
  };

  // Filtered and sorted orders
  const filteredOrders = useMemo(() => {
    const now = new Date();
    const todayStr = now.toISOString().slice(0, 10);
    const yesterdayDate = new Date(now);
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 7);

    return orders
      .filter((order) => {
        // Search query filter
        if (searchQuery.trim()) {
          const q = searchQuery.toLowerCase().trim();
          const matchId = order.id.toLowerCase().includes(q);
          const matchTable = (order.tableName || '').toLowerCase().includes(q);
          const matchDiner = (order.dinerName || '').toLowerCase().includes(q);
          const matchItems = order.items.some((it) => it.name.toLowerCase().includes(q) || (it.comment || '').toLowerCase().includes(q));
          if (!matchId && !matchTable && !matchDiner && !matchItems) {
            return false;
          }
        }

        // Status filter
        if (statusFilter !== 'all' && order.status !== statusFilter) {
          return false;
        }

        // Table filter
        if (tableFilter !== 'all' && order.tableId !== tableFilter && order.tableName !== tableFilter) {
          return false;
        }

        // Payment filter
        if (paymentFilter === 'paid' && order.paymentStatus !== 'paid') {
          return false;
        }
        if (paymentFilter === 'pending' && order.paymentStatus !== 'pending') {
          return false;
        }
        if (paymentFilter === 'unpaid' && (order.paymentStatus === 'paid')) {
          return false;
        }

        // Date filter
        if (dateFilter === 'today') {
          const orderDate = order.createdAt.slice(0, 10);
          if (orderDate !== todayStr) return false;
        } else if (dateFilter === 'yesterday') {
          const orderDate = order.createdAt.slice(0, 10);
          if (orderDate !== yesterdayStr) return false;
        } else if (dateFilter === 'week') {
          const orderDate = new Date(order.createdAt);
          if (orderDate < weekAgo) return false;
        }

        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'date_desc') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (sortBy === 'date_asc') {
          return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
        }
        if (sortBy === 'total_desc') {
          return getOrderTotal(b) - getOrderTotal(a);
        }
        if (sortBy === 'total_asc') {
          return getOrderTotal(a) - getOrderTotal(b);
        }
        return 0;
      });
  }, [orders, searchQuery, statusFilter, tableFilter, paymentFilter, dateFilter, sortBy]);

  // Paginated subset
  const totalPages = Math.max(1, Math.ceil(filteredOrders.length / pageSize));
  const paginatedOrders = useMemo(() => {
    const startIndex = (currentPage - 1) * pageSize;
    return filteredOrders.slice(startIndex, startIndex + pageSize);
  }, [filteredOrders, currentPage, pageSize]);

  // Reset pagination when filter changes
  const handleFilterReset = () => {
    setSearchQuery('');
    setStatusFilter('all');
    setTableFilter('all');
    setPaymentFilter('all');
    setDateFilter('all');
    setSortBy('date_desc');
    setCurrentPage(1);
  };

  // Export to CSV
  const handleExportCSV = () => {
    if (filteredOrders.length === 0) return;

    const headers = ['ID', 'Fecha', 'Hora', 'Mesa', 'Comensal', 'Estado', 'Pago', 'Items', 'Total'];
    const rows = filteredOrders.map((o) => {
      const d = new Date(o.createdAt);
      const dateStr = d.toLocaleDateString('es-AR');
      const timeStr = d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
      const itemsStr = o.items.map((it) => `${it.quantity}x ${it.name}`).join('; ');
      const total = getOrderTotal(o);

      return [
        o.id,
        dateStr,
        timeStr,
        `"${o.tableName || ''}"`,
        `"${o.dinerName || ''}"`,
        o.status,
        o.paymentStatus || 'Sin cobrar',
        `"${itemsStr}"`,
        total
      ];
    });

    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `pedidos_${new Date().toISOString().slice(0, 10)}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      {/* Control Bar: Search & Filters */}
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-4 space-y-3`}>
        <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className={`w-4 h-4 absolute left-3.5 top-1/2 -translate-y-1/2 ${classes.textMuted}`} />
            <input
              id="orders-table-search-input"
              type="text"
              value={searchQuery}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setCurrentPage(1);
              }}
              placeholder="Buscar por ID, mesa, comensal o plato..."
              className={`w-full pl-10 pr-4 py-2 text-xs ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} placeholder:${classes.textMuted} focus:outline-none focus:border-amber-500 transition`}
            />
            {searchQuery && (
              <button
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-zinc-200"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          {/* Quick Actions: Export CSV & Reset */}
          <div className="flex items-center gap-2">
            <button
              id="orders-table-export-csv-btn"
              onClick={handleExportCSV}
              disabled={filteredOrders.length === 0}
              className={`px-3 py-2 ${classes.radiusBtn} text-xs font-black uppercase tracking-wider ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 ${classes.textPrimary} transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Descargar pedidos filtrados como archivo CSV"
            >
              <Download className="w-3.5 h-3.5 text-amber-500" />
              <span>Exportar CSV</span>
            </button>

            <button
              id="orders-table-reset-filters-btn"
              onClick={handleFilterReset}
              className={`p-2 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 ${classes.textMuted} hover:${classes.textPrimary} transition`}
              title="Restablecer filtros"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        {/* Filter Dropdowns Grid */}
        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-5 gap-2.5 pt-2 border-t border-zinc-800/40">
          {/* Status Filter */}
          <div className="space-y-1">
            <label className={`text-[10px] font-black uppercase tracking-wider ${classes.textMuted} block`}>
              Estado
            </label>
            <select
              id="orders-table-status-filter"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full px-2.5 py-1.5 text-xs ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} focus:outline-none focus:border-amber-500`}
            >
              <option value="all">Todos los estados</option>
              <option value="Recibido">Recibido</option>
              <option value="En preparación">En preparación</option>
              <option value="Listo">Listo</option>
              <option value="Entregado">Entregado</option>
              <option value="Cancelado">Cancelado</option>
            </select>
          </div>

          {/* Table Filter */}
          <div className="space-y-1">
            <label className={`text-[10px] font-black uppercase tracking-wider ${classes.textMuted} block`}>
              Mesa
            </label>
            <select
              id="orders-table-table-filter"
              value={tableFilter}
              onChange={(e) => {
                setTableFilter(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full px-2.5 py-1.5 text-xs ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} focus:outline-none focus:border-amber-500`}
            >
              <option value="all">Todas las mesas</option>
              {tables.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Filter */}
          <div className="space-y-1">
            <label className={`text-[10px] font-black uppercase tracking-wider ${classes.textMuted} block`}>
              Pago
            </label>
            <select
              id="orders-table-payment-filter"
              value={paymentFilter}
              onChange={(e) => {
                setPaymentFilter(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full px-2.5 py-1.5 text-xs ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} focus:outline-none focus:border-amber-500`}
            >
              <option value="all">Todos</option>
              <option value="paid">Pagados</option>
              <option value="pending">Pendientes</option>
              <option value="unpaid">Sin cobrar</option>
            </select>
          </div>

          {/* Date Filter */}
          <div className="space-y-1">
            <label className={`text-[10px] font-black uppercase tracking-wider ${classes.textMuted} block`}>
              Fecha
            </label>
            <select
              id="orders-table-date-filter"
              value={dateFilter}
              onChange={(e) => {
                setDateFilter(e.target.value);
                setCurrentPage(1);
              }}
              className={`w-full px-2.5 py-1.5 text-xs ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} focus:outline-none focus:border-amber-500`}
            >
              <option value="all">Todo el historial</option>
              <option value="today">Hoy</option>
              <option value="yesterday">Ayer</option>
              <option value="week">Últimos 7 días</option>
            </select>
          </div>

          {/* Sort By */}
          <div className="space-y-1 col-span-2 sm:col-span-1">
            <label className={`text-[10px] font-black uppercase tracking-wider ${classes.textMuted} block`}>
              Ordenar por
            </label>
            <select
              id="orders-table-sort-filter"
              value={sortBy}
              onChange={(e) => setSortBy(e.target.value as any)}
              className={`w-full px-2.5 py-1.5 text-xs ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} focus:outline-none focus:border-amber-500`}
            >
              <option value="date_desc">Más recientes primero</option>
              <option value="date_asc">Más antiguos primero</option>
              <option value="total_desc">Mayor importe</option>
              <option value="total_asc">Menor importe</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders Table Container */}
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden shadow-sm`}>
        {paginatedOrders.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-zinc-800/60 border border-zinc-700/50 flex items-center justify-center mx-auto text-zinc-400">
              <ShoppingBag className="w-6 h-6" />
            </div>
            <div className="space-y-1">
              <h3 className={`text-sm font-black ${classes.textPrimary}`}>No se encontraron pedidos</h3>
              <p className={`text-xs ${classes.textMuted} max-w-sm mx-auto`}>
                Intenta ajustar los filtros de búsqueda, fecha o estado para visualizar los registros.
              </p>
            </div>
            {(searchQuery || statusFilter !== 'all' || tableFilter !== 'all' || paymentFilter !== 'all' || dateFilter !== 'all') && (
              <button
                onClick={handleFilterReset}
                className="px-3 py-1.5 text-xs font-bold text-amber-500 hover:underline"
              >
                Limpiar todos los filtros
              </button>
            )}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className={`border-b ${classes.borderCard} bg-zinc-950/30 text-[10px] font-black uppercase tracking-wider ${classes.textMuted}`}>
                  <th className="py-3 px-4">Pedido / ID</th>
                  <th className="py-3 px-4">Mesa / Comensal</th>
                  <th className="py-3 px-4">Fecha y Hora</th>
                  <th className="py-3 px-4">Ítems</th>
                  <th className="py-3 px-4">Estado</th>
                  <th className="py-3 px-4">Pago</th>
                  <th className="py-3 px-4 text-right">Total</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-800/40 text-xs">
                {paginatedOrders.map((order) => {
                  const total = getOrderTotal(order);
                  const itemCount = getOrderItemCount(order);
                  const dateObj = new Date(order.createdAt);
                  const timeFormatted = dateObj.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' });
                  const dateFormatted = dateObj.toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit' });

                  return (
                    <tr
                      key={order.id}
                      id={`order-row-${order.id}`}
                      className="hover:bg-zinc-800/20 transition-colors group cursor-pointer"
                      onClick={() => setSelectedOrder(order)}
                    >
                      {/* ID */}
                      <td className="py-3.5 px-4 font-mono font-bold">
                        <span className="text-amber-500">#{order.id.slice(-4).toUpperCase()}</span>
                      </td>

                      {/* Mesa & Comensal */}
                      <td className="py-3.5 px-4">
                        <div className="space-y-0.5">
                          <span className={`font-bold ${classes.textPrimary} block flex items-center gap-1`}>
                            <MapPin className="w-3 h-3 text-amber-500 shrink-0" />
                            {order.tableName || 'Mesa'}
                          </span>
                          {order.dinerName && (
                            <span className={`text-[11px] ${classes.textMuted} flex items-center gap-1`}>
                              <User className="w-3 h-3 text-zinc-500 shrink-0" />
                              {order.dinerName}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Fecha y Hora */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        <div className="space-y-0.5">
                          <span className={`font-mono font-bold ${classes.textPrimary} block`}>
                            {timeFormatted}
                          </span>
                          <span className={`text-[10px] font-mono ${classes.textMuted} block`}>
                            {dateFormatted}
                          </span>
                        </div>
                      </td>

                      {/* Items */}
                      <td className="py-3.5 px-4 max-w-xs">
                        <div className="space-y-1">
                          <p className={`truncate font-medium ${classes.textPrimary}`} title={order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}>
                            {order.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                          </p>
                          <span className={`text-[10px] ${classes.textMuted} font-mono block`}>
                            {itemCount} {itemCount === 1 ? 'unidad' : 'unidades'} ({order.items.length} {order.items.length === 1 ? 'producto' : 'productos'})
                          </span>
                        </div>
                      </td>

                      {/* Estado */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getStatusBadge(order.status)}
                      </td>

                      {/* Pago */}
                      <td className="py-3.5 px-4 whitespace-nowrap">
                        {getPaymentBadge(order.paymentStatus)}
                      </td>

                      {/* Total */}
                      <td className="py-3.5 px-4 text-right whitespace-nowrap">
                        <span className={`font-mono font-black text-sm ${order.status === 'Cancelado' ? 'line-through text-zinc-500' : 'text-amber-500'}`}>
                          {formatPrice(total)}
                        </span>
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 text-center whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            id={`btn-view-order-${order.id}`}
                            onClick={() => setSelectedOrder(order)}
                            className={`p-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 text-zinc-400 hover:text-amber-400 transition`}
                            title="Ver detalle del pedido"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            id={`btn-print-order-${order.id}`}
                            onClick={() => printKitchenTicket(order)}
                            className={`p-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 text-zinc-400 hover:text-amber-400 transition`}
                            title="Imprimir comanda térmica"
                          >
                            <Printer className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Controls */}
        {filteredOrders.length > 0 && (
          <div className={`p-3.5 border-t ${classes.borderCard} flex flex-wrap items-center justify-between gap-3 text-xs`}>
            <div className={`flex items-center gap-2 ${classes.textMuted}`}>
              <span>Mostrar</span>
              <select
                value={pageSize}
                onChange={(e) => {
                  setPageSize(Number(e.target.value));
                  setCurrentPage(1);
                }}
                className={`px-2 py-1 ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} focus:outline-none`}
              >
                <option value={10}>10</option>
                <option value={15}>15</option>
                <option value={25}>25</option>
                <option value={50}>50</option>
              </select>
              <span>por página</span>
              <span className="hidden sm:inline">· Total: {filteredOrders.length} pedidos</span>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-mono ${classes.textMuted}`}>
                Página {currentPage} de {totalPages}
              </span>
              <div className="flex items-center gap-1">
                <button
                  onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                  disabled={currentPage === 1}
                  className={`p-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 ${classes.textPrimary} disabled:opacity-30 disabled:cursor-not-allowed transition`}
                  title="Página anterior"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button
                  onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                  disabled={currentPage === totalPages}
                  className={`p-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 ${classes.textPrimary} disabled:opacity-30 disabled:cursor-not-allowed transition`}
                  title="Página siguiente"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Modal: Order Detail */}
      {selectedOrder && (
        <div
          id="order-detail-modal"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fade-in"
          onClick={() => setSelectedOrder(null)}
        >
          <div
            className={`w-full max-w-lg ${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden shadow-2xl space-y-4`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className={`p-4 border-b ${classes.borderCard} flex items-center justify-between`}>
              <div className="space-y-0.5">
                <div className="flex items-center gap-2">
                  <h3 className={`text-base font-black ${classes.textPrimary}`}>
                    Pedido #{selectedOrder.id.slice(-4).toUpperCase()}
                  </h3>
                  {getStatusBadge(selectedOrder.status)}
                </div>
                <p className={`text-xs ${classes.textMuted}`}>
                  {selectedOrder.tableName} {selectedOrder.dinerName ? `· ${selectedOrder.dinerName}` : ''}
                </p>
              </div>

              <button
                id="btn-close-order-detail-modal"
                onClick={() => setSelectedOrder(null)}
                className={`p-1.5 ${classes.radiusBtn} text-zinc-400 hover:${classes.textPrimary} hover:bg-zinc-800/50 transition`}
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Content */}
            <div className="p-4 space-y-4 max-h-[70vh] overflow-y-auto">
              {/* Order Metadata Grid */}
              <div className="grid grid-cols-2 gap-2 text-xs bg-zinc-950/40 p-3 rounded-lg border border-zinc-800/60">
                <div>
                  <span className={`text-[10px] font-black uppercase ${classes.textMuted} block`}>Fecha de Creación</span>
                  <span className={`font-mono font-bold ${classes.textPrimary}`}>
                    {new Date(selectedOrder.createdAt).toLocaleString('es-AR')}
                  </span>
                </div>
                {selectedOrder.deliveredAt && (
                  <div>
                    <span className={`text-[10px] font-black uppercase ${classes.textMuted} block`}>Entregado a las</span>
                    <span className={`font-mono font-bold text-emerald-400`}>
                      {new Date(selectedOrder.deliveredAt).toLocaleTimeString('es-AR')}
                    </span>
                  </div>
                )}
                <div>
                  <span className={`text-[10px] font-black uppercase ${classes.textMuted} block`}>Estado de Pago</span>
                  <div className="mt-0.5">{getPaymentBadge(selectedOrder.paymentStatus)}</div>
                </div>
                {selectedOrder.cashCloseId && (
                  <div>
                    <span className={`text-[10px] font-black uppercase ${classes.textMuted} block`}>Cierre de Caja</span>
                    <span className="font-mono text-zinc-400">
                      #{selectedOrder.cashCloseId.slice(-6).toUpperCase()}
                    </span>
                  </div>
                )}
              </div>

              {/* Cancellation notice if any */}
              {selectedOrder.status === 'Cancelado' && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-lg flex items-start gap-2.5 text-xs text-rose-400">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <div className="space-y-0.5">
                    <span className="font-bold uppercase tracking-wider block">Pedido Cancelado</span>
                    <p className="text-zinc-300">
                      {selectedOrder.cancellationReason || 'Sin motivo especificado'}
                    </p>
                  </div>
                </div>
              )}

              {/* Items Breakdown */}
              <div className="space-y-2">
                <span className={`text-[10px] font-black uppercase tracking-wider ${classes.textMuted} block`}>
                  Detalle de Comanda ({selectedOrder.items.length} {selectedOrder.items.length === 1 ? 'ítem' : 'ítems'})
                </span>
                <div className="divide-y divide-zinc-800/40 border border-zinc-800/60 rounded-lg overflow-hidden">
                  {selectedOrder.items.map((item, idx) => (
                    <div key={idx} className="p-3 flex items-start justify-between gap-3 bg-zinc-950/20">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2">
                          <span className="w-5 h-5 rounded bg-amber-500/15 text-amber-400 font-mono font-bold text-xs flex items-center justify-center">
                            {item.quantity}x
                          </span>
                          <span className={`font-bold text-xs ${classes.textPrimary}`}>
                            {item.name}
                          </span>
                        </div>
                        {item.comment && (
                          <p className="text-[11px] text-amber-400/90 italic pl-7">
                            "{item.comment}"
                          </p>
                        )}
                      </div>
                      <div className="text-right">
                        <span className={`font-mono font-bold text-xs ${classes.textPrimary} block`}>
                          {formatPrice(item.price * item.quantity)}
                        </span>
                        {item.quantity > 1 && (
                          <span className={`font-mono text-[10px] ${classes.textMuted} block`}>
                            {formatPrice(item.price)} c/u
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Total Calculation Strip */}
              <div className="p-3.5 bg-zinc-950/60 border border-zinc-800/80 rounded-lg flex items-center justify-between">
                <span className={`text-xs font-black uppercase tracking-wider ${classes.textPrimary}`}>
                  Total de la Comanda
                </span>
                <span className={`text-lg font-mono font-black ${selectedOrder.status === 'Cancelado' ? 'line-through text-zinc-500' : 'text-amber-500'}`}>
                  {formatPrice(getOrderTotal(selectedOrder))}
                </span>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className={`p-4 border-t ${classes.borderCard} flex items-center justify-between gap-3 bg-zinc-950/20`}>
              <button
                id="btn-modal-print-kitchen-ticket"
                onClick={() => printKitchenTicket(selectedOrder)}
                className={`px-3.5 py-2 ${classes.radiusBtn} text-xs font-black uppercase tracking-wider ${classes.bgCard} border ${classes.borderCard} hover:border-amber-500 ${classes.textPrimary} transition flex items-center gap-2`}
              >
                <Printer className="w-4 h-4 text-amber-500" />
                <span>Imprimir Comanda</span>
              </button>

              <button
                id="btn-modal-close-detail"
                onClick={() => setSelectedOrder(null)}
                className={`px-4 py-2 ${classes.radiusBtn} text-xs font-black uppercase tracking-wider bg-zinc-800 hover:bg-zinc-700 text-zinc-200 transition`}
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
