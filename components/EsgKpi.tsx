import { ArrowDownRight, ArrowUpRight } from "lucide-react";

/** Headline figure for the ESG summary and report. `change` is a fraction vs the first 30 days of records. */
export function EsgKpi({
  label,
  value,
  hint,
  change,
  lowerIsBetter = false,
  className = "",
}: {
  label: string;
  value: string;
  hint?: string;
  change?: number;
  lowerIsBetter?: boolean;
  className?: string;
}) {
  const good = change !== undefined && (lowerIsBetter ? change <= 0 : change >= 0);
  const Arrow = change !== undefined && change < 0 ? ArrowDownRight : ArrowUpRight;
  return (
    <div className={`rounded-2xl border border-line bg-surface p-4 ${className}`}>
      <div className="text-xs font-medium text-muted">{label}</div>
      <div className="num mt-1 text-2xl font-bold tracking-tight">{value}</div>
      {change !== undefined && (
        <div className={`num mt-1 flex items-center gap-0.5 text-xs font-semibold ${good ? "text-brand" : "text-loss"}`}>
          <Arrow size={14} />
          {Math.abs(Math.round(change * 100))}% vs first 30 days
        </div>
      )}
      {hint && <div className="mt-0.5 text-xs text-muted">{hint}</div>}
    </div>
  );
}
