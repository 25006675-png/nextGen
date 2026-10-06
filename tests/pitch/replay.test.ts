import { describe, expect, it } from "vitest";
import { generateSampleData, type SampleItem } from "@/lib/demo-data";
import { addDays } from "@/lib/dates";
import {
  auc,
  brier,
  calibration,
  lastDeliveryOnOrBefore,
  lotLeftAt,
  replayPolicy,
  salesBefore,
  shelfAt,
  wape,
  warmupFor,
} from "@/lib/pitch/replay";

const START = "2026-09-01";
const days = (n: number) => Array.from({ length: n }, (_, i) => addDays(START, i));

/** A hand-made item: 1/day demand for 60 days, delivered every 2 days, 2-day shelf life. */
function toyItem(over: Partial<SampleItem> = {}): SampleItem {
  return {
    id: 1,
    name: "Toy",
    unit: "kg",
    category: "produce",
    unitCost: 10,
    shelfLifeDays: 2,
    orderEveryDays: 2,
    packSize: 1,
    kgPerUnit: 1,
    usualOrder: 3,
    deliveryDays: days(30).filter((_, i) => i % 2 === 0),
    lots: [],
    usages: days(60).map((day) => ({ day, qty: 1 })),
    demand: Object.fromEntries(days(60).map((d) => [d, 1])),
    ...over,
  };
}

describe("history at a past day", () => {
  const lot = { qty: 5, remaining: 0, unitCost: 10, purchasedAt: START, expiresAt: addDays(START, 2), trail: [4, 3, 0], leftAtExpiry: 2 };

  it("reads a lot's end-of-day quantity from its trail", () => {
    expect(lotLeftAt(lot, addDays(START, -1))).toBeUndefined(); // not bought yet
    expect(lotLeftAt(lot, START)).toBe(4);
    expect(lotLeftAt(lot, addDays(START, 1))).toBe(3);
    expect(lotLeftAt(lot, addDays(START, 5))).toBe(0); // long expired
  });

  it("puts only lots bought before the day, unexpired and not empty, on that morning's shelf", () => {
    const item = toyItem({ lots: [lot] });
    expect(shelfAt(item, START)).toEqual([]); // delivered that morning, not yet on the app's shelf
    expect(shelfAt(item, addDays(START, 1))).toEqual([{ id: 1, remaining: 4, expiresAt: addDays(START, 2) }]);
    expect(shelfAt(item, addDays(START, 3))).toEqual([]); // expired
  });

  it("only gives the model sales from before the day", () => {
    const sales = salesBefore(toyItem(), addDays(START, 10));
    expect(sales).toHaveLength(10);
  });

  it("finds the last real delivery on or before a day", () => {
    expect(lastDeliveryOnOrBefore(toyItem(), addDays(START, 5))).toBe(addDays(START, 4));
  });
});

describe("replayPolicy", () => {
  it("charges the over-order of every delivery in the window as waste", () => {
    // 3 delivered every 2 days, 2 used before it expires -> 1 wasted per delivery, 14 deliveries in 4 weeks
    const r = replayPolicy(toyItem(), addDays(START, 8), () => 3, { warmupDays: 8 });
    expect(r.wasted).toBeCloseTo(14);
    expect(r.unmet).toBeCloseTo(0);
  });

  it("counts run-outs when ordering too little", () => {
    const r = replayPolicy(toyItem(), addDays(START, 8), () => 1, { warmupDays: 8 });
    expect(r.unmet).toBeCloseTo(14);
    expect(r.wasted).toBeCloseTo(0);
  });

  it("refuses to make up demand it doesn't have", () => {
    const item = toyItem({ demand: Object.fromEntries(days(20).map((d) => [d, 1])) });
    expect(() => replayPolicy(item, START, () => 3)).toThrow(/no demand data/);
  });

  it("warms up for whole delivery cycles of at least a week", () => {
    expect(warmupFor(2)).toBe(8);
    expect(warmupFor(3)).toBe(9);
    expect(warmupFor(7)).toBe(7);
  });
});

describe("scores", () => {
  it("WAPE weights errors by cost", () => {
    expect(wape([{ actual: 10, forecast: 8 }])).toBeCloseTo(0.2);
    expect(wape([{ actual: 10, forecast: 8, weight: 1 }, { actual: 10, forecast: 10, weight: 3 }])).toBeCloseTo(0.05);
  });

  it("Brier is 0 for perfect and 1 for confidently wrong", () => {
    expect(brier([{ p: 1, y: true }, { p: 0, y: false }])).toBe(0);
    expect(brier([{ p: 0, y: true }])).toBe(1);
  });

  it("AUC is 1 when every binned case outranks every kept one", () => {
    expect(auc([{ p: 0.9, y: true }, { p: 0.2, y: false }, { p: 0.6, y: true }])).toBe(1);
    expect(auc([{ p: 0.5, y: true }, { p: 0.5, y: false }])).toBe(0.5);
  });

  it("calibration compares mean risk with how often it happened, per bin", () => {
    const bins = calibration([
      { p: 0.95, y: true },
      { p: 0.95, y: false },
      { p: 0.05, y: false },
      { p: 1, y: true },
    ]);
    expect(bins).toHaveLength(2);
    expect(bins[1]).toMatchObject({ from: 0.9, to: 1, count: 3 });
    expect(bins[1].actual).toBeCloseTo(2 / 3);
  });
});

describe("generateSampleData", () => {
  const today = "2026-10-06";

  it("is deterministic and never sells more than demand", () => {
    const a = generateSampleData({ today });
    expect(generateSampleData({ today }).waste.length).toBe(a.waste.length);
    for (const item of a.items) for (const u of item.usages) expect(u.qty).toBeLessThanOrEqual(item.demand[u.day] + 0.005);
  });

  it("keeps the same true demand when only the ordering habit changes", () => {
    const base = generateSampleData({ today });
    const lean = generateSampleData({ today, overOrderScale: 0.5 });
    expect(lean.items.map((i) => i.demand)).toEqual(base.items.map((i) => i.demand));
    const chicken = (d: typeof base) => d.items.find((i) => i.name === "Chicken")!.usualOrder;
    expect(chicken(lean)).toBeLessThan(chicken(base));
  });

  it("records each lot's trail up to its expiry", () => {
    const { items } = generateSampleData({ today });
    const lot = items[0].lots[3];
    expect(lot.trail.at(-1)).toBe(0); // emptied (used or binned) on its expiry day
    expect(lot.leftAtExpiry).toBeGreaterThanOrEqual(0);
  });
});
