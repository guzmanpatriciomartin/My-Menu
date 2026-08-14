import React, { useState, useMemo } from 'react';
import {
  TrendingUp,
  TrendingDown,
  Clock,
  DollarSign,
  ShoppingBag,
  Flame,
  BarChart3,
  Calendar,
  UtensilsCrossed,
  Layers,
  Sparkles
} from 'lucide-react';
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  Cell
} from 'recharts';
import { MetricsSummary } from '../types';
import { useTheme } from '../theme/ThemeContext';

interface MetricsDashboardProps {
  metrics: MetricsSummary | null;
  metricsDay: string;
  onDayChange: (day: string) => void;
  loading: boolean;
  formatPrice: (price: number) => string;
}

type ChartViewMode = 'revenue' | 'orders' | 'combined';

export default function MetricsDashboard({
  metrics,
  metricsDay,
  onDayChange,
  loading,
  formatPrice
}: MetricsDashboardProps) {
  const { classes, isDark } = useTheme();
  const [chartMode, setChartMode] = useState<ChartViewMode>('revenue');
  const [activeSlotFilter, setActiveSlotFilter] = useState<string | null>(null);

  // Format today / yesterday strings for quick date picking
  const todayStr = useMemo(() => new Date().toISOString().slice(0, 10), []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().slice(0, 10);
  }, []);

  // Format chart data with friendly labels
  const chartData = useMemo(() => {
    if (!metrics?.byHour) return [];
    return metrics.byHour.map((h) => {
      const label = `${String(h.hour).padStart(2, '0')}:00`;
      const endLabel = `${String((h.hour + 1) % 24).padStart(2, '0')}:00`;
      const avgTicket = h.orderCount > 0 ? Math.round(h.revenue / h.orderCount) : 0;
      return {
        hour: h.hour,
        label,
        range: `${label} - ${endLabel}`,
        revenue: h.revenue,
        orderCount: h.orderCount,
        avgTicket,
        isZero: h.revenue === 0 && h.orderCount === 0
      };
    });
  }, [metrics]);

  // Calculate Peak Hour & Key Analytics
  const peakHour = useMemo(() => {
    if (!metrics?.byHour || metrics.byHour.length === 0) return null;
    const sorted = [...metrics.byHour].sort((a, b) => b.revenue - a.revenue);
    const top = sorted[0];
    if (!top || top.revenue === 0) return null;
    return {
      hour: top.hour,
      label: `${String(top.hour).padStart(2, '0')}:00 hs`,
      revenue: top.revenue,
      orderCount: top.orderCount
    };
  }, [metrics]);

  // Calculate Time Slots (Franjas del Día)
  const timeSlots = useMemo(() => {
    if (!metrics?.byHour) return [];
    const slots = [
      { id: 'morning', name: 'Mañana', range: '07:00 - 12:00', icon: '🌅', hours: [7, 8, 9, 10, 11] },
      { id: 'lunch', name: 'Mediodía / Almuerzo', range: '12:00 - 16:00', icon: '☀️', hours: [12, 13, 14, 15] },
      { id: 'afternoon', name: 'Tarde / Merienda', range: '16:00 - 20:00', icon: '☕', hours: [16, 17, 18, 19] },
      { id: 'dinner', name: 'Noche / Cena', range: '20:00 - 02:00', icon: '🌙', hours: [20, 21, 22, 23, 0, 1] },
      { id: 'night', name: 'Madrugada', range: '02:00 - 07:00', icon: '✨', hours: [2, 3, 4, 5, 6] },
    ];

    const totalRev = metrics.totals.totalRevenue || 1;

    return slots.map((s) => {
      const slotHourData = metrics.byHour.filter((h) => s.hours.includes(h.hour));
      const revenue = slotHourData.reduce((acc, h) => acc + h.revenue, 0);
      const orders = slotHourData.reduce((acc, h) => acc + h.orderCount, 0);
      const percentage = Math.round((revenue / totalRev) * 100);
      return {
        ...s,
        revenue,
        orders,
        percentage
      };
    });
  }, [metrics]);

  // Custom Chart Tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (!active || !payload || !payload.length) return null;
    const data = payload[0].payload;

    return (
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-3.5 shadow-2xl space-y-2 min-w-[200px]`}>
        <div className="flex items-center justify-between border-b border-zinc-500/20 pb-1.5">
          <div className="flex items-center space-x-1.5">
            <Clock className="w-3.5 h-3.5 text-amber-500" />
            <span className={`text-xs font-black font-mono ${classes.textPrimary}`}>{data.range}</span>
          </div>
          {data.revenue > 0 && peakHour?.hour === data.hour && (
            <span className="text-[9px] font-black uppercase px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-400 border border-amber-500/30 flex items-center gap-1">
              <Flame className="w-2.5 h-2.5" /> Pico
            </span>
          )}
        </div>

        <div className="space-y-1 text-xs">
          <div className="flex justify-between items-center">
            <span className={classes.textMuted}>Facturación:</span>
            <span className="font-mono font-black text-amber-500">{formatPrice(data.revenue)}</span>
          </div>
          <div className="flex justify-between items-center">
            <span className={classes.textMuted}>Comandas:</span>
            <span className={`font-mono font-bold ${classes.textPrimary}`}>{data.orderCount} pedidos</span>
          </div>
          {data.orderCount > 0 && (
            <div className="flex justify-between items-center pt-1 border-t border-zinc-500/10 text-[11px]">
              <span className={classes.textMuted}>Ticket prom:</span>
              <span className={`font-mono ${classes.textSecondary}`}>{formatPrice(data.avgTicket)}</span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Top Controls: Date Selector & Header */}
      <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 flex flex-wrap items-center justify-between gap-4`}>
        <div className="space-y-1">
          <div className="flex items-center space-x-2">
            <BarChart3 className="w-4 h-4 text-amber-500" />
            <h2 className={`text-sm font-black uppercase ${classes.textPrimary} tracking-widest`}>
              Métricas & Facturación del Día
            </h2>
          </div>
          <p className={`text-xs ${classes.textMuted} font-medium`}>
            Estadísticas calculadas en tiempo real de pedidos entregados y comensales atendidos.
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          {/* Quick filter pills */}
          <div className="flex items-center space-x-1.5">
            <button
              type="button"
              onClick={() => onDayChange(todayStr)}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider ${classes.radiusBtn} transition cursor-pointer border ${
                metricsDay === todayStr
                  ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-sm'
                  : `${classes.inputBg} ${classes.borderCard} ${classes.textMuted} hover:${classes.textPrimary}`
              }`}
            >
              Hoy
            </button>
            <button
              type="button"
              onClick={() => onDayChange(yesterdayStr)}
              className={`px-3 py-1.5 text-xs font-black uppercase tracking-wider ${classes.radiusBtn} transition cursor-pointer border ${
                metricsDay === yesterdayStr
                  ? 'bg-amber-500 text-zinc-950 border-amber-500 shadow-sm'
                  : `${classes.inputBg} ${classes.borderCard} ${classes.textMuted} hover:${classes.textPrimary}`
              }`}
            >
              Ayer
            </button>
          </div>

          <div className="flex items-center space-x-2">
            <Calendar className={`w-3.5 h-3.5 ${classes.textMuted}`} />
            <input
              id="metrics-day"
              type="date"
              value={metricsDay}
              onChange={(e) => onDayChange(e.target.value)}
              className={`px-3 py-1.5 ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn} ${classes.textPrimary} text-xs font-mono font-bold focus:outline-none focus:border-amber-500`}
            />
          </div>
        </div>
      </div>

      {loading && !metrics ? (
        <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-12 text-center space-y-3`}>
          <div className="inline-block w-7 h-7 border-2 border-amber-500 border-t-transparent rounded-full animate-spin" />
          <p className={`text-xs ${classes.textMuted} font-mono uppercase tracking-widest`}>Cargando analíticas del establecimiento…</p>
        </div>
      ) : metrics && (
        <>
          {/* Key Metric Highlights (Cards) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue */}
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-2 relative overflow-hidden`}>
              <div className="flex justify-between items-start">
                <span className={`text-[10px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>
                  Recaudación Total
                </span>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <DollarSign className="w-4 h-4" />
                </div>
              </div>
              <span id="metrics-revenue" className="text-2xl sm:text-3xl font-black text-amber-500 block font-mono">
                {formatPrice(metrics.totals.totalRevenue)}
              </span>
              <div className="flex flex-wrap gap-2 pt-1">
                <div className="text-[10px] font-mono flex items-center gap-1">
                  <span className={classes.textMuted}>vs ayer:</span>
                  {metrics.comparison.vsYesterday?.pct == null ? (
                    <span className={classes.textMuted}>s/d</span>
                  ) : (
                    <span className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded ${
                      metrics.comparison.vsYesterday.pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {metrics.comparison.vsYesterday.pct >= 0 ? <TrendingUp className="w-2.5 h-2.5 mr-0.5 inline" /> : <TrendingDown className="w-2.5 h-2.5 mr-0.5 inline" />}
                      {metrics.comparison.vsYesterday.pct >= 0 ? '+' : ''}{metrics.comparison.vsYesterday.pct.toFixed(0)}%
                    </span>
                  )}
                </div>

                <div className="text-[10px] font-mono flex items-center gap-1">
                  <span className={classes.textMuted}>vs 7d:</span>
                  {metrics.comparison.vsWeekAvg?.pct == null ? (
                    <span className={classes.textMuted}>s/d</span>
                  ) : (
                    <span className={`inline-flex items-center font-bold px-1.5 py-0.5 rounded ${
                      metrics.comparison.vsWeekAvg.pct >= 0 ? 'bg-emerald-500/10 text-emerald-400' : 'bg-rose-500/10 text-rose-400'
                    }`}>
                      {metrics.comparison.vsWeekAvg.pct >= 0 ? '+' : ''}{metrics.comparison.vsWeekAvg.pct.toFixed(0)}%
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Orders */}
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-2 relative overflow-hidden`}>
              <div className="flex justify-between items-start">
                <span className={`text-[10px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>
                  Comandas Entregadas
                </span>
                <div className="p-2 rounded-lg bg-sky-500/10 text-sky-400">
                  <ShoppingBag className="w-4 h-4" />
                </div>
              </div>
              <span className={`text-2xl sm:text-3xl font-black ${classes.textPrimary} block font-mono`}>
                {metrics.totals.orderCount} <span className="text-xs font-normal text-zinc-400">pedidos</span>
              </span>
              <p className={`text-[10px] ${classes.textMuted} font-medium`}>
                {metrics.totals.orderCount > 0 ? 'Ventas cerradas con éxito' : 'Aún sin pedidos finalizados'}
              </p>
            </div>

            {/* Average Ticket */}
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-2 relative overflow-hidden`}>
              <div className="flex justify-between items-start">
                <span className={`text-[10px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>
                  Ticket Promedio
                </span>
                <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-400">
                  <Sparkles className="w-4 h-4" />
                </div>
              </div>
              <span className={`text-2xl sm:text-3xl font-black ${classes.textPrimary} block font-mono`}>
                {formatPrice(metrics.totals.averageTicket)}
              </span>
              <p className={`text-[10px] ${classes.textMuted} font-medium`}>
                Gasto promedio por cada pedido
              </p>
            </div>

            {/* Peak Hour */}
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-2 relative overflow-hidden`}>
              <div className="flex justify-between items-start">
                <span className={`text-[10px] ${classes.textMuted} font-mono font-black uppercase tracking-widest block`}>
                  Hora Pico del Día
                </span>
                <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400">
                  <Flame className="w-4 h-4" />
                </div>
              </div>
              {peakHour ? (
                <>
                  <span className="text-2xl sm:text-3xl font-black text-amber-400 block font-mono">
                    {peakHour.label}
                  </span>
                  <p className={`text-[10px] font-mono ${classes.textSecondary}`}>
                    {formatPrice(peakHour.revenue)} ({peakHour.orderCount} ped)
                  </p>
                </>
              ) : (
                <>
                  <span className={`text-2xl font-black ${classes.textMuted} block font-mono`}>
                    --:--
                  </span>
                  <p className={`text-[10px] ${classes.textMuted} font-medium`}>
                    Sin actividad registrada
                  </p>
                </>
              )}
            </div>
          </div>

          {/* MAIN REDESIGNED CHART */}
          <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-4`}>
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-zinc-500/15 pb-4">
              <div className="space-y-0.5">
                <div className="flex items-center space-x-2">
                  <BarChart3 className="w-4 h-4 text-amber-500" />
                  <h3 className={`text-xs font-black uppercase ${classes.textPrimary} tracking-wider`}>
                    Distribución Horaria (00:00 a 23:59 hs)
                  </h3>
                </div>
                <p className={`text-[11px] ${classes.textMuted}`}>
                  Monitorea los picos de afluencia y la facturación franja por franja.
                </p>
              </div>

              {/* View Mode Switcher */}
              <div className={`flex items-center p-1 ${classes.inputBg} border ${classes.borderCard} ${classes.radiusBtn}`}>
                <button
                  type="button"
                  onClick={() => setChartMode('revenue')}
                  className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider ${classes.radiusBtn} transition cursor-pointer ${
                    chartMode === 'revenue'
                      ? 'bg-amber-500 text-zinc-950 font-black shadow-sm'
                      : `${classes.textMuted} hover:${classes.textPrimary}`
                  }`}
                >
                  Facturación ($)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('orders')}
                  className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider ${classes.radiusBtn} transition cursor-pointer ${
                    chartMode === 'orders'
                      ? 'bg-sky-500 text-zinc-950 font-black shadow-sm'
                      : `${classes.textMuted} hover:${classes.textPrimary}`
                  }`}
                >
                  Pedidos (#)
                </button>
                <button
                  type="button"
                  onClick={() => setChartMode('combined')}
                  className={`px-3 py-1 text-[11px] font-black uppercase tracking-wider ${classes.radiusBtn} transition cursor-pointer ${
                    chartMode === 'combined'
                      ? 'bg-emerald-500 text-zinc-950 font-black shadow-sm'
                      : `${classes.textMuted} hover:${classes.textPrimary}`
                  }`}
                >
                  Tendencia (Área)
                </button>
              </div>
            </div>

            {/* Recharts Canvas */}
            <div className="w-full h-72 pt-2">
              <ResponsiveContainer width="100%" height="100%">
                {chartMode === 'combined' ? (
                  <AreaChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revenueGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="#f59e0b" stopOpacity={0.0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#e4e4e7'} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={{ stroke: isDark ? '#3f3f46' : '#d4d4d8' }}
                      tickLine={false}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fill: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => (val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${val}`)}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Area
                      type="monotone"
                      dataKey="revenue"
                      name="Facturación"
                      stroke="#f59e0b"
                      strokeWidth={2.5}
                      fillOpacity={1}
                      fill="url(#revenueGrad)"
                    />
                  </AreaChart>
                ) : (
                  <BarChart data={chartData} margin={{ top: 10, right: 10, left: -10, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke={isDark ? '#27272a' : '#e4e4e7'} vertical={false} />
                    <XAxis
                      dataKey="label"
                      tick={{ fill: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={{ stroke: isDark ? '#3f3f46' : '#d4d4d8' }}
                      tickLine={false}
                      interval={2}
                    />
                    <YAxis
                      tick={{ fill: isDark ? '#71717a' : '#a1a1aa', fontSize: 10, fontFamily: 'monospace' }}
                      axisLine={false}
                      tickLine={false}
                      tickFormatter={(val) => {
                        if (chartMode === 'orders') return String(val);
                        return val >= 1000 ? `$${Math.round(val / 1000)}k` : `$${val}`;
                      }}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    <Bar
                      dataKey={chartMode === 'revenue' ? 'revenue' : 'orderCount'}
                      name={chartMode === 'revenue' ? 'Facturación' : 'Pedidos'}
                      radius={[4, 4, 0, 0]}
                    >
                      {chartData.map((entry, index) => {
                        const isPeak = peakHour && entry.hour === peakHour.hour && entry.revenue > 0;
                        let barColor = chartMode === 'revenue' ? '#f59e0b' : '#38bdf8';
                        if (isPeak) barColor = '#fbbf24';
                        if (entry.revenue === 0 && entry.orderCount === 0) barColor = isDark ? '#27272a' : '#e4e4e7';

                        return <Cell key={`cell-${index}`} fill={barColor} fillOpacity={entry.isZero ? 0.4 : 0.9} />;
                      })}
                    </Bar>
                  </BarChart>
                )}
              </ResponsiveContainer>
            </div>

            {/* Visual Legend & Time Helper */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-zinc-500/10 text-xs">
              <div className="flex items-center space-x-4">
                <div className="flex items-center space-x-1.5">
                  <span className="w-2.5 h-2.5 rounded-sm bg-amber-500 inline-block" />
                  <span className={classes.textMuted}>Ventas del período</span>
                </div>
                {peakHour && (
                  <div className="flex items-center space-x-1.5">
                    <span className="w-2.5 h-2.5 rounded-sm bg-amber-300 inline-block" />
                    <span className="text-amber-400 font-bold">Pico de consumo ({peakHour.label})</span>
                  </div>
                )}
              </div>
              <span className={`text-[11px] font-mono ${classes.textMuted}`}>
                Pasa el cursor o toca cada barra para ver los detalles exactos
              </span>
            </div>
          </div>

          {/* TIME SLOTS SUMMARY (Franjas Horarias) */}
          <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} p-5 space-y-4`}>
            <div className="flex items-center justify-between">
              <div className="space-y-0.5">
                <h3 className={`text-xs font-black uppercase ${classes.textPrimary} tracking-wider`}>
                  Rendimiento por Turnos / Franjas
                </h3>
                <p className={`text-[11px] ${classes.textMuted}`}>
                  Distribución de los ingresos a lo largo de las distintas franjas de servicio.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
              {timeSlots.filter(s => s.id !== 'night' || s.revenue > 0).map((slot) => (
                <div
                  key={slot.id}
                  className={`p-3.5 ${classes.inputBg} border ${
                    slot.percentage > 40 ? 'border-amber-500/40 ring-1 ring-amber-500/20' : classes.borderCard
                  } ${classes.radiusCard} space-y-2`}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm">{slot.icon}</span>
                    <span className="text-[10px] font-mono font-bold px-2 py-0.5 rounded bg-zinc-500/10 text-zinc-400 border border-zinc-500/20">
                      {slot.percentage}% del total
                    </span>
                  </div>

                  <div>
                    <h4 className={`text-xs font-black ${classes.textPrimary}`}>{slot.name}</h4>
                    <span className={`text-[10px] font-mono ${classes.textMuted}`}>{slot.range}</span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-zinc-700/20 rounded-full h-1.5 overflow-hidden">
                    <div
                      className="bg-amber-500 h-1.5 rounded-full transition-all duration-500"
                      style={{ width: `${Math.min(slot.percentage, 100)}%` }}
                    />
                  </div>

                  <div className="flex items-center justify-between pt-1 text-xs">
                    <span className="font-mono font-black text-amber-500">{formatPrice(slot.revenue)}</span>
                    <span className={`text-[10px] font-mono ${classes.textMuted}`}>{slot.orders} ped</span>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* TOP PRODUCTS & BY TABLE */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            {/* Top Products */}
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden flex flex-col justify-between`}>
              <div>
                <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} flex items-center justify-between`}>
                  <div className="flex items-center space-x-2">
                    <UtensilsCrossed className="w-3.5 h-3.5 text-amber-500" />
                    <span className={`font-mono text-xs ${classes.textPrimary} tracking-wider uppercase font-black`}>
                      Productos Más Vendidos
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono ${classes.textMuted}`}>Top 8 items</span>
                </div>

                {metrics.topProducts.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className={`text-xs ${classes.textMuted}`}>Sin ventas registradas en la fecha seleccionada.</p>
                  </div>
                ) : (
                  <div className={`divide-y ${classes.borderCard}`}>
                    {metrics.topProducts.slice(0, 8).map((p, idx) => {
                      const maxUnits = metrics.topProducts[0]?.units || 1;
                      const barWidth = Math.max((p.units / maxUnits) * 100, 5);

                      return (
                        <div key={p.menuItemId} className="p-3.5 hover:bg-zinc-500/5 transition space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2 min-w-0">
                              <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black font-mono ${
                                idx === 0 ? 'bg-amber-500 text-zinc-950' : 'bg-zinc-500/10 text-zinc-400'
                              }`}>
                                {idx + 1}
                              </span>
                              <span className={`text-xs font-bold ${classes.textPrimary} truncate`}>{p.name}</span>
                            </div>
                            <div className="text-right shrink-0">
                              <span className="font-mono text-xs font-black text-amber-500">{formatPrice(p.revenue)}</span>
                              <span className={`text-[10px] font-mono ${classes.textMuted} block`}>{p.units} unidades</span>
                            </div>
                          </div>

                          {/* Relative unit distribution bar */}
                          <div className="w-full bg-zinc-700/15 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-amber-500/70 h-1 rounded-full"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>

            {/* By Table */}
            <div className={`${classes.bgCard} border ${classes.borderCard} ${classes.radiusCard} overflow-hidden flex flex-col justify-between`}>
              <div>
                <div className={`p-4 ${classes.bgHeader} border-b ${classes.borderCard} flex items-center justify-between`}>
                  <div className="flex items-center space-x-2">
                    <Layers className="w-3.5 h-3.5 text-sky-400" />
                    <span className={`font-mono text-xs ${classes.textPrimary} tracking-wider uppercase font-black`}>
                      Facturación por Mesa
                    </span>
                  </div>
                  <span className={`text-[10px] font-mono ${classes.textMuted}`}>Consumo discriminado</span>
                </div>

                {metrics.byTable.length === 0 ? (
                  <div className="p-8 text-center space-y-2">
                    <p className={`text-xs ${classes.textMuted}`}>Sin ventas registradas en las mesas.</p>
                  </div>
                ) : (
                  <div className={`divide-y ${classes.borderCard}`}>
                    {metrics.byTable.map((t, idx) => {
                      const maxRev = metrics.byTable[0]?.revenue || 1;
                      const barWidth = Math.max((t.revenue / maxRev) * 100, 5);

                      return (
                        <div key={t.tableId} className="p-3.5 hover:bg-zinc-500/5 transition space-y-1.5">
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center space-x-2">
                              <span className={`w-5 h-5 rounded flex items-center justify-center text-[10px] font-black font-mono bg-zinc-500/10 text-zinc-400`}>
                                {idx + 1}
                              </span>
                              <div>
                                <span className={`text-xs font-bold ${classes.textPrimary}`}>{t.tableName}</span>
                                <span className={`text-[10px] font-mono ${classes.textMuted} ml-1.5`}>
                                  ({t.orderCount} {t.orderCount === 1 ? 'pedido' : 'pedidos'})
                                </span>
                              </div>
                            </div>
                            <span className="font-mono text-xs font-black text-amber-500">{formatPrice(t.revenue)}</span>
                          </div>

                          {/* Relative revenue distribution bar */}
                          <div className="w-full bg-zinc-700/15 rounded-full h-1 overflow-hidden">
                            <div
                              className="bg-sky-500/70 h-1 rounded-full"
                              style={{ width: `${barWidth}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
