// LarvaLoop "Forest Loop Bright" palette for charts (canvas, Recharts, Plotly
// can't read CSS variables). Keep in sync with the @theme block in app/globals.css.
export const PALETTE = {
  page: "#f7faf2",
  surface: "#ffffff",
  line: "#dde6d6",
  ink: "#0e1f17",
  muted: "#4a5e50",
  green: "#2f6b3f",
  forest: "#1f4d36",
  mint: "#e9f3dc",
  lime: "#c8f25a",
  limeDeep: "#9bcb3c",
  amber: "#f2b544",
  amberText: "#b45309",
  cream: "#fff6dc",
  larva: "#f1e6bf",
  larvaLine: "#cdbe8e",
  loss: "#b4432f", // money lost (LarvaLoop has no red; muted brick)
} as const;

/** rgba() string from a #rrggbb palette colour. */
export function alpha(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a})`;
}
