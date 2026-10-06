import { describe, expect, it } from "vitest";
import { forecastDemand, recommendOrder, sumQty } from "@/lib/forecast/demand";
import { addDays } from "@/lib/dates";

// 2026-10-05 is a Monday.
const MON = "2026-10-05";

function history(weeks: number, perDow: number[]): Record<string, number> {
  const h: Record<string, number> = {};
  const start = addDays(MON, -7 * weeks);
  for (let i = 0; i < weeks * 7; i++) h[addDays(start, i)] = perDow[i % 7];
  return h;
}

describe("forecastDemand", () => {
  it("averages the same weekday over the last N weeks", () => {
    const h = history(4, [10, 10, 10, 10, 20, 30, 30]); // Mon..Sun
    const f = forecastDemand(h, MON, 7);
    expect(f.map((d) => d.qty)).toEqual([10, 10, 10, 10, 20, 30, 30]);
    expect(sumQty(f)).toBe(120);
  });

  it("uses only the most recent weeks", () => {
    const h = history(8, [10, 10, 10, 10, 10, 10, 10]);
    for (let i = 1; i <= 4; i++) h[addDays(MON, -7 * i)] = 18; // recent Mondays higher
    expect(forecastDemand(h, MON, 1, { weeks: 4 })[0].qty).toBe(18);
  });

  it("removes past holiday dips and applies upcoming holiday effects", () => {
    const h = history(4, [10, 10, 10, 10, 10, 10, 10]);
    const pastHoliday = addDays(MON, -7);
    h[pastHoliday] = 5; // holiday halved demand last Monday
    const futureHoliday = addDays(MON, 1);
    const mult = (d: string) => (d === pastHoliday || d === futureHoliday ? 0.5 : 1);
    const f = forecastDemand(h, MON, 2, { multiplier: mult });
    expect(f[0].qty).toBe(10); // holiday dip did not drag Monday down
    expect(f[1].qty).toBe(5); // Tuesday holiday forecast halved
  });

  it("returns 0 with no history", () => {
    expect(forecastDemand({}, MON, 3).every((d) => d.qty === 0)).toBe(true);
  });
});

describe("recommendOrder", () => {
  it("adds buffer, subtracts stock and rounds up to pack size", () => {
    // 20 * 1.1 - 4 = 18 -> packs of 5 -> 20
    expect(recommendOrder(20, 4, 5, 0.1)).toBe(20);
    // 7.3 * 1.1 = 8.03 -> 9 in 1 kg packs
    expect(recommendOrder(7.3, 0, 1, 0.1)).toBe(9);
  });

  it("never goes negative when stock covers demand", () => {
    expect(recommendOrder(10, 50, 1)).toBe(0);
  });
});
