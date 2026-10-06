"use client";

import { useState } from "react";
import { AlertTriangle, Lightbulb } from "lucide-react";
import type { Alert } from "@/lib/queries";
import { pct, qty, relDay, rm } from "@/lib/format";
import { FuturesChart } from "./FuturesChart";
import { ItemImage } from "./ItemImage";

export function UseFirst({ alerts, today }: { alerts: Alert[]; today: string }) {
  const [selected, setSelected] = useState(0);
  if (alerts.length === 0) return <p className="text-sm text-muted">Nothing at risk right now. 👍</p>;
  const a = alerts[Math.min(selected, alerts.length - 1)];
  const redCount = a.wasted.filter(Boolean).length;

  return (
    <div className="grid gap-4 md:grid-cols-2">
      <ul className="divide-y divide-line">
        {alerts.map((al, i) => (
          <li key={al.itemId}>
            <button
              type="button"
              onClick={() => setSelected(i)}
              aria-pressed={i === selected}
              className={`-mx-2 w-[calc(100%+1rem)] rounded-xl px-2 py-2.5 text-left transition ${
                i === selected ? "bg-warn-soft/60" : "hover:bg-canvas"
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <span className="relative shrink-0">
                    <ItemImage name={al.name} className="h-11 w-11" />
                    <AlertTriangle
                      size={16}
                      className="absolute -right-1.5 -top-1.5 rounded-full bg-surface p-px text-warn"
                    />
                  </span>
                  <div>
                    <div className="font-medium">Use the {al.name.toLowerCase()} first</div>
                    <div className="text-sm text-muted">
                      {pct(al.risk)} risk of expiring {relDay(al.expiresAt, today)} · ~{qty(al.qty, al.unit)} likely
                      left
                    </div>
                    {al.otherBatches > 0 && (
                      <div className="text-xs font-medium text-warn">
                        +{al.otherBatches} more {al.otherBatches === 1 ? "batch" : "batches"} at risk
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex shrink-0 flex-col items-center">
                  <span className="num rounded-full bg-warn-soft px-2 py-0.5 text-sm font-semibold text-warn">
                    {rm(al.valueRM)}
                  </span>
                  <div className="mt-0.5 text-[11px] text-muted">at risk</div>
                </div>
              </div>
              <div className="ml-[3.375rem] mt-1.5 flex items-start gap-1.5 text-sm text-ink/80">
                <Lightbulb size={15} className="mt-0.5 shrink-0 text-brand" />
                {al.suggestion}
              </div>
            </button>
          </li>
        ))}
      </ul>

      <div className="rounded-xl border border-line p-3">
        <div className="mb-1 flex flex-wrap items-baseline justify-between gap-x-3">
          <h3 className="text-sm font-semibold">
            {a.name}: {a.wasted.length.toLocaleString("en-MY")} simulated futures
          </h3>
          <span className="num shrink-0 text-xs text-muted">
            {a.otherBatches > 0 ? "Most urgent batch" : "Batch"}: {qty(a.remaining, a.unit)}
          </span>
        </div>
        <FuturesChart key={`${a.itemId}-${a.expiresAt}`} paths={a.paths} wasted={a.wasted} today={today} unit={a.unit} />
        <p className="mt-2 text-sm">
          <span className="num font-semibold text-loss">{redCount.toLocaleString("en-MY")}</span> of{" "}
          {a.wasted.length.toLocaleString("en-MY")} futures end with {a.name.toLowerCase()} left when it expires{" "}
          <span className="font-semibold">→ {pct(a.risk)} risk</span>.
        </p>
        <div className="mt-1 flex gap-4 text-xs text-muted">
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-loss/70" /> ends in waste
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-2 w-3 rounded-sm bg-brand/70" /> used up in time
          </span>
        </div>
        <p className="mt-1 text-xs text-muted">
          Each line replays daily sales with this item&apos;s real forecast errors from the last 4 weeks. Tap another
          item to compare.
        </p>
      </div>
    </div>
  );
}
