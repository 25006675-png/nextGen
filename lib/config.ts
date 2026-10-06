export const APP_NAME = "LarvaLoop";
export const BUSINESS_NAME = "Kopitiam Ah Seng";

export const REASONS = ["EXPIRED", "SPOILED", "OVERBOUGHT", "TRIMMINGS"] as const;
export type Reason = (typeof REASONS)[number];

export const REASON_LABELS: Record<Reason, string> = {
  EXPIRED: "Expired",
  SPOILED: "Spoiled",
  OVERBOUGHT: "Over-bought / leftover",
  TRIMMINGS: "Trimmings",
};

export const ITEM_UNITS = ["kg", "pcs", "L"] as const;

// Starting settings for items added from the Log waste screen. The owner can
// fine-tune them later; the models need a few weeks of sales data either way.
export const ITEM_CATEGORIES = {
  produce: { label: "Vegetables & fruit", shelfLifeDays: 4, orderEveryDays: 3 },
  meat: { label: "Meat", shelfLifeDays: 4, orderEveryDays: 3 },
  seafood: { label: "Seafood", shelfLifeDays: 3, orderEveryDays: 3 },
  dairy: { label: "Dairy & eggs", shelfLifeDays: 7, orderEveryDays: 7 },
  chilled: { label: "Noodles, tofu & chilled", shelfLifeDays: 4, orderEveryDays: 3 },
  bakery: { label: "Bread & cakes", shelfLifeDays: 3, orderEveryDays: 2 },
  dry: { label: "Dry goods & sauces", shelfLifeDays: 180, orderEveryDays: 7 },
} as const;
export type ItemCategory = keyof typeof ITEM_CATEGORIES;

// Expired raw items, spoiled produce and trimmings are clean BSF feedstock.
// Over-bought cooked leftovers are not (mixed / possibly contaminated).
export function isBsfEligible(reason: Reason): boolean {
  return reason !== "OVERBOUGHT";
}

export const BSF_PICKUP_THRESHOLD_KG = 20;
export const BSF_PARTNER_FARM = "Partner BSF Farm, Semenyih (demo)";
// Demo supplier the order messages are addressed to.
export const SUPPLIER_NAME = "Ah Huat Supplies";
// Credit paid back per kg collected when the SME chooses credit over frass.
export const BSF_CREDIT_PER_KG = 0.1;
// Rough frass yield: ~20% of feedstock mass comes back as frass fertiliser.
export const FRASS_YIELD = 0.2;

// kg CO2e avoided per kg of food waste diverted from landfill to BSF.
// ASSUMPTION for the demo: conservative figure in the range reported for
// landfilled food waste methane emissions (~0.5–1.9 kg CO2e/kg). Replace
// with a verified local factor before using the report externally.
export const CO2E_PER_KG_DIVERTED = 0.5;

// Targets for the next reporting period shown in the ESG report. These are
// the business's own commitments; demo values until the SME sets them.
export const ESG_TARGETS = {
  wasteReduction: 0.2, // kg wasted per kg bought, vs the baseline period
  diversionRate: 0.8, // share of food waste sent to BSF instead of landfill
  photoEvidence: 0.9, // share of waste logs backed by a photo
};

// Profit lost when a dish can't be sold because an ingredient ran out, as a
// multiple of the ingredient's cost. ASSUMPTION: ingredients are ~25-30% of
// menu price, so a missed sale loses ~3x the ingredient cost. Drives how big
// each item's safety buffer is (newsvendor rule) and the 3D cost landscape.
export const LOST_SALE_MULT = 3;
export const FORECAST_WEEKS = 4; // weeks of history in the moving average
