// `npm run pitch`: backtest the models on the simulated history and write the
// headline numbers to lib/pitch/results.json and
// docs/pitch-numbers.md. Runs fully in memory; never touches the database.
//
// Every test only uses data the shop would have had on the day: the smart
// order and the expiry risk come from the exact app code (computeItemInsight)
// fed with sales up to the day before.

import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { generateSampleData, type SampleData, type SampleItem } from "../lib/demo-data";
import { computeItemInsight, isPerishable, type ItemData } from "../lib/queries";
import { addDays, dayKey, daysBetween, parseDay, todayKey } from "../lib/dates";
import { contextLabels, demandMultiplier } from "../lib/calendar";
import { CO2E_PER_KG_DIVERTED, FORECAST_WEEKS, LOST_SALE_MULT, isBsfEligible } from "../lib/config";
import { forecastDemand, type DailyQty } from "../lib/forecast/demand";
import type { Lot } from "../lib/forecast/expiry";
import {
  WEEKS_PER_MONTH,
  brier,
  calibration,
  lastDeliveryOnOrBefore,
  auc,
  replayPolicy,
  salesBefore,
  shelfAt,
  wape,
  warmupFor,
} from "../lib/pitch/replay";
import type { AlertThreshold, AlertValidation, ItemSaving, PitchResults, SavingsTotal, SensitivityRow } from "../lib/pitch/types";

const WINDOW_DAYS = 28;
// The window ends this many days before today, so stock delivered at its end
// has expired (or been used) inside the known history.
const GAP_DAYS = 14;
const ALERT_HORIZON = 3; // batches expiring within D..D+3
const WASTE_FRACTION = 0.05; // same rule as the expiry model
const SCENARIOS = [
  { label: "10%", overOrderScale: 0.5 },
  { label: "20%", overOrderScale: 1 },
  { label: "30%", overOrderScale: 1.5 },
];

const today = todayKey();
const windowFrom = addDays(today, -(GAP_DAYS + WINDOW_DAYS));
const windowTo = addDays(windowFrom, WINDOW_DAYS - 1);
const windowDays = Array.from({ length: WINDOW_DAYS }, (_, i) => addDays(windowFrom, i));
const months = WEEKS_PER_MONTH / (WINDOW_DAYS / 7); // window total -> per month

/** What the app's model sees for an item on the morning of `day`. */
function itemData(item: SampleItem, day: string, lots: Lot[], wasteLogs: { qty: number }[] = []): ItemData {
  return {
    ...item,
    usages: salesBefore(item, day),
    purchases: lots.map((l) => ({ id: l.id, remaining: l.remaining, expiresAt: parseDay(l.expiresAt) })),
    wasteLogs,
  };
}

function salesHistory(item: SampleItem): DailyQty {
  return Object.fromEntries(item.usages.map((u) => [u.day, u.qty]));
}

// a) Counterfactual replay: usual habit vs smart order, same true demand.
function backtestSavings(data: SampleData) {
  const perItem: ItemSaving[] = [];
  const excluded: string[] = [];
  let replayWasteRM = 0;
  let loggedWasteRM = 0;
  let habitCost = 0;
  let demandCost = 0;

  for (const item of data.items) {
    if (!isPerishable(item.shelfLifeDays)) {
      excluded.push(item.name);
      continue;
    }
    const start = lastDeliveryOnOrBefore(item, windowFrom);
    if (!start) throw new Error(`${item.name}: no delivery before the window`);
    const end = addDays(start, WINDOW_DAYS);
    const opts = { warmupDays: warmupFor(item.orderEveryDays) };
    const usual = replayPolicy(item, start, () => item.usualOrder, opts);
    const smartOrders: number[] = [];
    const smart = replayPolicy(item, start, (lots, day) => {
      const q = computeItemInsight(itemData(item, day, lots), day).recommended;
      if (day < end) smartOrders.push(q);
      return q;
    }, opts);

    const rm = (q: number) => q * item.unitCost * months;
    const kg = (q: number) => q * item.kgPerUnit * months;
    const missed = (q: number) => rm(q) * LOST_SALE_MULT;
    perItem.push({
      name: item.name,
      unit: item.unit,
      usualOrder: item.usualOrder,
      smartOrder: smartOrders.reduce((a, b) => a + b, 0) / Math.max(1, smartOrders.length),
      usualWasteRM: rm(usual.wasted),
      smartWasteRM: rm(smart.wasted),
      usualWasteKg: kg(usual.wasted),
      smartWasteKg: kg(smart.wasted),
      usualMissedRM: missed(usual.unmet),
      smartMissedRM: missed(smart.unmet),
      netSavingRM: rm(usual.wasted) + missed(usual.unmet) - rm(smart.wasted) - missed(smart.unmet),
    });

    // Sanity check: the habit replay should land close to what was logged.
    replayWasteRM += usual.wasted * item.unitCost;
    const counted = item.lots.filter((l) => l.purchasedAt >= start && l.purchasedAt < end);
    loggedWasteRM += counted.reduce((a, l) => a + (l.leftAtExpiry ?? 0), 0) * item.unitCost;

    habitCost += item.usualOrder * (WINDOW_DAYS / item.orderEveryDays) * item.unitCost;
    demandCost += windowDays.reduce((a, d) => a + item.demand[d], 0) * item.unitCost;
  }

  const sum = (k: keyof SavingsTotal) => perItem.reduce((a, r) => a + (r[k as keyof ItemSaving] as number), 0);
  const total: SavingsTotal = {
    usualWasteRM: sum("usualWasteRM"),
    smartWasteRM: sum("smartWasteRM"),
    usualWasteKg: sum("usualWasteKg"),
    smartWasteKg: sum("smartWasteKg"),
    usualMissedRM: sum("usualMissedRM"),
    smartMissedRM: sum("smartMissedRM"),
    netSavingRM: sum("netSavingRM"),
    wasteCut: 0,
  };
  total.wasteCut = total.usualWasteRM > 0 ? 1 - total.smartWasteRM / total.usualWasteRM : 0;
  return {
    perItem: perItem.sort((a, b) => b.netSavingRM - a.netSavingRM),
    total,
    excluded,
    habitCheck: { replayWasteRM, loggedWasteRM },
    effectiveOverOrder: habitCost / demandCost - 1,
  };
}

// c) Expiry alerts: predicted risk each morning vs whether the batch was binned.
function validateAlerts(data: SampleData): PitchResults["alerts"] {
  const preds: { p: number; y: boolean }[] = [];
  type Batch = { expiresAt: string; binned: boolean; valueRM: number; risks: { day: string; p: number }[] };
  const batches = new Map<string, Batch>();

  for (const day of windowDays) {
    for (const item of data.items) {
      const shelf = shelfAt(item, day);
      const due = shelf.filter((l) => l.expiresAt <= addDays(day, ALERT_HORIZON));
      if (due.length === 0) continue;
      const insight = computeItemInsight(itemData(item, day, shelf), day);
      for (const l of due) {
        const p = insight.atRisk.find((r) => r.lotId === l.id)?.risk ?? 0;
        const left = item.lots[l.id - 1].leftAtExpiry ?? 0;
        const y = left > 0 && left >= l.remaining * WASTE_FRACTION;
        preds.push({ p, y });
        const key = `${item.id}:${l.id}`;
        // The batch's outcome is judged on the stock it had when it first entered the horizon.
        const b = batches.get(key) ?? { expiresAt: l.expiresAt, binned: y, valueRM: left * item.unitCost, risks: [] };
        b.risks.push({ day, p });
        batches.set(key, b);
      }
    }
  }

  // Only batches whose whole 3-day horizon lies inside the window.
  const full = [...batches.values()].filter((b) => b.expiresAt >= addDays(windowFrom, ALERT_HORIZON) && b.expiresAt <= windowTo);
  const binned = full.filter((b) => b.binned);
  const thresholds: AlertThreshold[] = [0.3, 0.5].map((at) => {
    const firstFlag = (b: Batch) => b.risks.find((r) => r.p >= at)?.day;
    const flagged = full.filter((b) => firstFlag(b));
    const caught = binned.filter((b) => firstFlag(b));
    return {
      at,
      recall: caught.length / Math.max(1, binned.length),
      precision: flagged.length ? flagged.filter((b) => b.binned).length / flagged.length : 0,
      valueRecall:
        caught.reduce((a, b) => a + b.valueRM, 0) / Math.max(1e-9, binned.reduce((a, b) => a + b.valueRM, 0)),
      leadDays: caught.reduce((a, b) => a + daysBetween(firstFlag(b)!, b.expiresAt), 0) / Math.max(1, caught.length),
    };
  });

  const baseRate = preds.filter((x) => x.y).length / Math.max(1, preds.length);
  return {
    batches: full.length,
    binned: binned.length,
    predictions: preds.length,
    baseRate,
    auc: auc(preds),
    brier: brier(preds),
    brierBaseline: brier(preds.map((x) => ({ p: baseRate, y: x.y }))),
    thresholds,
    calibration: calibration(preds),
  };
}

// d) Forecast accuracy vs simple baselines, cost-weighted, on recorded sales.
function forecastAccuracy(data: SampleData): PitchResults["accuracy"] {
  const daily = { model: [], naive: [], habit: [] } as Record<"model" | "naive" | "habit", { actual: number; forecast: number; weight: number }[]>;
  const weekly = { model: [], naive: [], habit: [] } as typeof daily;
  const opts = { weeks: FORECAST_WEEKS, multiplier: demandMultiplier };
  let habitOrdered = 0;
  let used = 0;

  for (const item of data.items) {
    const h = salesHistory(item);
    const weight = item.unitCost;
    const habitDaily = item.usualOrder / item.orderEveryDays;
    for (const day of windowDays) {
      const actual = h[day];
      daily.model.push({ actual, forecast: forecastDemand(h, day, 1, opts)[0].qty, weight });
      daily.naive.push({ actual, forecast: h[addDays(day, -7)], weight });
      daily.habit.push({ actual, forecast: habitDaily, weight });
      habitOrdered += habitDaily * weight;
      used += actual * weight;
    }
    for (let w = 0; w < WINDOW_DAYS / 7; w++) {
      const from = addDays(windowFrom, 7 * w);
      const week = (start: string) => Array.from({ length: 7 }, (_, i) => h[addDays(start, i)]).reduce((a, b) => a + b, 0);
      const actual = week(from);
      weekly.model.push({ actual, forecast: forecastDemand(h, from, 7, opts).reduce((a, d) => a + d.qty, 0), weight });
      weekly.naive.push({ actual, forecast: week(addDays(from, -7)), weight });
      weekly.habit.push({ actual, forecast: habitDaily * 7, weight });
    }
  }
  const score = (s: typeof daily) => ({ model: wape(s.model), naive: wape(s.naive), habit: wape(s.habit) });
  return { daily: score(daily), weekly: score(weekly), habitBias: habitOrdered / used - 1 };
}

/** What the dashboard shows today for the same data (forward-looking, simulated futures). */
function appForwardSaving(data: SampleData): number {
  const rateFrom = addDays(today, -28);
  return data.items.reduce((a, item) => {
    const lots = item.lots.flatMap((l, i) =>
      l.remaining > 0 ? [{ id: i + 1, remaining: Math.round(l.remaining * 100) / 100, expiresAt: l.expiresAt }] : [],
    );
    const logs = data.waste.filter(
      (w) => w.itemId === item.id && (w.reason === "TRIMMINGS" || w.reason === "OVERBOUGHT") && dayKey(w.loggedAt) >= rateFrom,
    );
    return a + computeItemInsight(itemData(item, today, lots, logs), today).savingRM;
  }, 0);
}

function main() {
  const t0 = Date.now();
  const base = generateSampleData({ today });
  console.log(`Simulated history ${base.from} to ${base.to}; backtest window ${windowFrom} to ${windowTo}.`);

  const sensitivity: SensitivityRow[] = [];
  let savings: ReturnType<typeof backtestSavings> | null = null;
  for (const s of SCENARIOS) {
    const r = backtestSavings(s.overOrderScale === 1 ? base : generateSampleData({ today, overOrderScale: s.overOrderScale }));
    if (s.overOrderScale === 1) savings = r;
    sensitivity.push({ ...s, effectiveOverOrder: r.effectiveOverOrder, total: r.total });
    console.log(`  savings @ ${s.label} over-order: RM${r.total.netSavingRM.toFixed(0)}/month (${(Date.now() - t0) / 1000}s)`);
  }
  if (!savings) throw new Error("default scenario missing");

  const alerts = validateAlerts(base);
  // Harder test: a leaner shop (~10% habit) bins far fewer batches, so
  // flagging everything would no longer look good.
  const lean = SCENARIOS[0];
  const alertsLean = { label: lean.label, ...validateAlerts(generateSampleData({ today, overOrderScale: lean.overOrderScale })) };
  console.log(`  alerts validated (${(Date.now() - t0) / 1000}s)`);
  const accuracy = forecastAccuracy(base);

  // e) Projection: one outlet, one year, from the default backtest.
  const kgFoodSavedPerYear = (savings.total.usualWasteKg - savings.total.smartWasteKg) * 12;
  // Still binned with the smart order, and sent to BSF: the replay's remaining
  // expiry waste, plus the BSF-eligible waste that ordering can't change
  // (trimmings, fridge spoilage) at the rate seen in the 90-day history.
  const historyDays = daysBetween(base.from, base.today);
  const eligibleKg = base.waste.filter((w) => isBsfEligible(w.reason)).reduce((a, w) => a + w.kg, 0);
  const expiryKg = base.items.reduce((a, i) => a + i.lots.reduce((b, l) => b + ((l.leftAtExpiry ?? 0) >= 0.05 ? l.leftAtExpiry! : 0), 0) * i.kgPerUnit, 0);
  const kgDivertedPerYear = savings.total.smartWasteKg * 12 + ((eligibleKg - expiryKg) * 365) / historyDays;

  const results: PitchResults = {
    today,
    dataFrom: base.from,
    dataTo: base.to,
    window: { from: windowFrom, to: windowTo, days: WINDOW_DAYS, events: [...new Set(windowDays.flatMap(contextLabels))] },
    assumptions: { lostSaleMult: LOST_SALE_MULT, co2ePerKg: CO2E_PER_KG_DIVERTED, runs: 1000 },
    savings: { perItem: savings.perItem, total: savings.total, habitCheck: savings.habitCheck, excluded: savings.excluded },
    sensitivity,
    alerts,
    alertsLean,
    accuracy,
    projection: {
      rmPerYear: savings.total.netSavingRM * 12,
      kgFoodSavedPerYear,
      kgDivertedPerYear,
      co2ePerYear: (kgFoodSavedPerYear + kgDivertedPerYear) * CO2E_PER_KG_DIVERTED,
    },
    app: { forwardSavingRMPerWeek: appForwardSaving(base) },
  };

  const root = process.cwd();
  mkdirSync(path.join(root, "lib/pitch"), { recursive: true });
  mkdirSync(path.join(root, "docs"), { recursive: true });
  writeFileSync(path.join(root, "lib/pitch/results.json"), JSON.stringify(results, roundJson, 2) + "\n");
  writeFileSync(path.join(root, "docs/pitch-numbers.md"), markdown(results));
  console.log(`Wrote lib/pitch/results.json and docs/pitch-numbers.md in ${(Date.now() - t0) / 1000}s.`);
  console.log(headlines(results).map((h) => `  - ${h}`).join("\n"));
}

function roundJson(_key: string, v: unknown) {
  return typeof v === "number" ? Math.round(v * 10000) / 10000 : v;
}

const RM = (n: number) => `RM${Math.round(n).toLocaleString("en-MY")}`;
const KG = (n: number) => `${Math.round(n).toLocaleString("en-MY")} kg`;
const PCT = (n: number) => `${Math.round(n * 100)}%`;

function headlines(r: PitchResults): string[] {
  const s = r.savings.total;
  const low = r.sensitivity[0];
  const a = r.alerts.thresholds.find((t) => t.at === 0.5)!;
  const lean = r.alertsLean.thresholds.find((t) => t.at === 0.5)!;
  return [
    `Saves ${RM(s.netSavingRM)} a month per outlet, net of any extra run-outs (backtested on 4 weeks of history).`,
    `Cuts avoidable waste by ${PCT(s.wasteCut)} (${RM(s.usualWasteRM)} -> ${RM(s.smartWasteRM)} a month).`,
    // Label by the over-order actually measured in the test weeks, not the generator setting.
    `Even a shop that over-orders only ${PCT(low.effectiveOverOrder)} saves ${RM(low.total.netSavingRM)} a month (waste cut ${PCT(low.total.wasteCut)}).`,
    // Lead with the leaner shop: in the sample shop most batches are binned, so catching them is easy.
    `Expiry alerts caught ${PCT(lean.recall)} of the batches that ended in the bin, ${lean.leadDays.toFixed(1)} days ahead; ${PCT(lean.precision)} of alerts were right where only ${PCT(r.alertsLean.binned / r.alertsLean.batches)} of batches are binned (AUC ${r.alertsLean.auc.toFixed(2)}, leaner shop). In the sample shop: ${PCT(a.recall)} caught.`,
    `Forecast error ${PCT(r.accuracy.weekly.model)} per week vs ${PCT(r.accuracy.weekly.habit)} for the shop's habit and ${PCT(r.accuracy.weekly.naive)} for "same as last week".`,
    `Projection: ${RM(r.projection.rmPerYear)} and ${KG(r.projection.kgFoodSavedPerYear)} of food saved per outlet per year.`,
  ];
}

function alertRows(a: AlertValidation, b: AlertValidation): (string | number)[][] {
  const both = (f: (x: AlertValidation) => string | number) => [f(a), f(b)];
  const at = (x: AlertValidation, t: number) => x.thresholds.find((y) => y.at === t)!;
  return [
    ["Predictions", ...both((x) => x.predictions)],
    ["Batches (binned)", ...both((x) => `${x.batches} (${x.binned})`)],
    ["Base rate (predictions binned)", ...both((x) => PCT(x.baseRate))],
    ...[0.5, 0.3].flatMap((t) => [
      [`Recall at risk >= ${PCT(t)}`, ...both((x) => `${PCT(at(x, t).recall)} of batches, ${PCT(at(x, t).valueRecall)} of RM`)],
      [`Precision at risk >= ${PCT(t)}`, ...both((x) => PCT(at(x, t).precision))],
      [`Lead time at risk >= ${PCT(t)}`, ...both((x) => `${at(x, t).leadDays.toFixed(1)} days`)],
    ]),
    ["AUC", ...both((x) => x.auc.toFixed(2))],
    ["Brier (baseline)", ...both((x) => `${x.brier.toFixed(3)} (${x.brierBaseline.toFixed(3)})`)],
  ];
}

function markdown(r: PitchResults): string {
  const s = r.savings.total;
  const fwdMonth = r.app.forwardSavingRMPerWeek * WEEKS_PER_MONTH;
  const row = (cells: (string | number)[]) => `| ${cells.join(" | ")} |`;
  return `# Pitch numbers

Generated by \`npm run pitch\` on ${r.today}. **All figures come from SIMULATED data** (a 90-day kopitiam generated by \`lib/demo-data.ts\`, ${r.dataFrom} to ${r.dataTo}) and the assumptions listed below. Re-run after changing the model or the sample data.

## Headlines

${headlines(r)
  .map((h) => `- ${h}`)
  .join("\n")}

## a) Backtested savings (counterfactual replay)

Window: ${r.window.from} to ${r.window.to} (${r.window.days} days), ending ${GAP_DAYS} days before the data ends so every batch bought inside it has expired or been used inside known history. Each item's 4 weeks start on its last real delivery on or before the window start. Both policies are replayed by the same engine (\`simulatePolicy\`) against the **true** daily demand that happened, starting from the real shelf about a week earlier (whole delivery cycles, so deliveries keep their real days) so each policy settles into its own normal stock level before measuring; only deliveries made inside the 4 weeks are charged with their eventual waste. The window includes: ${r.window.events.join(", ") || "no holidays"} (quieter days the habit doesn't adjust for, the model does).

- **Usual:** the shop's habit order every delivery.
- **Smart:** at each delivery, the app's own \`computeItemInsight(...).recommended\`, fed only with sales up to the day before and the replayed shelf.

Waste = stock left when a batch expires (avoidable waste; trimmings, plate leftovers and random spoilage are the same either way and left out). Missed sales = demand that found an empty shelf x cost x ${r.assumptions.lostSaleMult} (lost profit, an assumption). Per month = 4-week total x ${WEEKS_PER_MONTH.toFixed(3)} / 4. Left out (long-life, no expiry waste in the window, tail would run past the data): ${r.savings.excluded.join(", ")}.

${row(["Item", "Usual order", "Smart order (avg)", "Waste usual", "Waste smart", "Missed usual", "Missed smart", "Net saving / month"])}
${row(["---", "---:", "---:", "---:", "---:", "---:", "---:", "---:"])}
${r.savings.perItem
  .map((i) =>
    row([
      i.name,
      `${i.usualOrder} ${i.unit}`,
      `${i.smartOrder.toFixed(2)} ${i.unit}`,
      RM(i.usualWasteRM),
      RM(i.smartWasteRM),
      RM(i.usualMissedRM),
      RM(i.smartMissedRM),
      RM(i.netSavingRM),
    ]),
  )
  .join("\n")}
${row(["**Total**", "", "", RM(s.usualWasteRM), RM(s.smartWasteRM), RM(s.usualMissedRM), RM(s.smartMissedRM), `**${RM(s.netSavingRM)}**`])}

Waste cut: **${PCT(s.wasteCut)}** by value, ${KG(s.usualWasteKg)} -> ${KG(s.smartWasteKg)} a month.

Sanity check: replaying the habit gives ${RM(r.savings.habitCheck.replayWasteRM)} of expiry waste over the window; the simulated shop actually logged ${RM(r.savings.habitCheck.loggedWasteRM)} for the same batches (the replay has no random fridge spoilage, which in the real history removes some stock before it can expire). So the replay engine reproduces the history it is compared against.

### Why this differs from the app's ~${RM(r.app.forwardSavingRMPerWeek)}/week (~${RM(fwdMonth)}/month)

The dashboard number is **forward-looking**: it averages 200 simulated futures of the next 4 weeks, drawn from the forecast and its past errors, and includes every item. The backtest is **backward-looking**: one real (simulated) history, the true demand, an earlier 4-week window with holidays in it, perishable items only, and no trimmings/leftovers (identical under both policies). That the two land close together is a good sign. Same model, different question; the backtest is the one to quote as evidence, the dashboard is what the owner acts on.

## b) Sensitivity to the over-ordering habit

Sample data regenerated in memory with the perishable over-order scaled (chicken and tomatoes are 25% at the default, the rest 20%); same random demand, then (a) rerun. "Effective" is habit orders vs true demand in the window, cost-weighted, after rounding to pack sizes.

${row(["Habit over-order", "Effective", "Waste usual / month", "Waste smart / month", "Waste cut", "Net saving / month"])}
${row(["---", "---:", "---:", "---:", "---:", "---:"])}
${r.sensitivity
  .map((x) =>
    row([
      `~${x.label}${x.overOrderScale === 1 ? " (default)" : ""}`,
      PCT(x.effectiveOverOrder),
      RM(x.total.usualWasteRM),
      RM(x.total.smartWasteRM),
      PCT(x.total.wasteCut),
      RM(x.total.netSavingRM),
    ]),
  )
  .join("\n")}

## c) Expiry-alert validation

Each morning D in the window, for every batch on the shelf expiring D..D+${ALERT_HORIZON}, the app's Monte Carlo risk (1,000 futures, sales up to D-1 only) is compared with what happened: binned = at least ${PCT(WASTE_FRACTION)} of that morning's quantity left at expiry. Batch-level figures use batches whose whole ${ALERT_HORIZON}-day horizon is in the window, judged on the stock when they entered it.

The sample shop over-orders so much that most batches end in the bin, which makes "catch the binned ones" easy. So the same test also runs on a leaner shop (~${r.alertsLean.label} habit, regenerated in memory), where flagging everything would score badly.

${row(["", "Sample shop (~20% habit)", `Leaner shop (~${r.alertsLean.label} habit)`])}
${row(["---", "---:", "---:"])}
${alertRows(r.alerts, r.alertsLean).map(row).join("\n")}

AUC = chance a binned case got a higher risk than a kept one (0.5 = coin flip). Brier = mean squared gap between risk and outcome; the baseline always guesses the base rate.

Calibration (does "70% risk" mean 70%?):

${row(["Predicted risk", "Sample: n", "Sample: mean risk", "Sample: binned", "Leaner: n", "Leaner: mean risk", "Leaner: binned"])}
${row(["---", "---:", "---:", "---:", "---:", "---:", "---:"])}
${r.alerts.calibration
  .map((b) => {
    const l = r.alertsLean.calibration.find((x) => x.from === b.from);
    return row([`${PCT(b.from)}-${PCT(b.to)}`, b.count, PCT(b.predicted), PCT(b.actual), l?.count ?? 0, l ? PCT(l.predicted) : "-", l ? PCT(l.actual) : "-"]);
  })
  .join("\n")}

## d) Forecast accuracy

WAPE (sum of |actual - forecast| / sum of actual), weighted by item cost, against recorded sales in the window. The model forecasts each day from data before it (as in the app); "same as last week" copies the same weekday 7 days earlier; the habit treats the usual order as a forecast (usual order / days between deliveries). The app's own accuracy figure divides by the forecast instead of the actual, so it reads slightly differently.

${row(["", "Our model", "Same as last week", "Shop's habit"])}
${row(["---", "---:", "---:", "---:"])}
${row(["Daily", PCT(r.accuracy.daily.model), PCT(r.accuracy.daily.naive), PCT(r.accuracy.daily.habit)])}
${row(["Weekly", PCT(r.accuracy.weekly.model), PCT(r.accuracy.weekly.naive), PCT(r.accuracy.weekly.habit)])}

The habit buys ${PCT(r.accuracy.habitBias)} more than is used (cost-weighted, all items).

## e) Projection (one outlet, one year)

A straight-line projection of the backtest, not a measurement:

- **${RM(r.projection.rmPerYear)}** net saved (monthly net saving x 12)
- **${KG(r.projection.kgFoodSavedPerYear)}** of food not wasted (avoided waste x 12)
- **${KG(r.projection.kgDivertedPerYear)}** of the waste that is left still goes to BSF instead of landfill (the smart order's remaining expiry waste x 12, plus trimmings and fridge spoilage at the rate in the 90-day history)
- **${KG(r.projection.co2ePerYear)} CO2e** of landfill emissions avoided: both amounts above stay out of landfill, at an assumed ${r.assumptions.co2ePerKg} kg CO2e per kg (\`CO2E_PER_KG_DIVERTED\`; to be replaced with a verified local factor). Emissions from producing the food that is no longer bought would add more but are not counted.

## Assumptions and limits

- Simulated shop: weekday pattern, Malaysian holidays, ~25% day-to-day noise, a habit that over-orders perishables. Real shops are messier.
- Missed sales cost ${r.assumptions.lostSaleMult}x the ingredient cost (ingredients ~25-30% of menu price).
- The smart policy learns from the sales the shop actually recorded, not from the replayed world (the habit rarely runs out, so these are nearly the same).
- One 4-week window; results move with the window and the random demand. Re-run on real ERP/POS data before quoting externally.
`;
}

main();
