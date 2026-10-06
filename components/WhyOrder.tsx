"use client";

import { useEffect, useRef, useState } from "react";
import { Hourglass, LineChart, Lightbulb, Loader2, ShieldCheck, ShoppingCart, Wallet, X } from "lucide-react";
import type { WhyData, WhyTakeaway } from "@/lib/queries";
import { LOST_SALE_MULT } from "@/lib/config";
import { pct } from "@/lib/format";
import { ForecastBand } from "./ForecastBand";
import { FuturesChart } from "./FuturesChart";
import { WasteLandscape } from "./WasteLandscape";

const ICONS: Record<WhyTakeaway["kind"], typeof Wallet> = {
  order: ShoppingCart,
  money: Wallet,
  forecast: LineChart,
  buffer: ShieldCheck,
  expiry: Hourglass,
};

// Panels re-open instantly once loaded (the server caches too, until data changes).
const loaded = new Map<number, WhyData>();

/** "Why this order?" button for an Order card, opening that item's reasoning panel. */
export function WhyOrder({ itemId, name, autoOpen = false }: { itemId: number; name: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(autoOpen);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-brand/30 bg-brand-soft px-3 py-1.5 text-xs font-semibold text-brand-strong transition hover:border-brand"
      >
        <Lightbulb size={14} /> Why this order?
      </button>
      {open && <WhyPanel itemId={itemId} name={name} onClose={() => setOpen(false)} />}
    </>
  );
}

function WhyPanel({ itemId, name, onClose }: { itemId: number; name: string; onClose: () => void }) {
  const [data, setData] = useState<WhyData | null>(loaded.get(itemId) ?? null);
  const [error, setError] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (data) return;
    let cancelled = false;
    fetch(`/api/why/${itemId}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(r.status)))
      .then((d: WhyData) => {
        loaded.set(itemId, d);
        if (!cancelled) setData(d);
      })
      .catch(() => !cancelled && setError(true));
    return () => {
      cancelled = true;
    };
  }, [itemId, data]);

  // Behave like a dialog: Esc closes, the page behind doesn't scroll, focus starts on Close.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", onKey);
    const overflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    closeRef.current?.focus();
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = overflow;
    };
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[2px]" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`why-${itemId}`}
        onClick={(e) => e.stopPropagation()}
        className="why-sheet fixed inset-x-0 bottom-0 max-h-[92dvh] overflow-y-auto rounded-t-3xl bg-surface shadow-2xl md:inset-x-auto md:bottom-auto md:left-1/2 md:top-1/2 md:max-h-[88vh] md:w-[min(980px,calc(100vw-48px))] md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl"
      >
        <div className="sticky top-0 z-10 border-b border-line bg-surface/95 px-4 pb-3 pt-2 backdrop-blur md:px-6 md:pt-4">
          <div className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line md:hidden" />
          <div className="flex items-start justify-between gap-3">
            <div>
              <div className="text-xs font-semibold uppercase tracking-wide text-brand">Why this order?</div>
              <h2 id={`why-${itemId}`} className="font-serif text-2xl font-semibold tracking-tight">
                {name}
              </h2>
            </div>
            <button
              ref={closeRef}
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-canvas text-muted hover:text-ink"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="px-4 pb-8 pt-4 md:px-6">
          {error && <p className="text-sm text-loss">Couldn&apos;t load the reasoning. Close and try again.</p>}
          {!data && !error && (
            <div className="flex items-center gap-2 py-10 text-sm text-muted">
              <Loader2 size={16} className="animate-spin text-brand" /> Running the simulations for {name}…
            </div>
          )}
          {data && <WhyBody data={data} />}
        </div>
      </div>
    </div>
  );
}

function WhyBody({ data }: { data: WhyData }) {
  const lead = data.lead;
  const red = lead ? lead.wasted.filter(Boolean).length : 0;
  return (
    <div className="space-y-6">
      <ul className="grid gap-2 md:grid-cols-2">
        {data.takeaways.map((t) => {
          const Icon = ICONS[t.kind];
          return (
            <li
              key={t.kind}
              className={`flex gap-3 rounded-2xl p-3 text-sm leading-snug ${
                t.kind === "order" || t.kind === "money" ? "bg-brand-soft" : "bg-canvas"
              } ${t.kind === "order" ? "md:col-span-2" : ""}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-surface text-brand">
                <Icon size={16} />
              </span>
              <span className="pt-1.5">{t.text}</span>
            </li>
          );
        })}
      </ul>

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h3 className="text-sm font-semibold">Is the forecast any good?</h3>
          <p className="mb-2 text-xs text-muted">
            Black: what was really used. Dashed: what the model predicted that morning. Shaded: where use lands 8 days
            in 10. Right of &ldquo;today&rdquo;: the week ahead.
          </p>
          <ForecastBand band={data.band} today={data.today} unit={data.unit} />
        </section>
        <section>
          <h3 className="text-sm font-semibold">Will the stock on the shelf be used in time?</h3>
          {lead ? (
            <>
              <p className="mb-2 text-xs text-muted">
                Each line is one of 1,000 simulated futures for the most urgent batch. Red lines still have stock left
                when it expires: {red.toLocaleString("en-MY")} of {lead.wasted.length.toLocaleString("en-MY")} ={" "}
                {pct(lead.risk)} risk.
              </p>
              <FuturesChart paths={lead.paths} wasted={lead.wasted} today={data.today} unit={data.unit} />
            </>
          ) : (
            <p className="rounded-xl bg-canvas p-4 text-sm text-muted">
              No batch of {data.name.toLowerCase()} is likely to expire before it&apos;s used.
            </p>
          )}
        </section>
      </div>

      {data.landscape && (
        <section>
          <h3 className="text-sm font-semibold">Why this amount and not more or less? (3D, drag to rotate)</h3>
          <p className="mb-2 text-xs text-muted">
            Height = money lost per week (waste + missed sales, a missed sale counted as {LOST_SALE_MULT}× the
            ingredient cost) for every order size, from a 30% quieter to a 30% busier week. Green valley = cheapest.
            Red line: your usual order. Dark green line: the smart order.
          </p>
          <WasteLandscape data={data.landscape} />
        </section>
      )}
    </div>
  );
}
