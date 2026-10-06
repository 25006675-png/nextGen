"use client";

import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PALETTE, alpha } from "@/lib/palette";
import { ESG_SERIES } from "./EsgSeries";

type Month = { label: string; partial: boolean; divertedKg: number; awaitingKg: number; disposalKg: number };

const fmt = (n: number) => `${n.toLocaleString("en-MY", { maximumFractionDigits: 1 })} kg`;

export function EsgLegend() {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
      {ESG_SERIES.map((s) => (
        <li key={s.key} className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
          {s.label}
        </li>
      ))}
    </ul>
  );
}

/** Food waste logged each month, stacked by where it went. */
export function EsgChart({ data }: { data: Month[] }) {
  const rows = data.map((m) => ({ ...m, name: m.partial ? `${m.label}*` : m.label }));
  return (
    <div className="h-52 w-full">
      <ResponsiveContainer>
        <BarChart data={rows} margin={{ top: 8, right: 0, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={PALETTE.line} />
          <XAxis dataKey="name" tick={{ fontSize: 11, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
          <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
          <Tooltip
            cursor={{ fill: alpha(PALETTE.ink, 0.04) }}
            content={({ active, payload }) => {
              const m = active && payload?.[0]?.payload;
              if (!m) return null;
              return (
                <div className="rounded-xl border border-line bg-surface px-3 py-2 text-xs shadow-sm">
                  <div className="mb-1 font-semibold">
                    {m.label}
                    {m.partial && <span className="font-normal text-muted"> (part month)</span>}
                  </div>
                  {ESG_SERIES.map((s) => (
                    <div key={s.key} className="num flex items-center justify-between gap-4">
                      <span className="flex items-center gap-1.5 text-muted">
                        <span className="h-2 w-2 rounded-sm" style={{ background: s.color }} />
                        {s.label}
                      </span>
                      {fmt(m[s.key])}
                    </div>
                  ))}
                </div>
              );
            }}
          />
          {ESG_SERIES.map((s, i) => (
            <Bar
              key={s.key}
              dataKey={s.key}
              stackId="w"
              fill={s.color}
              stroke={PALETTE.surface}
              strokeWidth={1}
              maxBarSize={44}
              radius={i === ESG_SERIES.length - 1 ? [4, 4, 0, 0] : 0}
            />
          ))}
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
