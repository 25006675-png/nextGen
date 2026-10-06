import "server-only";
import { prisma } from "./db";
import { addDays, dayKey, dayOfWeek, dayStart, daysBetween, parseDay, todayKey } from "./dates";
import { contextLabels, demandMultiplier } from "./calendar";
import { BSF_CREDIT_PER_KG, CO2E_PER_KG_DIVERTED, FORECAST_WEEKS, FRASS_YIELD, LOST_SALE_MULT, type Reason } from "./config";
import { forecastDemand, recommendOrder, sumQty, type DailyQty } from "./forecast/demand";
import { simulateExpiryRisk } from "./forecast/expiry";
import { expectedPolicy, projectLots, usableStock, type PolicyResult } from "./forecast/waste";
import { backtest, coverFactor, mulberry32, quantile, serviceLevel } from "./forecast/uncertainty";
import { deliveryDay, pct, qty, relDay, rm } from "./format";

const BACKTEST_DAYS = 28;
const BAND_HISTORY_DAYS = 21;
// Beyond this, surplus doesn't spoil within the simulated weeks, so a cost
// optimum would just say "stockpile"; such items reorder what they use.
const PERISHABLE_DAYS = 14;

export function isPerishable(shelfLifeDays: number) {
  return shelfLifeDays <= PERISHABLE_DAYS;
}

export type BandPoint = { date: string; actual?: number; forecast: number; low: number; high: number };

export type RiskLot = {
  lotId: number;
  remaining: number;
  qty: number; // expected qty left at expiry
  risk: number; // probability of stock left at expiry (Monte Carlo)
  expiresAt: string;
  valueRM: number; // expected RM lost
  paths: number[][];
  wasted: boolean[];
};

export type ItemInsight = {
  id: number;
  name: string;
  unit: string;
  category: string;
  unitCost: number;
  orderEveryDays: number;
  usualOrder: number;
  packSize: number;
  nextDelivery: string; // day key of the next delivery on the item's schedule
  recommended: number; // for the next delivery, after the stock that will still be usable then
  regularOrder: number; // cheapest fixed order per delivery in simulation
  stockOnHand: number;
  usableStock: number; // stock still usable from the next delivery on (after use until then and expiry)
  coverForecast: number; // point forecast of use in the cycle the next delivery covers
  weekForecast: number;
  serviceLevel: number; // share of likely delivery cycles with no run-out
  bufferPct: number; // safety buffer on top of the point forecast
  forecastError: number; // backtested daily WAPE
  // Per week, averaged over the next 4 weeks of simulated futures.
  wasteUsualRM: number; // expected waste at usual orders
  wasteSmartRM: number; // ... following the smart order
  missedUsualRM: number; // lost profit from run-outs at usual orders (LOST_SALE_MULT x cost)
  missedSmartRM: number; // ... following the smart order
  savingRM: number; // net: (waste + missed sales) usual minus smart
  band: BandPoint[];
  atRisk: RiskLot[];
};

export type Alert = {
  itemId: number;
  name: string;
  unit: string;
  qty: number;
  remaining: number;
  risk: number;
  expiresAt: string;
  valueRM: number; // expected RM lost across all of the item's at-risk batches
  otherBatches: number; // further at-risk batches of the same item
  suggestion: string;
  paths: number[][];
  wasted: boolean[];
};

const SUGGESTIONS: Record<string, string> = {
  Chicken: "Push chicken rice or curry chicken as today's special",
  Tomatoes: "Make a batch of sambal or tomato egg as a lauk",
  Kangkung: "Run kangkung belacan as a side-dish promo",
  Sawi: "Add sawi to every noodle order today",
  "Bean sprouts": "Top up portions on fried kuey teow and mee",
  Tofu: "Feature tauhu goreng or tofu soup today",
  "White bread": "Offer roti bakar set promo before it goes stale",
  "Fresh milk": "Push teh/kopi susu segar or a milk pudding",
  "Yellow noodles": "Make mee goreng the lunch special",
  "Kuey teow": "Make char kuey teow the lunch special",
  "Fish cake": "Add fish cake to noodle soups today",
  Prawns: "Run a prawn mee or sambal udang special",
  Kaya: "Bundle kaya toast with drinks this week",
};

function suggestionFor(name: string, category: string): string {
  if (SUGGESTIONS[name]) return SUGGESTIONS[name];
  if (category === "produce") return "Use it in today's special";
  return "Use this lot first";
}

async function loadItems(today: string, itemId?: number) {
  // Enough history to backtest the last 4 weeks, each with its own 4-week window.
  const historyFrom = parseDay(addDays(today, -(7 * FORECAST_WEEKS + BACKTEST_DAYS + 7)));
  const rateFrom = dayStart(addDays(today, -28));
  const [items, deliveries] = await Promise.all([
    prisma.item.findMany({
      where: itemId ? { id: itemId } : undefined,
      include: {
        usages: { where: { date: { gte: historyFrom } } },
        purchases: { where: { remaining: { gt: 0 } } },
        wasteLogs: { where: { loggedAt: { gte: rateFrom }, reason: { in: ["TRIMMINGS", "OVERBOUGHT"] } } },
      },
      orderBy: { name: "asc" },
    }),
    prisma.purchase.groupBy({ by: ["itemId"], where: itemId ? { itemId } : undefined, _max: { purchasedAt: true } }),
  ]);
  const last = new Map(deliveries.map((d) => [d.itemId, d._max.purchasedAt]));
  return items.map((i) => {
    const at = last.get(i.id);
    return { ...i, lastDelivery: at ? dayKey(at) : undefined };
  });
}

/** The data one item's model needs (Prisma rows fit; so does generated data). */
export type ItemData = {
  id: number;
  name: string;
  unit: string;
  category: string;
  unitCost: number;
  shelfLifeDays: number;
  usualOrder: number;
  packSize: number;
  orderEveryDays: number;
  usages: { date: Date; qty: number }[]; // the last ~9 weeks
  purchases: { id: number; remaining: number; expiresAt: Date }[]; // lots with stock left
  wasteLogs: { qty: number }[]; // trimmings + over-bought leftovers, last 28 days
  lastDelivery?: string; // day key of the latest delivery, if any
};

/** The first delivery day on the item's schedule from today on (today if there's no history). */
function nextDeliveryDay(lastDelivery: string | undefined, everyDays: number, today: string): string {
  if (!lastDelivery) return today;
  let day = addDays(lastDelivery, everyDays);
  while (day < today) day = addDays(day, everyDays);
  return day;
}

/** Days simulated before measuring a fixed order, so the shelf reaches its normal state. */
function warmupFor(item: ItemData) {
  return Math.min(30, item.shelfLifeDays + 2 * item.orderEveryDays);
}

/** Everything the simulations need for one item. */
function prepItem(item: ItemData, today: string) {
  const history: DailyQty = {};
  for (const u of item.usages) {
    const k = dayKey(u.date);
    history[k] = (history[k] ?? 0) + u.qty;
  }
  const week = forecastDemand(history, today, 7, { weeks: FORECAST_WEEKS, multiplier: demandMultiplier });
  // Beyond the 7-day forecast, repeat the same weekday pattern.
  const byDow = new Map(week.map((d) => [dayOfWeek(d.date), d.qty / demandMultiplier(d.date)]));
  const pointCache = new Map<string, number>();
  const pointOn = (d: string) => {
    let v = pointCache.get(d);
    if (v === undefined) {
      v = (byDow.get(dayOfWeek(d)) ?? 0) * demandMultiplier(d);
      pointCache.set(d, v);
    }
    return v;
  };
  const coverFrom = (day: string) => {
    let q = 0;
    for (let i = 0; i < item.orderEveryDays; i++) q += pointOn(addDays(day, i));
    return q;
  };

  const bt = backtest(history, today, { days: BACKTEST_DAYS, weeks: FORECAST_WEEKS, multiplier: demandMultiplier });
  // Stable per item and day, so numbers don't jump on every refresh.
  const seed = item.id * 100_003 + Math.floor(parseDay(today).getTime() / 86_400_000);
  const level = serviceLevel(item.shelfLifeDays, item.orderEveryDays, LOST_SALE_MULT);
  const factor = coverFactor(bt.ratios, item.orderEveryDays, level, mulberry32(seed));

  const lots = item.purchases.map((p) => ({ id: p.id, remaining: p.remaining, expiresAt: dayKey(p.expiresAt) }));
  const usage28 = Object.entries(history)
    .filter(([k]) => k >= addDays(today, -28))
    .reduce((a, [, q]) => a + q, 0);
  const unavoidable = item.wasteLogs.reduce((a, w) => a + w.qty, 0);

  const policyBase = {
    lots,
    pointOn,
    today,
    orderEveryDays: item.orderEveryDays,
    shelfLifeDays: item.shelfLifeDays,
    unavoidableRate: usage28 > 0 ? unavoidable / usage28 : 0,
  };
  const costRM = (r: PolicyResult) => r.wasted * item.unitCost + r.unmet * item.unitCost * LOST_SALE_MULT;
  // Steady state: judged without today's leftover stock, which would otherwise
  // make a fixed order look cheap just because the shelf is already full.
  const fixedCost = (q: number, opts: { runs: number; scale?: number }) =>
    costRM(
      expectedPolicy({ ...policyBase, lots: [], warmupDays: warmupFor(item), orderQty: () => q }, bt.ratios, {
        seed,
        ...opts,
      }),
    );

  return { week, pointOn, coverFrom, bt, seed, level, factor, lots, policyBase, fixedCost };
}

/** Cheapest fixed order per delivery (waste + missed sales) across simulated futures. */
function bestFixedOrder(coverForecast: number, packSize: number, fixedCost: (q: number, o: { runs: number }) => number) {
  const lo = Math.max(0, Math.floor((coverForecast * 0.6) / packSize));
  const hi = Math.max(lo + 1, Math.ceil((coverForecast * 1.8) / packSize));
  const step = Math.max(1, Math.ceil((hi - lo) / 20));
  let best = { q: lo * packSize, cost: Infinity };
  for (let n = lo; n <= hi; n += step) {
    const cost = fixedCost(n * packSize, { runs: 60 });
    if (cost < best.cost) best = { q: n * packSize, cost };
  }
  return best.q;
}

// The simulations take a moment, so results are reused until the data that
// feeds them changes (a new waste log or stock movement) or the day rolls over.
let insightsCache: { key: string; value: ItemInsight[] } | null = null;
const landscapeCache = new Map<string, Landscape>();

/** Changes whenever anything feeding the models changes (or the day rolls over). */
async function dataKey(today: string) {
  const [lastLog, stock, lastUsage, lastItem] = await Promise.all([
    prisma.wasteLog.aggregate({ _max: { id: true } }),
    prisma.purchase.aggregate({ _sum: { remaining: true }, _max: { id: true } }),
    prisma.usage.aggregate({ _max: { id: true } }),
    prisma.item.aggregate({ _max: { id: true } }),
  ]);
  return [today, lastLog._max.id, stock._sum.remaining, stock._max.id, lastUsage._max.id, lastItem._max.id].join("|");
}

export async function getItemInsights(today = todayKey()): Promise<ItemInsight[]> {
  const key = await dataKey(today);
  if (insightsCache?.key === key) return insightsCache.value;
  const value = (await loadItems(today)).map((item) => computeItemInsight(item, today));
  insightsCache = { key, value };
  landscapeCache.clear();
  return value;
}

/** One item, freshly computed (used to show what a new waste log changed). */
export async function getItemInsight(itemId: number, today = todayKey()): Promise<ItemInsight | null> {
  const [item] = await loadItems(today, itemId);
  return item ? computeItemInsight(item, today) : null;
}

/** The full model for one item: forecast, smart order, simulated savings, expiry risk. */
export function computeItemInsight(item: ItemData, today: string): ItemInsight {
  const m = prepItem(item, today);
  const weekForecast = sumQty(m.week);
  const coverForecast = sumQty(m.week.slice(0, Math.min(7, item.orderEveryDays)));
  const stockOnHand = m.lots.filter((l) => l.expiresAt >= today).reduce((a, l) => a + l.remaining, 0);
  // Size the order for the day it actually arrives: the shelf keeps being used until then.
  const nextDelivery = nextDeliveryDay(item.lastDelivery, item.orderEveryDays, today);
  const shelfThen = projectLots(m.lots, m.pointOn, today, daysBetween(today, nextDelivery));
  const nextCover = m.coverFrom(nextDelivery);
  const usable = usableStock(shelfThen, m.pointOn, nextDelivery, item.orderEveryDays);
  const recommended = recommendOrder(nextCover * m.factor, usable, item.packSize, 0);

  const usual = expectedPolicy({ ...m.policyBase, orderQty: () => item.usualOrder }, m.bt.ratios, { seed: m.seed });
  const smart = expectedPolicy(
    {
      ...m.policyBase,
      orderQty: (lots, day) =>
        recommendOrder(
          m.coverFrom(day) * m.factor,
          usableStock(lots, m.pointOn, day, item.orderEveryDays),
          item.packSize,
          0,
        ),
    },
    m.bt.ratios,
    { seed: m.seed },
  );
  const missed = (r: PolicyResult) => r.unmet * item.unitCost * LOST_SALE_MULT;

  const atRisk = simulateExpiryRisk(m.lots, m.pointOn, today, m.bt.ratios, { runs: 1000, seed: m.seed, keepPaths: true })
    .filter((r) => r.risk > 0 && r.paths && r.paths.length > 0)
    .map((r) => ({
      lotId: r.id,
      remaining: r.remaining,
      qty: r.expectedLeftover,
      risk: r.risk,
      expiresAt: r.expiresAt,
      valueRM: r.expectedLeftover * item.unitCost,
      paths: r.paths ?? [],
      wasted: r.wasted ?? [],
    }));

  const lowQ = quantile(m.bt.ratios, 0.1);
  const highQ = quantile(m.bt.ratios, 0.9);
  const band: BandPoint[] = [
    ...m.bt.points.slice(-BAND_HISTORY_DAYS).map((p) => ({
      date: p.date,
      actual: p.actual,
      forecast: p.forecast,
      low: p.forecast * lowQ,
      high: p.forecast * highQ,
    })),
    ...m.week.map((d) => ({ date: d.date, forecast: d.qty, low: d.qty * lowQ, high: d.qty * highQ })),
  ];

  return {
    id: item.id,
    name: item.name,
    unit: item.unit,
    category: item.category,
    unitCost: item.unitCost,
    orderEveryDays: item.orderEveryDays,
    usualOrder: item.usualOrder,
    packSize: item.packSize,
    nextDelivery,
    recommended,
    regularOrder: isPerishable(item.shelfLifeDays)
      ? bestFixedOrder(coverForecast, item.packSize, m.fixedCost)
      : recommendOrder(coverForecast, 0, item.packSize, 0),
    stockOnHand,
    usableStock: usable,
    coverForecast: nextCover,
    weekForecast,
    serviceLevel: m.level,
    bufferPct: m.factor - 1,
    forecastError: m.bt.error,
    wasteUsualRM: usual.wasted * item.unitCost,
    wasteSmartRM: smart.wasted * item.unitCost,
    missedUsualRM: missed(usual),
    missedSmartRM: missed(smart),
    savingRM: usual.wasted * item.unitCost + missed(usual) - (smart.wasted * item.unitCost + missed(smart)),
    band,
    atRisk,
  };
}

export type Landscape = {
  itemName: string;
  perishable: boolean;
  unit: string;
  orders: number[]; // x: order per delivery
  scenarios: number[]; // y: demand vs forecast (0.7 = 30% quieter week)
  cost: number[][]; // z[scenario][order]: RM lost per week (waste + missed sales)
  usual: { order: number; cost: number[] };
  smart: { order: number; cost: number[] };
};

/** 3D cost landscape for one item: order size x how busy the week is -> RM lost. */
export async function getLandscape(itemId: number, regularOrder: number, today = todayKey()): Promise<Landscape | null> {
  const cacheKey = `${await dataKey(today)}|${itemId}|${regularOrder}`;
  const hit = landscapeCache.get(cacheKey);
  if (hit) return hit;
  const [item] = await loadItems(today, itemId);
  if (!item) return null;
  const m = prepItem(item, today);
  const cover = sumQty(m.week.slice(0, Math.min(7, item.orderEveryDays)));
  const maxOrder = Math.max(cover * 2, item.usualOrder * 1.2, regularOrder * 1.2);
  const orders = Array.from({ length: 16 }, (_, i) => maxOrder * (0.25 + (0.75 * i) / 15));
  const scenarios = Array.from({ length: 13 }, (_, i) => Math.round((0.7 + i * 0.05) * 100) / 100);
  const runs = 40;
  const landscape: Landscape = {
    itemName: item.name,
    perishable: isPerishable(item.shelfLifeDays),
    unit: item.unit,
    orders,
    scenarios,
    cost: scenarios.map((scale) => orders.map((q) => m.fixedCost(q, { runs, scale }))),
    usual: { order: item.usualOrder, cost: scenarios.map((scale) => m.fixedCost(item.usualOrder, { runs, scale })) },
    smart: { order: regularOrder, cost: scenarios.map((scale) => m.fixedCost(regularOrder, { runs, scale })) },
  };
  if (landscapeCache.size > 50) landscapeCache.clear();
  landscapeCache.set(cacheKey, landscape);
  return landscape;
}

export function useFirstAlerts(insights: ItemInsight[], minRisk = 0.3): Alert[] {
  return insights
    .flatMap((i) => {
      // One alert per item, led by its most urgent at-risk batch.
      const risky = i.atRisk.filter((r) => r.risk >= minRisk).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
      if (risky.length === 0) return [];
      const r = risky[0];
      return [
        {
          itemId: i.id,
          name: i.name,
          unit: i.unit,
          qty: r.qty,
          remaining: r.remaining,
          risk: r.risk,
          expiresAt: r.expiresAt,
          valueRM: risky.reduce((a, x) => a + x.valueRM, 0),
          otherBatches: risky.length - 1,
          suggestion: suggestionFor(i.name, i.category),
          paths: r.paths,
          wasted: r.wasted,
        },
      ];
    })
    .sort((a, b) => b.valueRM - a.valueRM);
}

async function wasteBetween(from: string, to: string) {
  return prisma.wasteLog.findMany({
    where: { loggedAt: { gte: dayStart(from), lt: dayStart(to) } },
    include: { item: { select: { name: true, unit: true, kgPerUnit: true } } },
  });
}

export async function getDashboard() {
  const today = todayKey();
  const tomorrow = addDays(today, 1);
  const logs = await prisma.wasteLog.findMany({
    where: { loggedAt: { gte: dayStart(addDays(today, -56)) } },
    include: { item: { select: { name: true, unit: true, kgPerUnit: true } } },
  });
  const inWindow = (from: string, to: string) =>
    logs.filter((l) => {
      const k = dayKey(l.loggedAt);
      return k >= from && k < to;
    });

  const last30 = inWindow(addDays(today, -29), tomorrow);
  const prev30Logs = await wasteBetween(addDays(today, -59), addDays(today, -29));
  const lostRM = last30.reduce((a, l) => a + l.costRM, 0);
  const prevRM = prev30Logs.reduce((a, l) => a + l.costRM, 0);
  const lostKg = last30.reduce((a, l) => a + l.qty * l.item.kgPerUnit, 0);

  const byItem = new Map<string, { name: string; rm: number; kg: number; reasons: Map<Reason, number> }>();
  for (const l of last30) {
    const row = byItem.get(l.item.name) ?? { name: l.item.name, rm: 0, kg: 0, reasons: new Map() };
    row.rm += l.costRM;
    row.kg += l.qty * l.item.kgPerUnit;
    row.reasons.set(l.reason as Reason, (row.reasons.get(l.reason as Reason) ?? 0) + l.costRM);
    byItem.set(l.item.name, row);
  }
  const topWasted = [...byItem.values()]
    .sort((a, b) => b.rm - a.rm)
    .slice(0, 6)
    .map((r) => ({
      name: r.name,
      rm: r.rm,
      kg: r.kg,
      topReason: [...r.reasons.entries()].sort((a, b) => b[1] - a[1])[0][0],
    }));

  const insights = await getItemInsights(today);
  const forecastUsualRM = insights.reduce((a, i) => a + i.wasteUsualRM, 0);
  const forecastSmartRM = insights.reduce((a, i) => a + i.wasteSmartRM, 0);
  const forecastSavingRM = insights.reduce((a, i) => a + i.savingRM, 0); // net of extra missed sales
  const weightTotal = insights.reduce((a, i) => a + i.weekForecast * i.unitCost, 0);
  const forecastError =
    weightTotal > 0 ? insights.reduce((a, i) => a + i.forecastError * i.weekForecast * i.unitCost, 0) / weightTotal : 0;

  // Last 8 weeks of actual waste (rolling 7-day buckets), then next week's forecast.
  const weekly: { label: string; actual?: number; usual?: number; smart?: number }[] = [];
  for (let w = 7; w >= 0; w--) {
    const from = addDays(today, -7 * (w + 1));
    weekly.push({
      label: `${Number(from.slice(8))}/${Number(from.slice(5, 7))}`,
      actual: inWindow(from, addDays(from, 7)).reduce((a, l) => a + l.costRM, 0),
    });
  }
  weekly.push({ label: "Avg week ahead", usual: forecastUsualRM, smart: forecastSmartRM });

  const upcoming = new Set<string>();
  for (let i = 0; i < 7; i++) contextLabels(addDays(today, i)).forEach((l) => upcoming.add(l));

  return {
    today,
    lostRM,
    prevRM,
    lostKg,
    topWasted,
    alerts: useFirstAlerts(insights).slice(0, 4),
    forecastUsualRM,
    forecastSmartRM,
    forecastSavingRM,
    forecastError,
    weekly,
    upcoming: [...upcoming],
    esg: await getEsgSummary(),
    bsf: await getOpenBsf(),
  };
}

export async function getOpenBsf() {
  const logs = await prisma.wasteLog.findMany({
    where: { bsfEligible: true, pickupId: null },
    include: { item: { select: { name: true, kgPerUnit: true } } },
    orderBy: { loggedAt: "asc" },
  });
  const byItem = new Map<string, number>();
  for (const l of logs) byItem.set(l.item.name, (byItem.get(l.item.name) ?? 0) + l.qty * l.item.kgPerUnit);
  return {
    kg: logs.reduce((a, l) => a + l.qty * l.item.kgPerUnit, 0),
    count: logs.length,
    since: logs[0]?.loggedAt ?? null,
    byItem: [...byItem.entries()].map(([name, kg]) => ({ name, kg })).sort((a, b) => b.kg - a.kg),
  };
}

export async function getPickups() {
  const pickups = await prisma.pickup.findMany({
    include: { wasteLogs: { include: { item: { select: { name: true, kgPerUnit: true } } } } },
    orderBy: { createdAt: "desc" },
  });
  return pickups.map((p) => {
    const contents = new Map<string, number>();
    const reasons = new Set<string>();
    for (const l of p.wasteLogs) {
      contents.set(l.item.name, (contents.get(l.item.name) ?? 0) + l.qty * l.item.kgPerUnit);
      reasons.add(l.reason);
    }
    const loggedDays = p.wasteLogs.map((l) => l.loggedAt.getTime());
    return {
      id: p.id,
      batchCode: p.batchCode,
      partnerFarm: p.partnerFarm,
      status: p.status,
      totalKg: p.totalKg,
      returnType: p.returnType,
      scheduledFor: p.scheduledFor,
      collectedAt: p.collectedAt,
      logCount: p.wasteLogs.length,
      firstLogged: loggedDays.length ? new Date(Math.min(...loggedDays)) : null,
      lastLogged: loggedDays.length ? new Date(Math.max(...loggedDays)) : null,
      reasons: [...reasons],
      contents: [...contents.entries()].map(([name, kg]) => ({ name, kg })).sort((a, b) => b.kg - a.kg),
    };
  });
}

export async function getEsgSummary() {
  const collected = await prisma.pickup.findMany({ where: { status: "COLLECTED" }, orderBy: { collectedAt: "asc" } });
  const months = new Map<string, { month: string; kg: number; co2: number; pickups: number }>();
  for (const p of collected) {
    const d = p.collectedAt ?? p.scheduledFor;
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
    const m = months.get(key) ?? {
      month: d.toLocaleDateString("en-MY", { month: "short", year: "numeric" }),
      kg: 0,
      co2: 0,
      pickups: 0,
    };
    m.kg += p.totalKg;
    m.co2 += p.totalKg * CO2E_PER_KG_DIVERTED;
    m.pickups += 1;
    months.set(key, m);
  }
  const now = new Date();
  const thisKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const kg = collected.reduce((a, p) => a + p.totalKg, 0);
  return {
    kg,
    co2: kg * CO2E_PER_KG_DIVERTED,
    pickups: collected.length,
    frassKg: collected.filter((p) => p.returnType === "FRASS").reduce((a, p) => a + p.totalKg * FRASS_YIELD, 0),
    creditRM: collected.filter((p) => p.returnType === "CREDIT").reduce((a, p) => a + p.totalKg * BSF_CREDIT_PER_KG, 0),
    thisMonthKg: months.get(thisKey)?.kg ?? 0,
    monthly: [...months.values()],
  };
}

export async function getLogFormData() {
  const since = dayStart(addDays(todayKey(), -30));
  const [items, freq, recent] = await Promise.all([
    prisma.item.findMany({ orderBy: { name: "asc" } }),
    prisma.wasteLog.groupBy({ by: ["itemId"], where: { loggedAt: { gte: since } }, _count: true }),
    prisma.wasteLog.findMany({ orderBy: { loggedAt: "desc" }, take: 5, include: { item: { select: { name: true, unit: true } } } }),
  ]);
  const count = new Map(freq.map((f) => [f.itemId, f._count]));
  return {
    items: items
      .map((i) => ({ id: i.id, name: i.name, unit: i.unit, unitCost: i.unitCost, category: i.category }))
      .sort((a, b) => (count.get(b.id) ?? 0) - (count.get(a.id) ?? 0)),
    recent: recent.map((r) => ({
      id: r.id,
      name: r.item.name,
      unit: r.item.unit,
      qty: r.qty,
      costRM: r.costRM,
      reason: r.reason as Reason,
      bsfEligible: r.bsfEligible,
      photoPath: r.photoPath,
      loggedAt: r.loggedAt,
    })),
  };
}

/** Where the data comes from, for the "connected sources" strip on Home. */
export async function getDataSources() {
  const [salesRows, firstSale, lastSale, purchases, lastPurchase, wasteLogs, lastLog, items] = await Promise.all([
    prisma.usage.count(),
    prisma.usage.findFirst({ orderBy: { date: "asc" }, select: { date: true } }),
    prisma.usage.findFirst({ orderBy: { date: "desc" }, select: { date: true } }),
    prisma.purchase.count(),
    prisma.purchase.findFirst({ orderBy: { purchasedAt: "desc" }, select: { purchasedAt: true } }),
    prisma.wasteLog.count(),
    prisma.wasteLog.findFirst({ orderBy: { loggedAt: "desc" }, select: { loggedAt: true } }),
    prisma.item.count(),
  ]);
  return {
    items,
    salesRows,
    salesFrom: firstSale ? dayKey(firstSale.date) : null,
    salesTo: lastSale ? dayKey(lastSale.date) : null,
    purchases,
    lastPurchase: lastPurchase ? dayKey(lastPurchase.purchasedAt) : null,
    wasteLogs,
    lastWasteLog: lastLog?.loggedAt ?? null,
  };
}

export type ChangeSnapshot = {
  lostRM: number; // waste RM, last 30 days
  bsfOpenKg: number; // BSF-eligible kg waiting for pickup
  itemName: string;
  unit: string;
  itemRisk: number; // expiry risk of the item's most urgent batch, as on the Home alert (0..1)
  itemAtRiskRM: number; // expected RM at risk across the item's batches, as on the Home alert
  nextOrder: number; // recommended next delivery for the item
};

/** Numbers a waste log can move, for the before/after card on the Log page. */
export async function getChangeSnapshot(itemId: number, today = todayKey()): Promise<ChangeSnapshot | null> {
  const [insight, recent, open] = await Promise.all([
    getItemInsight(itemId, today),
    prisma.wasteLog.aggregate({ _sum: { costRM: true }, where: { loggedAt: { gte: dayStart(addDays(today, -29)) } } }),
    getOpenBsf(),
  ]);
  if (!insight) return null;
  return {
    lostRM: recent._sum.costRM ?? 0,
    bsfOpenKg: open.kg,
    itemName: insight.name,
    unit: insight.unit,
    // Same rules as the Home "Use first" alert, so before/after match what was just shown.
    itemRisk: useFirstAlerts([insight])[0]?.risk ?? 0,
    itemAtRiskRM: useFirstAlerts([insight])[0]?.valueRM ?? 0,
    nextOrder: insight.recommended,
  };
}

export type WhyTakeaway = { kind: "order" | "money" | "forecast" | "buffer" | "expiry"; text: string };

export type WhyData = {
  id: number;
  name: string;
  unit: string;
  today: string;
  regularOrder: number;
  usualOrder: number;
  takeaways: WhyTakeaway[];
  band: BandPoint[];
  lead: Alert | null; // most urgent at-risk batch, with its 1,000 simulated futures
  landscape: Landscape | null;
};

/** Everything the "Why this order?" panel shows for one item, in plain English first. */
export async function getWhy(itemId: number, today = todayKey()): Promise<WhyData | null> {
  const insight = (await getItemInsights(today)).find((i) => i.id === itemId);
  if (!insight) return null;
  const landscape = await getLandscape(itemId, insight.regularOrder, today);
  const lead = useFirstAlerts([insight], 0.01)[0] ?? null;
  const i = insight;
  const q = (n: number) => qty(n, i.unit);
  const takeaways: WhyTakeaway[] = [];

  takeaways.push({
    kind: "order",
    text:
      (i.nextDelivery !== today
        ? i.recommended === 0
          ? `Skip the ${deliveryDay(i.nextDelivery, today)} delivery: about ${q(i.usableStock)} of today's ${q(i.stockOnHand)} will still be usable then, enough for the ${i.orderEveryDays} days after.`
          : `Order ${q(i.recommended)} for ${deliveryDay(i.nextDelivery, today)}: you'll need ~${q(i.coverForecast)} over the ${i.orderEveryDays} days from then, and about ${q(i.usableStock)} of today's stock will still be usable.`
        : i.recommended === 0
          ? q(i.usableStock) === q(i.stockOnHand)
            ? `Skip this delivery: the ${q(i.stockOnHand)} on the shelf covers the next ${i.orderEveryDays} days.`
            : `Skip this delivery: ${q(i.usableStock)} of the ${q(i.stockOnHand)} on the shelf is still usable, enough for the next ${i.orderEveryDays} days.`
          : `Order ${q(i.recommended)} now: you need ~${q(i.coverForecast)} over the next ${i.orderEveryDays} days and ${q(i.usableStock)} on the shelf is still usable.`) +
      (i.regularOrder === i.usualOrder
        ? ` After that, keep your usual ${q(i.usualOrder)} per delivery.`
        : ` After that, order ${q(i.regularOrder)} per delivery instead of your usual ${q(i.usualOrder)}.`),
  });

  if (landscape) {
    const normal = landscape.scenarios.indexOf(1);
    if (landscape.perishable && normal >= 0) {
      const u = landscape.usual.cost[normal];
      const s = landscape.smart.cost[normal];
      const cheaper = landscape.scenarios.filter((_, k) => landscape.smart.cost[k] <= landscape.usual.cost[k] + 0.5).length;
      takeaways.push({
        kind: "money",
        text:
          i.regularOrder === i.usualOrder
            ? `In a normal week your usual ${q(i.usualOrder)} already sits near the cheapest point (~${rm(u)} lost a week). The saving comes from skipping or trimming deliveries when stock is already on the shelf.`
            : `In a normal week your usual ${q(i.usualOrder)} loses ~${rm(u)} (waste + missed sales); ${q(i.regularOrder)} loses ~${rm(s)}. It stays as cheap or cheaper in ${cheaper} of ${landscape.scenarios.length} quieter-to-busier weeks.`,
      });
    } else if (!landscape.perishable) {
      takeaways.push({
        kind: "money",
        text: `${i.name} keeps for months, so extra stock rarely spoils. The smart order just replaces what you use.`,
      });
    }
  }

  const history = i.band.filter((p) => p.actual !== undefined);
  const inside = history.filter((p) => p.actual! >= p.low && p.actual! <= p.high).length;
  if (history.length > 0) {
    takeaways.push({
      kind: "forecast",
      text: `Real use landed inside the forecast's likely range on ${inside} of the last ${history.length} days (off by ±${pct(i.forecastError)} on an average day).`,
    });
  }

  takeaways.push({
    kind: "buffer",
    text:
      `Sized to be enough in ${Math.round(i.serviceLevel * 10)} of 10 likely delivery cycles` +
      (i.bufferPct >= 0.01 ? ` (+${pct(i.bufferPct)} above the forecast)` : i.bufferPct <= -0.01 ? " (below the forecast: it usually sells less than predicted)" : "") +
      `. ${i.serviceLevel < 0.9 ? "Not 10 of 10: a bigger buffer would mostly spoil before it's used." : "It keeps well, so a bigger buffer costs little."}`,
  });

  takeaways.push({
    kind: "expiry",
    text: lead
      ? `${pct(lead.risk)} of 1,000 simulated futures end with part of the ${q(lead.remaining)} batch (expires ${relDay(lead.expiresAt, today)}) unused: ~${q(lead.qty)} likely left.`
      : "No batch on the shelf is likely to expire before it's used.",
  });

  return {
    id: i.id,
    name: i.name,
    unit: i.unit,
    today,
    regularOrder: i.regularOrder,
    usualOrder: i.usualOrder,
    takeaways,
    band: i.band,
    lead,
    landscape,
  };
}
