"use client";

import { Area, CartesianGrid, ComposedChart, Legend, Line, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import type { BandPoint } from "@/lib/queries";
import { PALETTE } from "@/lib/palette";

const NAMES: Record<string, string> = {
  range: "Likely range (80%)",
  forecast: "Forecast",
  actual: "Actual use",
};

/** Actual daily use vs what the model predicted, with its 80% range, then the week ahead. */
export function ForecastBand({ band, today, unit }: { band: BandPoint[]; today: string; unit: string }) {
  const data = band.map((p) => ({
    label: `${Number(p.date.slice(8))}/${Number(p.date.slice(5, 7))}`,
    date: p.date,
    actual: p.actual,
    forecast: Math.round(p.forecast * 100) / 100,
    range: [Math.round(p.low * 100) / 100, Math.round(p.high * 100) / 100],
  }));
  const todayLabel = data.find((d) => d.date === today)?.label;

  return (
    <div className="h-60 w-full">
      <ResponsiveContainer>
        <ComposedChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: -18 }}>
          <CartesianGrid vertical={false} stroke={PALETTE.line} />
          <XAxis dataKey="label" tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} minTickGap={12} />
          <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} />
          <Tooltip
            formatter={(v, name) => {
              const label = NAMES[String(name)] ?? name;
              if (Array.isArray(v)) return [`${v[0]}–${v[1]} ${unit}`, label];
              return [`${Math.round(Number(v) * 10) / 10} ${unit}`, label];
            }}
            contentStyle={{ borderRadius: 12, border: `1px solid ${PALETTE.line}`, fontSize: 12 }}
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(name) => <span className="text-xs text-muted">{NAMES[String(name)] ?? name}</span>}
          />
          <Area dataKey="range" stroke="none" fill={PALETTE.green} fillOpacity={0.15} isAnimationActive />
          <Line dataKey="forecast" stroke={PALETTE.green} strokeWidth={2} strokeDasharray="5 4" dot={false} />
          <Line dataKey="actual" stroke={PALETTE.ink} strokeWidth={1.5} dot={{ r: 2.5 }} connectNulls={false} />
          {todayLabel && (
            <ReferenceLine x={todayLabel} stroke={PALETTE.larvaLine} strokeDasharray="3 3" label={{ value: "today", fontSize: 10, fill: PALETTE.muted, position: "insideTopRight" }} />
          )}
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}
