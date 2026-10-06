import { addDays, daysBetween } from "../dates";
import { mulberry32 } from "./uncertainty";

export type Lot = { id: number; remaining: number; expiresAt: string };
export type LotRisk = Lot & {
  risk: number; // probability (share of simulated futures) the lot has stock left at expiry
  expectedLeftover: number; // mean qty left at expiry across futures
  paths?: number[][]; // per future: lot qty at start, then after each day until expiry
  wasted?: boolean[]; // per future: did this lot end with stock left?
};

// Leftover under 5% of the lot counts as used up (a few scraps, not real waste).
const WASTE_FRACTION = 0.05;

/**
 * Monte Carlo expiry risk. Each future draws daily demand as the point
 * forecast times a random backtest error ratio, then uses stock earliest
 * expiry first (FEFO). A lot is wasted in a future if stock is left at the
 * end of its expiry day; risk = share of futures where that happens.
 */
export function simulateExpiryRisk(
  lots: Lot[],
  pointOn: (day: string) => number,
  today: string,
  ratios: number[],
  { runs = 1000, seed = 1, keepPaths = false } = {},
): LotRisk[] {
  const rng = mulberry32(seed);
  const live = lots.filter((l) => l.remaining > 0).sort((a, b) => a.expiresAt.localeCompare(b.expiresAt));
  const expIdx = live.map((l) => daysBetween(today, l.expiresAt));
  const nDays = Math.max(0, ...expIdx) + 1;
  const points = Array.from({ length: nDays }, (_, i) => pointOn(addDays(today, i)));

  const leftoverSum = live.map(() => 0);
  const wasteCount = live.map(() => 0);
  const paths: number[][][] = live.map(() => []);
  const wastedFlags: boolean[][] = live.map(() => []);

  for (let r = 0; r < runs; r++) {
    const left = live.map((l) => l.remaining);
    const path = live.map((l) => [round2(l.remaining)]);
    const record = (j: number) => {
      const isWaste = left[j] >= live[j].remaining * WASTE_FRACTION && left[j] > 0;
      if (isWaste) {
        wasteCount[j]++;
        leftoverSum[j] += left[j];
      }
      if (keepPaths) wastedFlags[j].push(isWaste);
      left[j] = 0;
    };

    for (let j = 0; j < live.length; j++) if (expIdx[j] < 0) record(j); // already past expiry

    for (let i = 0; i < nDays; i++) {
      let demand = points[i] * ratios[Math.floor(rng() * ratios.length)];
      for (let j = 0; j < live.length && demand > 0; j++) {
        if (left[j] <= 0 || expIdx[j] < i) continue;
        const take = Math.min(left[j], demand);
        left[j] -= take;
        demand -= take;
      }
      for (let j = 0; j < live.length; j++) {
        if (expIdx[j] < i) continue;
        if (keepPaths) path[j].push(round2(left[j]));
        if (expIdx[j] === i) record(j);
      }
    }
    if (keepPaths) for (let j = 0; j < live.length; j++) if (expIdx[j] >= 0) paths[j].push(path[j]);
  }

  return live.map((l, j) => ({
    ...l,
    risk: wasteCount[j] / runs,
    expectedLeftover: leftoverSum[j] / runs,
    ...(keepPaths ? { paths: paths[j], wasted: wastedFlags[j] } : {}),
  }));
}

function round2(n: number) {
  return Math.round(n * 100) / 100;
}
