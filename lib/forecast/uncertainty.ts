import { addDays } from "../dates";
import { forecastDemand, type DailyQty } from "./demand";

// How wrong is the moving average, item by item? We replay the last few
// weeks ("backtest"): forecast each past day using only data before it, and
// keep actual / forecast. Those ratios are the item's error distribution,
// reused by the Monte Carlo simulations and to size safety buffers.

/** Small seeded PRNG so simulations are stable between page loads. */
export function mulberry32(seed: number): () => number {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export type BacktestPoint = { date: string; actual: number; forecast: number };
export type Backtest = {
  ratios: number[]; // actual / forecast per backtested day
  error: number; // weighted absolute % error (WAPE)
  points: BacktestPoint[];
};

// Used when an item has too little history to learn its own errors (±20%).
const DEFAULT_RATIOS = [0.8, 0.9, 1, 1.1, 1.2];
const MIN_SAMPLES = 7;

export function backtest(
  history: DailyQty,
  today: string,
  { days = 28, weeks = 4, multiplier = (_d: string): number => 1 }: { days?: number; weeks?: number; multiplier?: (d: string) => number } = {},
): Backtest {
  const points: BacktestPoint[] = [];
  for (let i = days; i >= 1; i--) {
    const date = addDays(today, -i);
    if (!(date in history)) continue;
    const [f] = forecastDemand(history, date, 1, { weeks, multiplier });
    if (f.qty <= 0) continue;
    points.push({ date, actual: history[date], forecast: f.qty });
  }
  const totalForecast = points.reduce((a, p) => a + p.forecast, 0);
  const error = totalForecast > 0 ? points.reduce((a, p) => a + Math.abs(p.actual - p.forecast), 0) / totalForecast : 0;
  const ratios = points.map((p) => p.actual / p.forecast);
  return { ratios: ratios.length >= MIN_SAMPLES ? ratios : DEFAULT_RATIOS, error, points };
}

/** q-quantile (0..1) with linear interpolation. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) return 0;
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * Math.min(1, Math.max(0, q));
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return s[lo] + (s[hi] - s[lo]) * (pos - lo);
}

/**
 * Newsvendor service level: how often the order should fully cover demand.
 * Running out costs `lostSaleMult` x ingredient cost in lost profit; buying
 * too much costs the ingredient only if the excess spoils before the next
 * delivery uses it (likely when shelf life is short vs the delivery cycle).
 */
export function serviceLevel(shelfLifeDays: number, orderEveryDays: number, lostSaleMult: number): number {
  const over = Math.min(1, orderEveryDays / shelfLifeDays);
  const level = lostSaleMult / (lostSaleMult + over);
  return Math.min(0.98, Math.max(0.5, level));
}

/**
 * Multiplier on the point forecast for a `coverDays` window so that it is
 * enough in `level` of simulated windows (each day's error drawn from the
 * item's backtest ratios).
 */
export function coverFactor(
  ratios: number[],
  coverDays: number,
  level: number,
  rng: () => number,
  samples = 2000,
): number {
  const means: number[] = [];
  for (let s = 0; s < samples; s++) {
    let sum = 0;
    for (let d = 0; d < coverDays; d++) sum += ratios[Math.floor(rng() * ratios.length)];
    means.push(sum / coverDays);
  }
  return quantile(means, level);
}
