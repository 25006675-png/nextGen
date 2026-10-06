import "server-only";
import { prisma } from "./db";
import { addDays, dayKey, daysBetween, parseDay, todayKey } from "./dates";
import { BSF_CREDIT_PER_KG, CO2E_PER_KG_DIVERTED, FRASS_YIELD, REASONS, type Reason } from "./config";
import { getItemInsights } from "./queries";

const WINDOW_DAYS = 30; // baseline = first 30 days of data, current = last 30 days

export type EsgMonth = {
  key: string; // YYYY-MM
  label: string; // "Sep 2026"
  partial: boolean; // the records don't cover the whole month
  generatedKg: number;
  divertedKg: number; // logged this month, later collected by a BSF farm
  awaitingKg: number; // BSF-eligible, not collected yet
  disposalKg: number; // not BSF-eligible: general waste
  boughtKg: number;
  intensity: number; // kg wasted per kg bought
};

/** Reporting span and dates, e.g. span "13 weeks", range "8 Jul 2026 – 6 Oct 2026". */
export function reportingPeriod(from: string, to: string) {
  const days = daysBetween(from, to) + 1; // inclusive
  const span = days >= 14 ? `${Math.round(days / 7)} weeks` : `${days} day${days === 1 ? "" : "s"}`;
  const fmt = (key: string) => parseDay(key).toLocaleDateString("en-MY", { day: "numeric", month: "short", year: "numeric" });
  return { days, span, fromLabel: fmt(from), toLabel: fmt(to), range: `${fmt(from)} – ${fmt(to)}` };
}

/** Figures for the ESG summary and report, from the whole data history up to today. */
export async function getEsgReport(today = todayKey()) {
  const [logs, purchases, pickups] = await Promise.all([
    prisma.wasteLog.findMany({
      include: { item: { select: { kgPerUnit: true, category: true } }, pickup: { select: { status: true } } },
    }),
    prisma.purchase.findMany({ include: { item: { select: { kgPerUnit: true } } } }),
    prisma.pickup.findMany({ include: { _count: { select: { wasteLogs: true } } } }),
  ]);

  const days = [...logs.map((l) => dayKey(l.loggedAt)), ...purchases.map((p) => dayKey(p.purchasedAt))].sort();
  const from = days[0] ?? today;
  const logKg = (l: (typeof logs)[number]) => l.qty * l.item.kgPerUnit;
  const boughtKgOf = (p: (typeof purchases)[number]) => p.qty * p.item.kgPerUnit;
  const inWindow = (key: string, start: string) => key >= start && key < addDays(start, WINDOW_DAYS);
  const isCollected = (l: (typeof logs)[number]) => l.pickup?.status === "COLLECTED";

  const byReason = Object.fromEntries(REASONS.map((r) => [r, { kg: 0, rm: 0 }])) as Record<Reason, { kg: number; rm: number }>;
  const byCategory = new Map<string, { kg: number; rm: number }>();
  for (const l of logs) {
    byReason[l.reason as Reason].kg += logKg(l);
    byReason[l.reason as Reason].rm += l.costRM;
    const c = byCategory.get(l.item.category) ?? { kg: 0, rm: 0 };
    c.kg += logKg(l);
    c.rm += l.costRM;
    byCategory.set(l.item.category, c);
  }
  const generatedKg = logs.reduce((a, l) => a + logKg(l), 0);
  const generatedRM = logs.reduce((a, l) => a + l.costRM, 0);
  const purchasedKg = purchases.reduce((a, p) => a + boughtKgOf(p), 0);

  const collected = pickups.filter((p) => p.status === "COLLECTED");
  const divertedKg = collected.reduce((a, p) => a + p.totalKg, 0);
  const eligible = logs.filter((l) => l.bsfEligible);
  const awaitingKg = eligible.filter((l) => !isCollected(l)).reduce((a, l) => a + logKg(l), 0);
  const disposalKg = logs.filter((l) => !l.bsfEligible).reduce((a, l) => a + logKg(l), 0);

  // Intensity is kg wasted per kg bought, so a busier month doesn't look worse.
  const windowStats = (start: string) => {
    const w = logs.filter((l) => inWindow(dayKey(l.loggedAt), start));
    const wastedKg = w.reduce((a, l) => a + logKg(l), 0);
    const boughtKg = purchases.filter((p) => inWindow(dayKey(p.purchasedAt), start)).reduce((a, p) => a + boughtKgOf(p), 0);
    const divKg = collected
      .filter((p) => inWindow(dayKey(p.collectedAt ?? p.scheduledFor), start))
      .reduce((a, p) => a + p.totalKg, 0);
    return {
      intensity: boughtKg > 0 ? wastedKg / boughtKg : 0,
      diversionRate: wastedKg > 0 ? divKg / wastedKg : 0,
      photoRate: w.length ? w.filter((l) => l.photoPath).length / w.length : 0,
    };
  };
  const currentFrom = addDays(today, -(WINDOW_DAYS - 1));
  // Only compare when the two windows don't overlap.
  const comparison =
    currentFrom >= addDays(from, WINDOW_DAYS)
      ? { baselineFrom: from, currentFrom, baseline: windowStats(from), current: windowStats(currentFrom) }
      : null;

  // Calendar months, by the day waste was logged (diverted = later collected).
  const monthMap = new Map<string, EsgMonth>();
  const month = (key: string) => {
    const k = key.slice(0, 7);
    let m = monthMap.get(k);
    if (!m) {
      const first = `${k}-01`;
      const last = addDays(`${addDays(first, 31).slice(0, 7)}-01`, -1);
      m = {
        key: k,
        label: parseDay(first).toLocaleDateString("en-MY", { month: "short", year: "numeric" }),
        partial: from > first || today < last,
        generatedKg: 0,
        divertedKg: 0,
        awaitingKg: 0,
        disposalKg: 0,
        boughtKg: 0,
        intensity: 0,
      };
      monthMap.set(k, m);
    }
    return m;
  };
  for (const l of logs) {
    const m = month(dayKey(l.loggedAt));
    m.generatedKg += logKg(l);
    if (!l.bsfEligible) m.disposalKg += logKg(l);
    else if (isCollected(l)) m.divertedKg += logKg(l);
    else m.awaitingKg += logKg(l);
  }
  for (const p of purchases) month(dayKey(p.purchasedAt)).boughtKg += boughtKgOf(p);
  const monthly = [...monthMap.values()].sort((a, b) => a.key.localeCompare(b.key));
  for (const m of monthly) m.intensity = m.boughtKg > 0 ? m.generatedKg / m.boughtKg : 0;

  return {
    from,
    to: today,
    period: reportingPeriod(from, today),
    comparison,
    monthly,
    logCount: logs.length,
    purchaseCount: purchases.length,
    environment: {
      generatedKg,
      generatedRM,
      byReason,
      byCategory: [...byCategory.entries()].map(([category, v]) => ({ category, ...v })).sort((a, b) => b.kg - a.kg),
      purchasedKg,
      intensity: purchasedKg > 0 ? generatedKg / purchasedKg : 0,
      divertedKg,
      awaitingKg,
      disposalKg,
      diversionRate: generatedKg > 0 ? divertedKg / generatedKg : 0,
      co2Kg: divertedKg * CO2E_PER_KG_DIVERTED,
    },
    social: {
      partnerFarms: [...new Set(pickups.map((p) => p.partnerFarm))],
      frassKg: collected.filter((p) => p.returnType === "FRASS").reduce((a, p) => a + p.totalKg * FRASS_YIELD, 0),
      frassBatches: collected.filter((p) => p.returnType === "FRASS").length,
      creditRM: collected.filter((p) => p.returnType === "CREDIT").reduce((a, p) => a + p.totalKg * BSF_CREDIT_PER_KG, 0),
    },
    governance: {
      photoRate: logs.length ? logs.filter((l) => l.photoPath).length / logs.length : 0,
      batches: collected.length,
      traceableRate: collected.length
        ? collected.filter((p) => p.batchCode && p._count.wasteLogs > 0).length / collected.length
        : 0,
      linkedRate: eligible.length ? eligible.filter((l) => l.pickupId !== null).length / eligible.length : 0,
    },
  };
}

/**
 * Forward-looking figures from the order simulation (not records). All are RM
 * per week, averaged over the next 4 weeks of simulated futures.
 */
export async function getEsgOutlook(today = todayKey()) {
  const insights = await getItemInsights(today);
  const sum = (f: (i: (typeof insights)[number]) => number) => insights.reduce((a, i) => a + f(i), 0);
  return {
    weeklyWasteUsualRM: sum((i) => i.wasteUsualRM),
    weeklyWasteSmartRM: sum((i) => i.wasteSmartRM),
    weeklyNetSavingRM: sum((i) => i.savingRM), // waste + missed sales, usual minus smart
  };
}
