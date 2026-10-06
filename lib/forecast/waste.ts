import { addDays, daysBetween } from "../dates";
import type { Lot } from "./expiry";
import { mulberry32 } from "./uncertainty";

export type PolicyResult = {
  wasted: number; // per week, incl. unavoidable trimmings/leftovers
  unmet: number; // demand that couldn't be served (stock-outs), per week
  used: number; // per week
};

export type PolicyArgs = {
  lots: Lot[];
  demandOn: (day: string) => number;
  today: string;
  orderEveryDays: number;
  shelfLifeDays: number;
  /** Delivery size, given the lots still on the shelf (not yet expired, not used up). */
  orderQty: (lots: Lot[], day: string) => number;
  unavoidableRate?: number;
  weeks?: number;
  /** Days simulated before the measured window (not counted) so the shelf reaches a normal state. */
  warmupDays?: number;
};

// After the window, keep simulating (deliveries continue) until stock bought
// inside the window has been used or expired, so its waste still counts.
// Long-life stock still unused after this many extra days is assumed used.
const MAX_TAIL_DAYS = 60;

/**
 * Simulate an ordering policy: a delivery every `orderEveryDays` (sized by
 * `orderQty`), earliest-expiry-first usage against `demandOn`, and whatever is
 * left at expiry counted as waste. Measures `weeks` from `today`: usage and
 * stock-outs inside the window, and the eventual waste of every lot that was
 * on the shelf at the start (when there is no warm-up) or delivered inside it.
 * Unavoidable waste (trimmings, plate leftovers) is added as a share of usage.
 */
export function simulatePolicy({
  lots,
  demandOn,
  today,
  orderEveryDays,
  shelfLifeDays,
  orderQty,
  unavoidableRate = 0,
  weeks = 4,
  warmupDays = 0,
}: PolicyArgs): PolicyResult {
  const window = weeks * 7;
  type SimLot = { id: number; left: number; expiresAt: string; measured: boolean };
  let nextId = 1;
  const stock: SimLot[] = lots
    .filter((l) => l.remaining > 0)
    .map((l) => ({ id: nextId++, left: l.remaining, expiresAt: l.expiresAt, measured: warmupDays === 0 }));
  let wasted = 0;
  let used = 0;
  let unmet = 0;
  const discard = (lot: SimLot) => {
    if (lot.measured) wasted += lot.left;
    lot.left = 0;
  };

  const startDay = addDays(today, -warmupDays);
  for (const lot of stock) if (lot.expiresAt < startDay) discard(lot); // already past expiry

  const lastDay = window + Math.min(shelfLifeDays, MAX_TAIL_DAYS);
  for (let i = -warmupDays; i < lastDay; i++) {
    const inWindow = i >= 0 && i < window;
    if (i >= window && !stock.some((l) => l.measured && l.left > 0)) break;
    const day = addDays(today, i);

    if (((i % orderEveryDays) + orderEveryDays) % orderEveryDays === 0) {
      const onShelf = stock.filter((l) => l.left > 0).map((l) => ({ id: l.id, remaining: l.left, expiresAt: l.expiresAt }));
      const qty = orderQty(onShelf, day);
      if (qty > 0) stock.push({ id: nextId++, left: qty, expiresAt: addDays(day, shelfLifeDays), measured: inWindow });
    }

    stock.sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
    let demand = demandOn(day);
    for (const lot of stock) {
      if (demand <= 0) break;
      const take = Math.min(lot.left, demand);
      lot.left -= take;
      demand -= take;
      if (inWindow) used += take;
    }
    if (inWindow) unmet += Math.max(0, demand);
    for (const lot of stock) if (lot.expiresAt === day && lot.left > 0) discard(lot);
  }

  return { wasted: (wasted + used * unavoidableRate) / weeks, unmet: unmet / weeks, used: used / weeks };
}

/**
 * The lots left on the shelf after `days` days of point-forecast demand from
 * `from` (earliest expiry first), without those that expired along the way.
 */
export function projectLots(lots: Lot[], pointOn: (day: string) => number, from: string, days: number): Lot[] {
  const state = lots
    .filter((l) => l.remaining > 0 && l.expiresAt >= from)
    .map((l) => ({ ...l }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    let demand = pointOn(day);
    for (const lot of state) {
      if (demand <= 0) break;
      if (lot.remaining <= 0 || lot.expiresAt < day) continue;
      const take = Math.min(lot.remaining, demand);
      lot.remaining -= take;
      demand -= take;
    }
  }
  const end = addDays(from, days);
  return state.filter((l) => l.remaining > 0 && l.expiresAt >= end);
}

/**
 * Stock that can still serve demand from `from` onwards: everything on the
 * shelf minus what is projected (point forecast, earliest expiry first) to
 * expire unused within the next `days`. Stock that outlives the window counts
 * in full: it is still there for the following days.
 */
export function usableStock(lots: Lot[], pointOn: (day: string) => number, from: string, days: number): number {
  const state = lots
    .filter((l) => l.remaining > 0 && l.expiresAt >= from)
    .map((l) => ({ left: l.remaining, expiresAt: l.expiresAt }))
    .sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  let total = state.reduce((a, l) => a + l.left, 0);
  for (let i = 0; i < days; i++) {
    const day = addDays(from, i);
    let demand = pointOn(day);
    for (const lot of state) {
      if (demand <= 0) break;
      if (lot.left <= 0 || lot.expiresAt < day) continue;
      const take = Math.min(lot.left, demand);
      lot.left -= take;
      demand -= take;
    }
    for (const lot of state) {
      if (lot.expiresAt === day && lot.left > 0) {
        total -= lot.left; // would expire before it can be used
        lot.left = 0;
      }
    }
  }
  return total;
}

/**
 * Average of simulatePolicy over `runs` demand futures: each day's demand is
 * the point forecast x `scale` x a random backtest error ratio. The same seed
 * gives every policy the same futures, so policies are compared fairly.
 */
export function expectedPolicy(
  args: Omit<PolicyArgs, "demandOn"> & { pointOn: (day: string) => number },
  ratios: number[],
  { runs = 200, seed = 1, scale = 1 } = {},
): PolicyResult {
  const { pointOn, ...rest } = args;
  const warmup = rest.warmupDays ?? 0;
  const span = warmup + (rest.weeks ?? 4) * 7 + Math.min(rest.shelfLifeDays, MAX_TAIL_DAYS);
  const rng = mulberry32(seed);
  const total = { wasted: 0, unmet: 0, used: 0 };
  for (let r = 0; r < runs; r++) {
    const draw = Array.from({ length: span }, () => ratios[Math.floor(rng() * ratios.length)]);
    const res = simulatePolicy({
      ...rest,
      demandOn: (day) => pointOn(day) * scale * (draw[daysBetween(rest.today, day) + warmup] ?? 1),
    });
    total.wasted += res.wasted;
    total.unmet += res.unmet;
    total.used += res.used;
  }
  return { wasted: total.wasted / runs, unmet: total.unmet / runs, used: total.used / runs };
}
