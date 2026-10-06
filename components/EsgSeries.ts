import { PALETTE } from "@/lib/palette";

// Where food waste went, in stack order. Green / amber / brick stay distinct
// for colour-blind readers; tables next to the charts carry the values.
export const ESG_SERIES = [
  { key: "divertedKg", label: "Sent to BSF farm", color: PALETTE.green },
  { key: "awaitingKg", label: "Awaiting pickup", color: PALETTE.amber },
  { key: "disposalKg", label: "General waste", color: PALETTE.loss },
] as const;
