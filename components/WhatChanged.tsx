import Link from "next/link";
import { ArrowRight, CheckCircle2, Hourglass, Recycle, ShoppingCart, Trash2, Wallet, X } from "lucide-react";
import type { LogChange } from "@/app/actions";
import { qty, rm } from "@/lib/format";

type Tone = "good" | "bad" | "neutral";
type Row = { label: string; icon: React.ReactNode; before: string; after: string; delta: string; tone: Tone };

const TONES: Record<Tone, string> = {
  good: "bg-brand-soft text-brand-strong",
  bad: "bg-loss-soft text-loss",
  neutral: "bg-canvas text-muted",
};

const sign = (d: number) => (d > 0 ? "+" : "−");
const lowerIsBetter = (d: number): Tone => (d < 0 ? "good" : "bad");
const neutral = (): Tone => "neutral";
// Small moves keep their sen so the row doesn't read "RM643 → RM643".
const moneyDigits = (before: number, after: number) => (Math.abs(after - before) < 10 ? 2 : 0);

/**
 * A before → after row. Values are rounded to what is shown first, so the
 * delta always matches the two numbers; null when nothing visibly moved.
 */
function row(
  label: string,
  icon: React.ReactNode,
  [before, after]: [number, number],
  digits: number,
  fmt: (n: number) => string,
  tone: (d: number) => Tone,
  deltaFmt = fmt,
): Row | null {
  const round = (n: number) => Math.round(n * 10 ** digits) / 10 ** digits;
  const [b, a] = [round(before), round(after)];
  if (b === a) return null;
  const d = round(a - b);
  return { label, icon, before: fmt(b), after: fmt(a), delta: `${sign(d)}${deltaFmt(Math.abs(d))}`, tone: tone(d) };
}

/** Shown after a waste log: what the new entry moved, shop-wide and for the item. */
export function WhatChanged({ change, message, onClose }: { change: LogChange; message: string; onClose: () => void }) {
  const { itemId, before: b, after: a } = change;
  const lostDigits = moneyDigits(b.lostRM, a.lostRM);
  const riskDigits = moneyDigits(b.itemAtRiskRM, a.itemAtRiskRM);
  const kgs = (n: number) => `${n.toLocaleString("en-MY", { maximumFractionDigits: 1 })} kg`;

  const shop = [
    row("Lost to waste (last 30 days)", <Trash2 size={16} />, [b.lostRM, a.lostRM], lostDigits, (n) => rm(n, lostDigits), lowerIsBetter),
    row("BSF pickup pile", <Recycle size={16} />, [b.bsfOpenKg, a.bsfOpenKg], 1, kgs, neutral),
  ].filter((r) => r !== null);
  const item = [
    // Percent changes read as points, not a relative change.
    row("Expiry risk", <Hourglass size={16} />, [b.itemRisk * 100, a.itemRisk * 100], 0, (n) => `${n}%`, lowerIsBetter, (n) => `${n} pts`),
    row("Money still at risk", <Wallet size={16} />, [b.itemAtRiskRM, a.itemAtRiskRM], riskDigits, (n) => rm(n, riskDigits), lowerIsBetter),
    row("Next order", <ShoppingCart size={16} />, [b.nextOrder, a.nextOrder], 1, (n) => qty(n, a.unit), neutral),
  ].filter((r) => r !== null);

  return (
    <section role="status" className="overflow-hidden rounded-2xl border border-brand/25 bg-surface shadow-sm">
      <div className="flex items-start gap-2.5 bg-brand-soft px-4 py-3 text-brand-strong">
        <CheckCircle2 size={20} className="mt-0.5 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="font-semibold">Saved</div>
          <p className="text-sm">{message}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-mr-1.5 -mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full active:bg-brand/10"
        >
          <X size={18} />
        </button>
      </div>

      <div className="px-4 pb-4 pt-3">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted">What changed</h2>
        {shop.length + item.length === 0 ? (
          <p className="mt-2 text-sm text-muted">No totals or forecasts moved with this entry.</p>
        ) : (
          <>
            <Group title="Whole shop" rows={shop} />
            <Group title={a.itemName} rows={item} />
          </>
        )}
        <p className="mt-3 text-xs text-muted">
          {item.length > 0
            ? "Expiry risk and next order are re-forecast from the updated stock."
            : `No change to ${a.itemName} expiry risk or next order.`}{" "}
          Demo data is simulated.
        </p>

        <div className="mt-4 grid grid-cols-2 gap-2">
          <Link
            href="/insights"
            className="rounded-xl border border-line py-2.5 text-center text-sm font-semibold active:bg-canvas"
          >
            See dashboard
          </Link>
          <Link
            href={`/order?why=${itemId}`}
            className="flex items-center justify-center gap-1 rounded-xl bg-brand py-2.5 text-sm font-semibold text-white active:bg-brand-strong"
          >
            See smart order
            <ArrowRight size={16} />
          </Link>
        </div>
      </div>
    </section>
  );
}

function Group({ title, rows }: { title: string; rows: Row[] }) {
  if (rows.length === 0) return null;
  return (
    <div className="mt-3">
      <div className="mb-1 text-sm font-semibold">{title}</div>
      <ul className="divide-y divide-line">
        {rows.map((r) => (
          <li key={r.label} className="flex items-center gap-3 py-2.5">
            <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-canvas text-muted">{r.icon}</span>
            <div className="min-w-0 flex-1">
              <div className="text-xs text-muted">{r.label}</div>
              <div className="num flex flex-wrap items-baseline gap-x-1.5">
                <span className="text-sm text-muted">{r.before}</span>
                <ArrowRight size={14} className="shrink-0 self-center text-muted" />
                <span className="font-semibold">{r.after}</span>
              </div>
            </div>
            <span className={`num shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${TONES[r.tone]}`}>
              {r.delta}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
