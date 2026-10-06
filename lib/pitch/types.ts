// Shape of lib/pitch/results.json, written by `npm run pitch` (slide numbers).
// Money is RM and food is kg; "per month" = per week x 52.18 / 12.

import type { CalibrationBin } from "./replay";

export type ItemSaving = {
  name: string;
  unit: string;
  usualOrder: number; // habit, per delivery
  smartOrder: number; // average smart delivery in the replay
  usualWasteRM: number; // per month
  smartWasteRM: number;
  usualWasteKg: number;
  smartWasteKg: number;
  usualMissedRM: number; // lost profit from run-outs
  smartMissedRM: number;
  netSavingRM: number; // (waste + missed) usual minus smart
};

export type SavingsTotal = Omit<ItemSaving, "name" | "unit" | "usualOrder" | "smartOrder"> & {
  wasteCut: number; // share of avoidable waste RM removed
};

export type SensitivityRow = {
  label: string; // "10%"
  overOrderScale: number;
  effectiveOverOrder: number; // habit orders vs real demand, cost-weighted, after pack rounding
  total: SavingsTotal;
};

export type AlertThreshold = {
  at: number; // risk threshold
  recall: number; // binned batches flagged beforehand
  precision: number; // flagged batches that did end in the bin
  valueRecall: number; // share of the binned RM that was flagged
  leadDays: number; // average days before expiry of the first flag (caught batches)
};

export type AlertValidation = {
  batches: number; // with their whole 3-day horizon inside the window
  binned: number;
  predictions: number;
  baseRate: number; // share of predictions whose batch ended in the bin
  auc: number; // chance a binned prediction got a higher risk than a kept one
  brier: number;
  brierBaseline: number; // always predicting the base rate
  thresholds: AlertThreshold[];
  calibration: CalibrationBin[];
};

export type PitchResults = {
  today: string;
  dataFrom: string;
  dataTo: string;
  window: { from: string; to: string; days: number; events: string[] }; // holidays etc. inside it
  assumptions: { lostSaleMult: number; co2ePerKg: number; runs: number };
  savings: {
    perItem: ItemSaving[];
    total: SavingsTotal;
    habitCheck: { replayWasteRM: number; loggedWasteRM: number }; // window totals, habit replay vs logged
    excluded: string[]; // long-life items left out of the replay
  };
  sensitivity: SensitivityRow[];
  alerts: AlertValidation; // on the app's sample data
  alertsLean: AlertValidation & { label: string }; // same test, shop with a ~10% habit
  accuracy: {
    daily: { model: number; naive: number; habit: number };
    weekly: { model: number; naive: number; habit: number };
    habitBias: number; // habit orders vs actual use, cost-weighted (+ = over)
  };
  projection: {
    rmPerYear: number;
    kgFoodSavedPerYear: number;
    kgDivertedPerYear: number; // what is still binned, sent to BSF
    co2ePerYear: number; // landfill emissions avoided: (saved + diverted) x CO2E_PER_KG_DIVERTED
  };
  app: { forwardSavingRMPerWeek: number }; // what the dashboard shows today
};
