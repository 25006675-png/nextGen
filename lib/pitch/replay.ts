// Helpers for the pitch backtests: read the simulated history at any past
// day, replay an ordering policy against the TRUE demand that happened, and
// score forecasts. Pure functions (no database), so they are unit-tested.

import { addDays, daysBetween, parseDay } from "../dates";
import type { Lot } from "../forecast/expiry";
import { simulatePolicy } from "../forecast/waste";
import type { SampleItem, SampleLot } from "../demo-data";

export const WEEKS_PER_MONTH = 52.18 / 12;

const round2 = (n: number) => Math.round(n * 100) / 100;

/** Qty of a lot left at the end of `day` (undefined if not bought yet). */
export function lotLeftAt(lot: SampleLot, day: string): number | undefined {
  const k = daysBetween(lot.purchasedAt, day);
  if (k < 0) return undefined;
  if (k < lot.trail.length) return lot.trail[k];
  return lot.expiresAt < day ? 0 : lot.remaining;
}

/** Lots on the shelf at the start of `day`, as the app would have seen them (ids = position + 1). */
export function shelfAt(item: SampleItem, day: string): Lot[] {
  const prev = addDays(day, -1);
  return item.lots.flatMap((lot, i) => {
    if (lot.purchasedAt >= day || lot.expiresAt < day) return [];
    const left = round2(lotLeftAt(lot, prev) ?? 0);
    return left > 0 ? [{ id: i + 1, remaining: left, expiresAt: lot.expiresAt }] : [];
  });
}

/** Recorded sales in the `days` before `day` (only data the shop had that morning). */
export function salesBefore(item: SampleItem, day: string, days = 63): { date: Date; qty: number }[] {
  const from = addDays(day, -days);
  return item.usages.filter((u) => u.day < day && u.day >= from).map((u) => ({ date: parseDay(u.day), qty: u.qty }));
}

/** The shop's last real delivery on or before `day`. */
export function lastDeliveryOnOrBefore(item: SampleItem, day: string): string | undefined {
  return item.deliveryDays.filter((d) => d <= day).at(-1);
}

export type Replay = { wasted: number; unmet: number; used: number }; // item units, totals over the window

/**
 * Replay a policy against the TRUE demand that happened. It starts
 * `warmupDays` before `start` from the real shelf that morning (a multiple of
 * the delivery cycle, so deliveries keep their real days), letting each policy
 * settle into its own normal stock level; then measures the `weeks` from
 * `start`: run-outs, and the eventual waste of every delivery made in them
 * (even if it expires after the window, so the demand history must cover that).
 */
export function replayPolicy(
  item: SampleItem,
  start: string,
  orderQty: (lots: Lot[], day: string) => number,
  { weeks = 4, warmupDays = 0 } = {},
): Replay {
  const r = simulatePolicy({
    lots: shelfAt(item, addDays(start, -warmupDays)),
    demandOn: (day) => {
      const d = item.demand[day];
      if (d === undefined) throw new Error(`${item.name}: no demand data for ${day}; pick an earlier window`);
      return d;
    },
    today: start,
    orderEveryDays: item.orderEveryDays,
    shelfLifeDays: item.shelfLifeDays,
    orderQty,
    weeks,
    warmupDays,
  });
  return { wasted: r.wasted * weeks, unmet: r.unmet * weeks, used: r.used * weeks };
}

/** Whole delivery cycles covering at least a week: enough for the shelf to settle. */
export function warmupFor(orderEveryDays: number): number {
  return Math.ceil(7 / orderEveryDays) * orderEveryDays;
}

/** Weighted absolute % error: sum of w x |actual - forecast| over sum of w x actual. */
export function wape(rows: { actual: number; forecast: number; weight?: number }[]): number {
  const den = rows.reduce((a, r) => a + (r.weight ?? 1) * r.actual, 0);
  return den > 0 ? rows.reduce((a, r) => a + (r.weight ?? 1) * Math.abs(r.actual - r.forecast), 0) / den : 0;
}

/** Mean squared gap between predicted probability and what happened (0 = perfect). */
export function brier(preds: { p: number; y: boolean }[]): number {
  if (preds.length === 0) return 0;
  return preds.reduce((a, x) => a + (x.p - (x.y ? 1 : 0)) ** 2, 0) / preds.length;
}

/** Chance a random binned case got a higher risk than a random kept one (0.5 = no skill, 1 = perfect). */
export function auc(preds: { p: number; y: boolean }[]): number {
  const pos = preds.filter((x) => x.y).map((x) => x.p);
  const neg = preds.filter((x) => !x.y).map((x) => x.p);
  if (pos.length === 0 || neg.length === 0) return 0.5;
  let wins = 0;
  for (const a of pos) for (const b of neg) wins += a > b ? 1 : a === b ? 0.5 : 0;
  return wins / (pos.length * neg.length);
}

export type CalibrationBin = { from: number; to: number; count: number; predicted: number; actual: number };

/** Group predictions by probability; compare the mean prediction with how often it happened. */
export function calibration(preds: { p: number; y: boolean }[], edges = [0, 0.1, 0.3, 0.5, 0.7, 0.9, 1]): CalibrationBin[] {
  return edges.slice(0, -1).flatMap((from, i) => {
    const to = edges[i + 1];
    const last = i === edges.length - 2;
    const inBin = preds.filter((x) => x.p >= from && (x.p < to || (last && x.p <= to)));
    if (inBin.length === 0) return [];
    return [
      {
        from,
        to,
        count: inBin.length,
        predicted: inBin.reduce((a, x) => a + x.p, 0) / inBin.length,
        actual: inBin.filter((x) => x.y).length / inBin.length,
      },
    ];
  });
}
