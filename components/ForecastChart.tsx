"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PALETTE } from "@/lib/palette";

type Point = { label: string; actual?: number; usual?: number; smart?: number };

const NAMES: Record<string, string> = {
  actual: "Wasted",
  usual: "Avg week ahead: usual orders",
  smart: "Avg week ahead: smart order",
};

const TIP: Record<string, string> = { actual: "Wasted", usual: "Usual orders", smart: "Smart order" };

/** Logged waste per week, then the average forecast week over the next 4 weeks (usual vs smart). */
export function ForecastChart({ data }: { data: Point[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <BarChart data={data} margin={{ top: 4, right: 0, bottom: 0, left: -18 }} barGap={2}>
          <CartesianGrid vertical={false} stroke={PALETTE.line} />
          <XAxis
            dataKey="label"
            tick={{ fontSize: 10, fill: PALETTE.muted }}
            tickLine={false}
            axisLine={false}
            interval={0}
            tickFormatter={(l) => (l === "Avg week ahead" ? "Ahead" : l)}
          />
          <YAxis tick={{ fontSize: 10, fill: PALETTE.muted }} tickLine={false} axisLine={false} tickFormatter={(v) => `${v}`} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            itemSorter={(item) => ["actual", "usual", "smart"].indexOf(String(item.dataKey))}
            formatter={(v, name) => [`RM${Math.round(Number(v))}`, TIP[String(name)] ?? name]}
            labelFormatter={(label) => (label === "Avg week ahead" ? "Average week, next 4 weeks" : `Week from ${label}`)}
            contentStyle={{ borderRadius: 12, border: `1px solid ${PALETTE.line}`, fontSize: 12 }}
          />
          <Legend
            itemSorter={null}
            formatter={(name) => <span className="text-xs text-muted">{NAMES[String(name)] ?? name}</span>}
            iconType="circle"
            iconSize={8}
          />
          <Bar dataKey="actual" fill={PALETTE.larvaLine} radius={[4, 4, 0, 0]} />
          <Bar dataKey="usual" fill={PALETTE.loss} radius={[4, 4, 0, 0]} />
          <Bar dataKey="smart" fill={PALETTE.green} radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
