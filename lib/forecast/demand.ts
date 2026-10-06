import { addDays } from "../dates";

// Hackathon model: day-of-week moving average with a holiday/festive
// multiplier. With more history this would be swapped for a proper
// time-series model (e.g. Prophet) behind the same function signature.

export type DailyQty = Record<string, number>; // day key -> qty
export type DayForecast = { date: string; qty: number };

type Options = {
  weeks?: number;
  multiplier?: (day: string) => number;
};

/**
 * Forecast usage for `days` days starting at `start`. Each day is the mean of
 * the same weekday over the previous `weeks` weeks, with past holiday effects
 * removed and the target day's holiday effect applied.
 */
export function forecastDemand(
  history: DailyQty,
  start: string,
  days: number,
  { weeks = 4, multiplier = () => 1 }: Options = {},
): DayForecast[] {
  const out: DayForecast[] = [];
  for (let i = 0; i < days; i++) {
    const date = addDays(start, i);
    const samples: number[] = [];
    for (let k = 1; samples.length < weeks && k <= weeks + 4; k++) {
      const past = addDays(date, -7 * k);
      if (past >= start) continue; // only learn from history
      if (!(past in history)) continue;
      samples.push(history[past] / multiplier(past));
    }
    const baseline = samples.length ? samples.reduce((a, b) => a + b, 0) / samples.length : 0;
    out.push({ date, qty: baseline * multiplier(date) });
  }
  return out;
}

export function sumQty(f: DayForecast[]): number {
  return f.reduce((a, d) => a + d.qty, 0);
}

/** Forecast need plus a safety buffer, minus usable stock, rounded up to pack size. */
export function recommendOrder(
  forecastQty: number,
  stockOnHand: number,
  packSize: number,
  buffer = 0.1,
): number {
  const need = forecastQty * (1 + buffer) - stockOnHand;
  if (need <= 0) return 0;
  return Math.ceil(need / packSize - 1e-9) * packSize;
}
