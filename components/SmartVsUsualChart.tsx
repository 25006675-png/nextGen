"use client";

import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { PALETTE } from "@/lib/palette";

type Row = { name: string; usual: number; smart: number };

const NAMES: Record<string, string> = { usual: "Usual orders", smart: "Smart order" };

/** Money lost per average week (waste + missed sales) by item, usual orders vs the smart order. */
export function SmartVsUsualChart({ rows }: { rows: Row[] }) {
  return (
    <div className="w-full" style={{ height: 48 + rows.length * 30 }}>
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 0, right: 8, bottom: 0, left: 0 }} barGap={1}>
          <CartesianGrid horizontal={false} stroke={PALETTE.line} />
          <XAxis
            type="number"
            tick={{ fontSize: 10, fill: PALETTE.muted }}
            tickLine={false}
            axisLine={false}
            tickFormatter={(v) => `RM${v}`}
          />
          <YAxis
            type="category"
            dataKey="name"
            width={92}
            tick={{ fontSize: 12, fill: PALETTE.ink }}
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            formatter={(v, name) => [`RM${Math.round(Number(v))} lost / week`, NAMES[String(name)] ?? name]}
            contentStyle={{ borderRadius: 12, border: `1px solid ${PALETTE.line}`, fontSize: 12 }}
          />
          <Legend
            itemSorter={null}
            verticalAlign="top"
            height={28}
            iconType="circle"
            iconSize={8}
            formatter={(name) => <span className="text-xs text-muted">{NAMES[String(name)] ?? name}</span>}
          />
          <Bar dataKey="usual" fill={PALETTE.loss} radius={[0, 4, 4, 0]} barSize={10} />
          <Bar dataKey="smart" fill={PALETTE.green} radius={[0, 4, 4, 0]} barSize={10} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
