import React, { useState, useMemo, useEffect } from 'react';
import {
  Search,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  ArrowUpDown,
  Download,
  Lock,
  X,
  Database,
} from 'lucide-react';
import { Order, OrderStatus, Table, UserRole } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface OrdersTableProps {
  orders: Order[];
  tables: Table[];
  role: UserRole;
  formatPrice: (price: number) => string;
}

type SortKey = 'createdAt' | 'duration' | 'total' | 'table' | 'status' | 'items';
type SortDir = 'asc' | 'desc';
type PeriodFilter = 'today' | '7d' | '30d' | 'all';

const PAGE_SIZE = 25;

const ALL_STATUSES: OrderStatus[] = ['Recibido', 'En preparación', 'Listo', 'Entregado', 'Cancelado'];

// Chronological weight so sorting by status follows the kitchen lifecycle
// instead of the alphabet.
const STATUS_WEIGHT: Record<OrderStatus, number> = {
  'Recibido': 0,
  'En preparación': 1,
  'Listo': 2,
  'Entregado': 3,
  'Cancelado': 4,
};

const STATUS_STYLE: Record<OrderStatus, string> = {
  'Recibido': 'bg-amber-500/10 text-amber-500 border-amber-500/20',
  'En preparación': 'bg-indigo-500/10 text-indigo-400 border-indigo-500/20',
  'Listo': 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20',
  'Entregado': 'bg-zinc-500/10 text-zinc-400 border-zinc-500/20',
  'Cancelado': 'bg-rose-500/10 text-rose-400 border-rose-500/20',
};

const isTerminal = (s: OrderStatus) => s === 'Entregado' || s === 'Cancelado';

const formatDuration = (ms: number) => {
  if (!isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.floor(ms / 1000);
  const h = Math.floor(totalSec / 3600);
  const m = Math.floor((totalSec % 3600) / 60);
  const s = totalSec % 60;
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
};

const formatClock = (iso: string) =>
  new Date(iso).toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', hour12: false });

const formatDay = (iso: string) =>
  new Date(iso).toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' });

const shortId = (id: string) => id.slice(-6).toUpperCase();

// An order enriched with the derived fields the table sorts and filters on.
interface OrderRow {
  order: Order;
  total: number;
  unitCount: number;
  durationMs: number;
  isLive: boolean;
  searchBlob: string;
}

export default function OrdersTable({ orders, tables, role, formatPrice }: OrdersTableProps) {
  const { classes } = useTheme();

  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | OrderStatus>('all');
  const [tableFilter, setTableFilter] = useState('all');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('today');
  const [sortKey, setSortKey] = useState<SortKey>('createdAt');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [page, setPage] = useState(0);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Orders still in the kitchen have a duration that grows in real time. The
  // parent polls every 3s, but this keeps the clock honest if polling stalls.
  const [nowTick, setNowTick] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNowTick(Date.now()), 15000);
    return () => clearInterval(t);
  }, []);

  // Any filter change invalidates the current page offset.
  useEffect(() => {
    setPage(0);
  }, [search, statusFilter, tableFilter, periodFilter]);

  const rows: OrderRow[] = useMemo(() => {
    return orders.map((order) => {
      const total = order.items.reduce((acc, i) => acc + i.price * i.quantity, 0);
      const unitCount = order.items.reduce((acc, i) => acc + i.quantity, 0);

      // Closed orders measure created→delivered; open ones measure created→now.
      const startMs = new Date(order.createdAt).getTime();
      const endMs = isTerminal(order.status)
        ? new Date(order.deliveredAt || order.updatedAt).getTime()
        : nowTick;

      const searchBlob = [
        shortId(order.id),
        order.tableName,
        order.dinerName || '',
        order.status,
        ...order.items.map((i) => `${i.name} ${i.comment || ''}`),
      ]
        .join(' ')
        .toLowerCase();

      return {
        order,
        total,
        unitCount,
        durationMs: endMs - startMs,
        isLive: !isTerminal(order.status),
        searchBlob,
      };
    });
  }, [orders, nowTick]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();

    // Period cutoffs are computed from local midnight, matching how a shift is
    // read on the floor.
    let cutoffMs = 0;
    if (periodFilter !== 'all') {
      const midnight = new Date();
      midnight.setHours(0, 0, 0, 0);
      const days = periodFilter === 'today' ? 0 : periodFilter === '7d' ? 6 : 29;
      cutoffMs = midnight.getTime() - days * 86400000;
    }

    return rows.filter((r) => {
      if (statusFilter !== 'all' && r.order.status !== statusFilter) return false;
      if (tableFilter !== 'all' && r.order.tableId !== tableFilter) return false;
      if (cutoffMs > 0 && new Date(r.order.createdAt).getTime() < cutoffMs) return false;
      if (term && !r.searchBlob.includes(term)) return false;
      return true;
    });
  }, [rows, search, statusFilter, tableFilter, periodFilter]);

  const sorted = useMemo(() => {
    const dir = sortDir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case 'createdAt':
          cmp = new Date(a.order.createdAt).getTime() - new Date(b.order.createdAt).getTime();
          break;
        case 'duration':
          cmp = a.durationMs - b.durationMs;
          break;
        case 'total':
          cmp = a.total - b.total;
          break;
        case 'items':
          cmp = a.unitCount - b.unitCount;
          break;
        case 'table':
          cmp = a.order.tableName.localeCompare(b.order.tableName, 'es');
          break;
        case 'status':
          cmp = STATUS_WEIGHT[a.order.status] - STATUS_WEIGHT[b.order.status];
          break;
      }
      // Stable tiebreaker so equal keys keep a predictable order across renders.
      if (cmp === 0) cmp = a.order.id.localeCompare(b.order.id);
      return cmp * dir;
    });
  }, [filtered, sortKey, sortDir]);

  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const safePage = Math.min(page, pageCount - 1);
  const pageRows = sorted.slice(safePage * PAGE_SIZE, safePage * PAGE_SIZE + PAGE_SIZE);

  // Aggregates mirror the metrics panel, which is admin-only: they expose
  // business performance rather than the floor state a waiter needs.
  const aggregates = useMemo(() => {
    const billable = sorted.filter((r) => r.order.status !== 'Cancelado');
    const revenue = billable.reduce((acc, r) => acc + r.total, 0);
    const closed = sorted.filter((r) => isTerminal(r.order.status));
    const avgDuration = closed.length
      ? closed.reduce((acc, r) => acc + r.durationMs, 0) / closed.length
      : 0;
    return {
      revenue,
      orderCount: sorted.length,
      averageTicket: billable.length ? revenue / billable.length : 0,
      avgDuration,
    };
  }, [sorted]);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'table' || key === 'status' ? 'asc' : 'desc');
    }
  };

  const toggleExpanded = (id: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const clearFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setTableFilter('all');
    setPeriodFilter('today');
  };

  const hasActiveFilters =
    search.trim() !== '' || statusFilter !== 'all' || tableFilter !== 'all' || periodFilter !== 'today';

  // Exports the filtered set, not just the visible page — the point is to take
  // the current query into a spreadsheet.
  const exportCsv = () => {
    const esc = (v: string | number) => `"${String(v).replace(/"/g, '""')}"`;
    const header = [
      'ID', 'Fecha', 'Hora', 'Mesa', 'Comensal', 'Estado',
      'Items', 'Unidades', 'Total', 'Duracion', 'Pago', 'Cierre de caja', 'Motivo cancelacion',
    ];
    const lines = sorted.map((r) =>
      [
        shortId(r.order.id),
        formatDay(r.order.createdAt),
        formatClock(r.order.createdAt),
        r.order.tableName,
        r.order.dinerName || '',
        r.order.status,
        r.order.items.map((i) => `${i.quantity}x ${i.name}`).join(' | '),
        r.unitCount,
        r.total,
        formatDuration(r.durationMs),
        r.order.paymentStatus === 'paid' ? 'Pagado' : r.order.paymentStatus === 'pending' ? 'Pendiente' : '',
        r.order.cashCloseId ? 'Si' : 'No',
        r.order.cancellationReason || '',
      ].map(esc).join(',')
    );

    // BOM keeps accents readable when Excel opens the file.
    const blob = new Blob(['﻿' + [header.map(esc).join(','), ...lines].join('\r\n')], {
      type: 'text/csv;charset=utf-8;',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `pedidos_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const SortHeader = ({ label, sortKey: key, align }: { label: string; sortKey: SortKey; align?: 'right' }) => (
    <th className={`p-3 ${align === 'right' ? 'text-right' : ''}`}>
      <button
        onClick={() => toggleSort(key)}
        className={`inline-flex items-center gap-1 hover:text-amber-500 transition ${
          sortKey === key ? 'text-amber-500' : ''
        }`}
        title={`Ordenar por ${label}`}
      >
        <span>{label}</span>
        {sortKey === key ? (
          <ChevronDown className={`w-3 h-3 transition-transform ${sortDir === 'asc' ? 'rotate-180' : ''}`} />
        ) : (
          <ArrowUpDown className="w-2.5 h-2.5 opacity-40" />
        )}
      </button>
    </th>
  );

  const selectClass = `${classes.inputBg} border ${classes.inputBorder} ${classes.textPrimary} ${classes.radiusBtn} px-3 py-2 text-[11px] font-mono outline-none focus:border-amber-500 transition`;

  return (
    <div className="space-y-4">
      {/* Toolbar: search + filters */}
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-4 space-y-3`}>
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="relative flex-1 min-w-[220px]">
            <Search className={`w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 ${classes.textMuted}`} />
            <input
              id="orders-table-search"
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar por ID, mesa, comensal, plato o comentario..."
              className={`w-full ${classes.inputBg} border ${classes.inputBorder} ${classes.textPrimary} ${classes.radiusBtn} pl-9 pr-3 py-2 text-xs outline-none focus:border-amber-500 transition`}
            />
          </div>

          <select
            id="orders-table-status-filter"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as 'all' | OrderStatus)}
            className={selectClass}
          >
            <option value="all">Todos los estados</option>
            {ALL_STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>

          <select
            id="orders-table-table-filter"
            value={tableFilter}
            onChange={(e) => setTableFilter(e.target.value)}
            className={selectClass}
          >
            <option value="all">Todas las mesas</option>
            {tables.map((t) => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>

          <select
            id="orders-table-period-filter"
            value={periodFilter}
            onChange={(e) => setPeriodFilter(e.target.value as PeriodFilter)}
            className={selectClass}
          >
            <option value="today">Hoy</option>
            <option value="7d">Últimos 7 días</option>
            <option value="30d">Últimos 30 días</option>
            <option value="all">Historial completo</option>
          </select>

          {hasActiveFilters && (
            <button
              id="orders-table-clear-filters"
              onClick={clearFilters}
              className={`px-3 py-2 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} ${classes.textMuted} hover:text-rose-400 hover:border-rose-500/40 text-[10px] font-black uppercase tracking-widest transition flex items-center gap-1.5`}
              title="Limpiar filtros"
            >
              <X className="w-3 h-3" />
              Limpiar
            </button>
          )}

          {/* Exporting the dataset is analytics territory: admin only. */}
          {role === 'admin' && (
            <button
              id="orders-table-export"
              onClick={exportCsv}
              disabled={sorted.length === 0}
              className={`px-3 py-2 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} ${classes.textSecondary} hover:border-amber-500 hover:text-amber-500 text-[10px] font-black uppercase tracking-widest transition flex items-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed`}
              title="Exportar el resultado filtrado a CSV"
            >
              <Download className="w-3 h-3" />
              CSV
            </button>
          )}
        </div>

        <div className={`flex items-center gap-2 text-[10px] font-mono ${classes.textMuted}`}>
          <Database className="w-3 h-3" />
          <span>
            {sorted.length} pedido(s) coinciden · mostrando {pageRows.length} de {sorted.length}
          </span>
        </div>
      </div>

      {/* Aggregate strip — admin only, consistent with the metrics panel. */}
      {role === 'admin' ? (
        <div className={`grid grid-cols-2 lg:grid-cols-4 gap-3`}>
          {[
            { label: 'Pedidos', value: String(aggregates.orderCount) },
            { label: 'Facturado', value: formatPrice(aggregates.revenue) },
            { label: 'Ticket promedio', value: formatPrice(aggregates.averageTicket) },
            { label: 'Duración promedio', value: formatDuration(aggregates.avgDuration) },
          ].map((kpi) => (
            <div key={kpi.label} className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-3.5`}>
              <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>
                {kpi.label}
              </span>
              <span className={`text-lg font-black ${classes.textPrimary} font-mono mt-0.5 block`}>{kpi.value}</span>
            </div>
          ))}
        </div>
      ) : (
        <div className={`${classes.inputBg} border ${classes.borderCard} ${classes.radiusCard} px-4 py-2.5 flex items-center gap-2`}>
          <Lock className={`w-3 h-3 ${classes.textMuted} shrink-0`} />
          <span className={`text-[10px] ${classes.textMuted} font-medium`}>
            Los totales agregados y la exportación están reservados al rol administrador.
          </span>
        </div>
      )}

      {/* Data table */}
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden`}>
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className={`border-b ${classes.borderCard} ${classes.bgHeader} ${classes.textMuted} font-mono text-[9px] uppercase tracking-widest font-bold`}>
                <th className="p-3 w-8"></th>
                <th className="p-3">ID</th>
                <SortHeader label="Mesa" sortKey="table" />
                <th className="p-3">Comensal</th>
                <SortHeader label="Items" sortKey="items" />
                <SortHeader label="Total" sortKey="total" align="right" />
                <SortHeader label="Estado" sortKey="status" />
                <SortHeader label="Hora" sortKey="createdAt" />
                <SortHeader label="Duración" sortKey="duration" />
                <th className="p-3">Caja</th>
              </tr>
            </thead>
            <tbody className={`divide-y ${classes.borderCard} text-xs`}>
              {pageRows.length === 0 ? (
                <tr>
                  <td colSpan={10} className={`p-12 text-center ${classes.textMuted}`}>
                    <Database className="w-8 h-8 mx-auto mb-3 opacity-40" />
                    <p className="text-xs font-bold uppercase tracking-wider">Sin resultados</p>
                    <p className="text-[11px] mt-1">Ajusta la búsqueda o los filtros para ver pedidos.</p>
                  </td>
                </tr>
              ) : (
                pageRows.map((r) => {
                  const o = r.order;
                  const isOpen = expanded.has(o.id);
                  return (
                    <React.Fragment key={o.id}>
                      <tr
                        id={`orders-row-${o.id}`}
                        onClick={() => toggleExpanded(o.id)}
                        className={`${classes.bgCardHover} cursor-pointer transition ${isOpen ? classes.inputBg : ''}`}
                      >
                        <td className="p-3">
                          <ChevronRight
                            className={`w-3.5 h-3.5 ${classes.textMuted} transition-transform ${isOpen ? 'rotate-90' : ''}`}
                          />
                        </td>
                        <td className={`p-3 font-mono text-[10px] ${classes.textMuted}`}>#{shortId(o.id)}</td>
                        <td className={`p-3 font-bold ${classes.textPrimary}`}>{o.tableName}</td>
                        <td className={`p-3 ${classes.textSecondary}`}>
                          {o.dinerName || <span className={classes.textMuted}>—</span>}
                        </td>
                        <td className={`p-3 font-mono ${classes.textSecondary}`}>
                          {r.unitCount} <span className={`${classes.textMuted} text-[10px]`}>u.</span>
                        </td>
                        <td className={`p-3 text-right font-mono font-black ${o.status === 'Cancelado' ? `${classes.textMuted} line-through` : 'text-amber-500'}`}>
                          {formatPrice(r.total)}
                        </td>
                        <td className="p-3">
                          <span className={`text-[9px] font-black font-mono uppercase px-2 py-1 ${classes.radiusPill} border tracking-wider whitespace-nowrap ${STATUS_STYLE[o.status]}`}>
                            {o.status}
                          </span>
                        </td>
                        <td className={`p-3 font-mono ${classes.textSecondary} whitespace-nowrap`}>
                          <span className={`${classes.textMuted} text-[10px] mr-1.5`}>{formatDay(o.createdAt)}</span>
                          {formatClock(o.createdAt)}
                        </td>
                        <td className={`p-3 font-mono whitespace-nowrap ${r.isLive ? 'text-amber-500 font-bold' : classes.textSecondary}`}>
                          {formatDuration(r.durationMs)}
                          {r.isLive && <span className="ml-1 text-[9px] uppercase opacity-70">en curso</span>}
                        </td>
                        <td className="p-3">
                          {o.cashCloseId ? (
                            <span className={`inline-flex items-center gap-1 text-[9px] font-mono font-bold ${classes.textMuted}`} title="Congelado por un cierre de caja">
                              <Lock className="w-2.5 h-2.5" /> Cerrado
                            </span>
                          ) : (
                            <span className="text-[9px] font-mono font-bold text-emerald-500/70">Abierto</span>
                          )}
                        </td>
                      </tr>

                      {/* Expanded detail: the line items and their specifications */}
                      {isOpen && (
                        <tr className={classes.inputBg}>
                          <td colSpan={10} className="px-3 pb-4 pt-1">
                            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-4 space-y-3`}>
                              <div className="space-y-2">
                                {o.items.map((i) => (
                                  <div key={i.id} className={`flex items-start justify-between gap-4 pb-2 border-b ${classes.borderDivider} last:border-0 last:pb-0`}>
                                    <div className="min-w-0">
                                      <p className={`text-xs font-medium ${classes.textPrimary}`}>
                                        <span className="font-mono text-amber-500 font-bold mr-2">{i.quantity}x</span>
                                        {i.name}
                                      </p>
                                      {i.comment && (
                                        <div className={`mt-1.5 ml-6 px-2 py-1.5 border-l-2 border-amber-500 bg-amber-500/5 text-amber-500 text-[10px] font-medium italic ${classes.radiusCard}`}>
                                          "{i.comment}"
                                        </div>
                                      )}
                                    </div>
                                    <div className="text-right shrink-0 font-mono">
                                      <span className={`block text-[10px] ${classes.textMuted}`}>{formatPrice(i.price)} c/u</span>
                                      <span className={`block text-xs font-bold ${classes.textPrimary}`}>{formatPrice(i.price * i.quantity)}</span>
                                    </div>
                                  </div>
                                ))}
                              </div>

                              {/* Per-order metadata that has no column of its own */}
                              <div className={`grid grid-cols-2 md:grid-cols-4 gap-3 pt-3 border-t ${classes.borderCard}`}>
                                {[
                                  { label: 'Creado', value: `${formatDay(o.createdAt)} ${formatClock(o.createdAt)}` },
                                  { label: 'Última actualización', value: `${formatDay(o.updatedAt)} ${formatClock(o.updatedAt)}` },
                                  { label: 'Entregado', value: o.deliveredAt ? `${formatDay(o.deliveredAt)} ${formatClock(o.deliveredAt)}` : '—' },
                                  { label: 'Pago', value: o.paymentStatus === 'paid' ? 'Pagado' : o.paymentStatus === 'pending' ? 'Pendiente' : '—' },
                                ].map((m) => (
                                  <div key={m.label}>
                                    <span className={`text-[9px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>{m.label}</span>
                                    <span className={`text-[11px] font-mono ${classes.textSecondary}`}>{m.value}</span>
                                  </div>
                                ))}
                              </div>

                              {o.cancellationReason && (
                                <div className="px-3 py-2 bg-rose-500/5 border border-rose-500/20 rounded-lg">
                                  <span className="text-[9px] text-rose-400 font-mono font-black uppercase tracking-widest block">Motivo de cancelación</span>
                                  <span className="text-[11px] text-rose-300">{o.cancellationReason}</span>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        {sorted.length > PAGE_SIZE && (
          <div className={`flex items-center justify-between gap-3 px-4 py-3 border-t ${classes.borderCard}`}>
            <span className={`text-[10px] font-mono ${classes.textMuted}`}>
              Página {safePage + 1} de {pageCount}
            </span>
            <div className="flex items-center gap-2">
              <button
                id="orders-table-prev"
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={safePage === 0}
                className={`px-3 py-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} ${classes.textSecondary} hover:border-amber-500 text-[10px] font-black uppercase tracking-widest transition flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                <ChevronLeft className="w-3 h-3" /> Anterior
              </button>
              <button
                id="orders-table-next"
                onClick={() => setPage((p) => Math.min(pageCount - 1, p + 1))}
                disabled={safePage >= pageCount - 1}
                className={`px-3 py-1.5 ${classes.radiusBtn} ${classes.bgCard} border ${classes.borderCard} ${classes.textSecondary} hover:border-amber-500 text-[10px] font-black uppercase tracking-widest transition flex items-center gap-1 disabled:opacity-30 disabled:cursor-not-allowed`}
              >
                Siguiente <ChevronRight className="w-3 h-3" />
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
