import { describe, expect, it } from "vitest";
import { backtest, coverFactor, mulberry32, quantile, serviceLevel } from "@/lib/forecast/uncertainty";
import { addDays } from "@/lib/dates";

const TODAY = "2026-10-06";

describe("backtest", () => {
  it("has zero error on a perfectly repeating weekly pattern", () => {
    const h: Record<string, number> = {};
    for (let i = 1; i <= 70; i++) h[addDays(TODAY, -i)] = [10, 12, 8, 9, 15, 20, 18][i % 7];
    const bt = backtest(h, TODAY, { days: 28 });
    expect(bt.points).toHaveLength(28);
    expect(bt.error).toBeCloseTo(0);
    expect(bt.ratios.every((r) => Math.abs(r - 1) < 1e-9)).toBe(true);
  });

  it("measures error as actual vs forecast made only from earlier days", () => {
    const h: Record<string, number> = {};
    for (let i = 1; i <= 70; i++) h[addDays(TODAY, -i)] = 10;
    h[addDays(TODAY, -1)] = 15; // yesterday was 50% busier than usual
    const bt = backtest(h, TODAY, { days: 7 });
    expect(bt.points.at(-1)).toEqual({ date: addDays(TODAY, -1), actual: 15, forecast: 10 });
    expect(bt.ratios.at(-1)).toBeCloseTo(1.5);
  });

  it("falls back to a default spread with too little history", () => {
    expect(backtest({}, TODAY).ratios).toEqual([0.8, 0.9, 1, 1.1, 1.2]);
  });
});

describe("quantile", () => {
  it("interpolates", () => {
    expect(quantile([1, 2, 3, 4, 5], 0.5)).toBe(3);
    expect(quantile([1, 2, 3, 4, 5], 0.9)).toBeCloseTo(4.6);
  });
});

describe("serviceLevel", () => {
  it("is lower for perishables (excess spoils) than long-life goods", () => {
    const perishable = serviceLevel(3, 3, 3); // 3 / (3 + 1)
    const longLife = serviceLevel(365, 7, 3);
    expect(perishable).toBeCloseTo(0.75);
    expect(longLife).toBeGreaterThan(0.95);
  });
});

describe("coverFactor", () => {
  it("is 1 with no forecast error", () => {
    expect(coverFactor([1], 3, 0.9, mulberry32(1))).toBe(1);
  });

  it("grows with service level and error spread", () => {
    const noisy = [0.6, 0.8, 1, 1.2, 1.4];
    const f75 = coverFactor(noisy, 3, 0.75, mulberry32(1));
    const f95 = coverFactor(noisy, 3, 0.95, mulberry32(1));
    expect(f75).toBeGreaterThan(1);
    expect(f95).toBeGreaterThan(f75);
  });
});
