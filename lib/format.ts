import { addDays, shortDate, shortDay } from "./dates";

export function rm(n: number, decimals = 0): string {
  return `RM${n.toLocaleString("en-MY", { minimumFractionDigits: decimals, maximumFractionDigits: decimals })}`;
}

const PLURAL: Record<string, string> = { loaf: "loaves", can: "cans" };

export function qty(n: number, unit: string): string {
  const whole = unit === "pcs" || unit === "loaf" || unit === "can";
  const value = whole ? Math.round(n) : Math.round(n * 10) / 10;
  const plural = value === 1 ? unit : (PLURAL[unit] ?? unit);
  return `${value} ${plural}`;
}

export function kg(n: number): string {
  return `${n.toLocaleString("en-MY", { maximumFractionDigits: n < 10 ? 1 : 0 })} kg`;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}

/** "today", "tomorrow" or "by Fri" for an expiry day key, relative to the server's `today`. */
export function relDay(key: string, today: string): string {
  if (key < today) return "now (past expiry)";
  if (key === today) return "today";
  if (key === addDays(today, 1)) return "tomorrow";
  return `by ${shortDay(key)}`;
}

/** "today", "tomorrow" or "Thu 8 Oct" for a delivery day key. */
export function deliveryDay(key: string, today: string): string {
  if (key === today) return "today";
  if (key === addDays(today, 1)) return "tomorrow";
  return `${shortDay(key)} ${shortDate(key)}`;
}
