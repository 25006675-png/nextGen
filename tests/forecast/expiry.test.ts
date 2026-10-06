import { describe, expect, it } from "vitest";
import { simulateExpiryRisk } from "@/lib/forecast/expiry";

const TODAY = "2026-10-06";
const EXACT = [1]; // no forecast error -> deterministic futures

describe("simulateExpiryRisk", () => {
  it("is certain waste when demand can't use the lot before expiry", () => {
    // 10 kg usable today, +1, +2; demand 1 kg/day -> 7 kg left in every future
    const [r] = simulateExpiryRisk([{ id: 1, remaining: 10, expiresAt: "2026-10-08" }], () => 1, TODAY, EXACT, { runs: 50 });
    expect(r.risk).toBe(1);
    expect(r.expectedLeftover).toBeCloseTo(7);
  });

  it("uses the earliest-expiring lot first (FEFO)", () => {
    const risks = simulateExpiryRisk(
      [
        { id: 2, remaining: 5, expiresAt: "2026-10-20" },
        { id: 1, remaining: 3, expiresAt: "2026-10-07" },
      ],
      () => 2,
      TODAY,
      EXACT,
      { runs: 50 },
    );
    const byId = Object.fromEntries(risks.map((r) => [r.id, r]));
    expect(byId[1].risk).toBe(0); // 2 today + 1 tomorrow
    expect(byId[2].risk).toBe(0);
  });

  it("treats already expired stock as certain waste", () => {
    const [r] = simulateExpiryRisk([{ id: 1, remaining: 4, expiresAt: "2026-10-01" }], () => 10, TODAY, EXACT, { runs: 10 });
    expect(r.risk).toBe(1);
  });

  it("turns forecast error into a probability", () => {
    // 3 kg over 3 days with demand 1/day on average: busy futures use it all,
    // quiet ones leave some -> risk strictly between 0 and 1.
    const [r] = simulateExpiryRisk([{ id: 1, remaining: 3, expiresAt: "2026-10-08" }], () => 1, TODAY, [0.7, 1, 1.3], {
      runs: 1000,
      seed: 7,
    });
    expect(r.risk).toBeGreaterThan(0.2);
    expect(r.risk).toBeLessThan(0.8);
  });

  it("keeps one path per future that ends at expiry", () => {
    const [r] = simulateExpiryRisk([{ id: 1, remaining: 5, expiresAt: "2026-10-08" }], () => 1, TODAY, EXACT, {
      runs: 20,
      keepPaths: true,
    });
    expect(r.paths).toHaveLength(20);
    expect(r.paths![0]).toEqual([5, 4, 3, 2]); // start + 3 days
    expect(r.wasted!.every(Boolean)).toBe(true);
  });

  it("is reproducible for the same seed", () => {
    const run = () =>
      simulateExpiryRisk([{ id: 1, remaining: 3, expiresAt: "2026-10-08" }], () => 1, TODAY, [0.5, 1, 1.5], { seed: 3 })[0].risk;
    expect(run()).toBe(run());
  });
});
