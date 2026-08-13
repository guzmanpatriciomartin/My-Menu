// Sales aggregation (ADR-005). Pure functions only — no I/O, no Firestore, no clock
// reads except where a `now` is passed in. Shared by the metrics panel, the cash-close
// preview and the cash close itself, so the money arithmetic lives in exactly one place.

import {
  CashCloseTotals,
  ComparisonPoint,
  HourLine,
  MetricsComparison,
  Order,
  ProductLine,
  TableLine,
} from '../types';
import { venueHour } from './time';

// Only delivered orders count as revenue: anything still in the pipeline was not served,
// and cancelled orders were never charged.
export const REVENUE_STATUS = 'Entregado';

export function isRevenueOrder(order: Order): boolean {
  return order.status === REVENUE_STATUS;
}

// Line prices are the ones the server froze from the catalog when the order was created
// (ALTO-2). Never re-price from the current catalog: an item whose price changed later
// must not rewrite the history of what was actually charged.
export function orderRevenue(order: Order): number {
  return order.items.reduce((sum, item) => sum + item.price * item.quantity, 0);
}

// Time anchor of a sale. Orders delivered before `deliveredAt` existed fall back to
// updatedAt, which is the closest approximation available for that historical data.
export function saleTimestamp(order: Order): string {
  return order.deliveredAt ?? order.updatedAt;
}

export function deliveredInRange(orders: Order[], fromIso: string, toIso: string): Order[] {
  const from = new Date(fromIso).getTime();
  const to = new Date(toIso).getTime();
  return orders.filter((order) => {
    if (!isRevenueOrder(order)) return false;
    const at = new Date(saleTimestamp(order)).getTime();
    return !Number.isNaN(at) && at >= from && at < to;
  });
}

export function computeTotals(orders: Order[]): CashCloseTotals {
  const totalRevenue = orders.reduce((sum, order) => sum + orderRevenue(order), 0);
  const orderCount = orders.length;
  return {
    orderCount,
    totalRevenue,
    averageTicket: orderCount === 0 ? 0 : totalRevenue / orderCount,
  };
}

export function computeTopProducts(orders: Order[]): ProductLine[] {
  const byProduct = new Map<string, ProductLine>();

  for (const order of orders) {
    for (const item of order.items) {
      const current = byProduct.get(item.menuItemId);
      const revenue = item.price * item.quantity;
      if (current) {
        current.units += item.quantity;
        current.revenue += revenue;
      } else {
        byProduct.set(item.menuItemId, {
          menuItemId: item.menuItemId,
          // The name stored on the line is the one charged, which may differ from the
          // catalog if the item was renamed later. That is the correct historical label.
          name: item.name,
          units: item.quantity,
          revenue,
        });
      }
    }
  }

  return [...byProduct.values()].sort(
    (a, b) => b.units - a.units || b.revenue - a.revenue
  );
}

export function computeByTable(orders: Order[]): TableLine[] {
  const byTable = new Map<string, TableLine>();

  for (const order of orders) {
    const revenue = orderRevenue(order);
    const current = byTable.get(order.tableId);
    if (current) {
      current.orderCount += 1;
      current.revenue += revenue;
    } else {
      byTable.set(order.tableId, {
        tableId: order.tableId,
        tableName: order.tableName,
        orderCount: 1,
        revenue,
      });
    }
  }

  return [...byTable.values()].sort((a, b) => b.revenue - a.revenue);
}

// Always returns the full 24 buckets so the chart has a stable x axis.
export function computeByHour(orders: Order[]): HourLine[] {
  const buckets: HourLine[] = Array.from({ length: 24 }, (_, hour) => ({
    hour,
    orderCount: 0,
    revenue: 0,
  }));

  for (const order of orders) {
    const bucket = buckets[venueHour(saleTimestamp(order))];
    bucket.orderCount += 1;
    bucket.revenue += orderRevenue(order);
  }

  return buckets;
}

// Percentage change against a baseline. null when the baseline is 0: "infinite growth"
// is not a useful number to show, and the UI renders it as "sin comparación".
function comparisonPoint(baselineRevenue: number, currentRevenue: number): ComparisonPoint {
  return {
    revenue: baselineRevenue,
    pct:
      baselineRevenue === 0
        ? null
        : ((currentRevenue - baselineRevenue) / baselineRevenue) * 100,
  };
}

/**
 * Day-over-day comparison.
 *
 * `elapsedMs` makes the comparison fair: for the day in progress we only count the
 * baseline days up to the same point in the day. Comparing today-at-14:00 against
 * yesterday's full total would make every day look like a decline until closing time.
 * For a past day, pass the full day length to compare complete totals.
 *
 * Baselines with no data yield null rather than 0, so the UI can distinguish "sold
 * nothing" from "no history to compare against".
 */
export function computeComparison(
  currentRevenue: number,
  previousDayBounds: { from: string; to: string } | null,
  weekDayBounds: { from: string; to: string }[],
  allOrders: Order[],
  elapsedMs: number
): MetricsComparison {
  const revenueUpTo = (bounds: { from: string; to: string }): number | null => {
    const from = new Date(bounds.from).getTime();
    const cappedTo = Math.min(from + elapsedMs, new Date(bounds.to).getTime());
    const window = deliveredInRange(allOrders, bounds.from, new Date(cappedTo).toISOString());
    // No orders at all in that window means we have no evidence the venue was even
    // operating; treat it as "no data" instead of a real zero.
    return window.length === 0 ? null : computeTotals(window).totalRevenue;
  };

  const yesterdayRevenue = previousDayBounds ? revenueUpTo(previousDayBounds) : null;

  const weekSamples = weekDayBounds
    .map(revenueUpTo)
    .filter((value): value is number => value !== null);

  return {
    vsYesterday:
      yesterdayRevenue === null ? null : comparisonPoint(yesterdayRevenue, currentRevenue),
    vsWeekAvg:
      weekSamples.length === 0
        ? null
        : comparisonPoint(
            weekSamples.reduce((sum, value) => sum + value, 0) / weekSamples.length,
            currentRevenue
          ),
  };
}
