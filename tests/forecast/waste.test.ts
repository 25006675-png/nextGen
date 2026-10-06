import { describe, expect, it } from "vitest";
import { expectedPolicy, projectLots, simulatePolicy, usableStock } from "@/lib/forecast/waste";
import { recommendOrder } from "@/lib/forecast/demand";
import type { Lot } from "@/lib/forecast/expiry";

const TODAY = "2026-10-06";
const base = { lots: [], demandOn: () => 1, today: TODAY, orderEveryDays: 7, weeks: 4 };
const onShelf = (lots: Lot[]) => lots.reduce((a, l) => a + l.remaining, 0);

describe("simulatePolicy", () => {
  it("wastes the over-order when shelf life is shorter than the delivery cycle", () => {
    // 10 delivered weekly, 1/day used, lot usable for 6 days -> 4 wasted/week
    expect(simulatePolicy({ ...base, shelfLifeDays: 5, orderQty: () => 10 }).wasted).toBeCloseTo(4);
  });

  it("wastes nothing when ordering exactly to demand", () => {
    const r = simulatePolicy({ ...base, shelfLifeDays: 10, orderQty: () => 7 });
    expect(r.wasted).toBeCloseTo(0);
    expect(r.unmet).toBeCloseTo(0);
  });

  it("counts stock-outs when ordering too little", () => {
    expect(simulatePolicy({ ...base, shelfLifeDays: 10, orderQty: () => 5 }).unmet).toBeCloseTo(2);
  });

  it("counts waste of stock bought in the window even when it expires after it", () => {
    // Weekly 10 with 14-day shelf life: 3 extra per week piles up and expires
    // two weeks later; in steady state that is 3/week of waste.
    const r = simulatePolicy({ ...base, shelfLifeDays: 14, orderQty: () => 10, warmupDays: 28, weeks: 8 });
    expect(r.wasted).toBeCloseTo(3, 0);
  });

  it("does not charge the window for stock bought during warm-up", () => {
    const r = simulatePolicy({
      ...base,
      lots: [{ id: 1, remaining: 50, expiresAt: "2026-10-07" }],
      shelfLifeDays: 30,
      orderQty: () => 7,
      warmupDays: 7,
    });
    expect(r.wasted).toBeCloseTo(0);
  });

  it("an order-up-to policy with buffer avoids piling up stock", () => {
    const usual = simulatePolicy({ ...base, orderEveryDays: 3, shelfLifeDays: 4, orderQty: () => 5 }).wasted;
    const smart = simulatePolicy({
      ...base,
      orderEveryDays: 3,
      shelfLifeDays: 4,
      orderQty: (lots) => recommendOrder(3, onShelf(lots), 1, 0.1),
    }).wasted;
    expect(usual).toBeGreaterThan(2);
    expect(smart).toBeLessThan(0.5);
  });

  it("counts already-expired stock and unavoidable waste", () => {
    const r = simulatePolicy({
      ...base,
      weeks: 1,
      lots: [{ id: 1, remaining: 3, expiresAt: "2026-10-01" }],
      shelfLifeDays: 30,
      orderQty: () => 7,
      unavoidableRate: 0.1,
    });
    expect(r.wasted).toBeCloseTo(3 + 0.7);
  });
});

describe("usableStock", () => {
  it("excludes stock that will expire before it can be used", () => {
    // 5 kg expiring today, 1/day demand -> only 1 usable
    expect(usableStock([{ id: 1, remaining: 5, expiresAt: TODAY }], () => 1, TODAY, 3)).toBeCloseTo(1);
  });

  it("counts stock that outlives the window in full", () => {
    expect(usableStock([{ id: 1, remaining: 50, expiresAt: "2026-12-01" }], () => 1, TODAY, 3)).toBe(50);
  });

  it("uses the earliest-expiring lot first", () => {
    const lots = [
      { id: 1, remaining: 2, expiresAt: "2026-10-07" },
      { id: 2, remaining: 4, expiresAt: "2026-10-20" },
    ];
    expect(usableStock(lots, () => 1, TODAY, 3)).toBe(6); // the 2 is used by day 2
  });
});

describe("expectedPolicy", () => {
  const args = { lots: [], pointOn: () => 1, today: TODAY, orderEveryDays: 7, shelfLifeDays: 10, weeks: 4 };

  it("matches the deterministic simulation when there is no forecast error", () => {
    expect(expectedPolicy({ ...args, orderQty: () => 7 }, [1], { runs: 5 }).wasted).toBeCloseTo(0);
  });

  it("noisy demand makes an exact-to-forecast order both waste and run short", () => {
    const r = expectedPolicy({ ...args, shelfLifeDays: 7, orderQty: () => 7 }, [0.6, 1, 1.4], { runs: 200, seed: 5 });
    expect(r.wasted).toBeGreaterThan(0);
    expect(r.unmet).toBeGreaterThan(0);
  });

  it("scales demand for what-if scenarios", () => {
    const r = expectedPolicy({ ...args, orderQty: () => 7 }, [1], { runs: 5, scale: 1.5 });
    expect(r.unmet).toBeCloseTo(3.5);
  });
});

describe("projectLots", () => {
  it("uses stock earliest expiry first and drops lots that expire before the end", () => {
    const lots = [
      { id: 1, remaining: 3, expiresAt: "2026-10-07" },
      { id: 2, remaining: 4, expiresAt: "2026-10-20" },
    ];
    // 2 days at 1/day: both from lot 1, whose last unit expires on the 7th
    expect(projectLots(lots, () => 1, TODAY, 2)).toEqual([{ id: 2, remaining: 4, expiresAt: "2026-10-20" }]);
  });

  it("leaves the shelf unchanged for zero days", () => {
    const lots = [{ id: 1, remaining: 5, expiresAt: "2026-10-09" }];
    expect(projectLots(lots, () => 1, TODAY, 0)).toEqual(lots);
  });
});
