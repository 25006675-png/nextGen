// Dates are handled as local "YYYY-MM-DD" day keys to avoid timezone drift.

export function dayKey(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Local noon on the given day, safe to store and compare. */
export function parseDay(key: string): Date {
  const [y, m, d] = key.split("-").map(Number);
  return new Date(y, m - 1, d, 12);
}

// The simulations call these hundreds of thousands of times over a few
// hundred distinct days, so results are cached (Date parsing dominates).
const cache = new Map<string, string | number>();
function memo<T extends string | number>(key: string, compute: () => T): T {
  const hit = cache.get(key);
  if (hit !== undefined) return hit as T;
  if (cache.size > 50_000) cache.clear();
  const value = compute();
  cache.set(key, value);
  return value;
}

export function addDays(key: string, n: number): string {
  return memo(`a${key}|${n}`, () => {
    const d = parseDay(key);
    d.setDate(d.getDate() + n);
    return dayKey(d);
  });
}

export function dayOfWeek(key: string): number {
  return memo(`w${key}`, () => parseDay(key).getDay());
}

export function daysBetween(from: string, to: string): number {
  return memo(`b${from}|${to}`, () => Math.round((parseDay(to).getTime() - parseDay(from).getTime()) / 86_400_000));
}

export function todayKey(): string {
  return dayKey(new Date());
}

export function shortDay(key: string): string {
  return parseDay(key).toLocaleDateString("en-MY", { weekday: "short" });
}

export function shortDate(key: string): string {
  return parseDay(key).toLocaleDateString("en-MY", { day: "numeric", month: "short" });
}

/** Local midnight at the start of the given day (for timestamp range filters). */
export function dayStart(key: string): Date {
  const d = parseDay(key);
  d.setHours(0, 0, 0, 0);
  return d;
}
