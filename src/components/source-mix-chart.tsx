"use client";

import { PieChart, Pie, Cell, ResponsiveContainer } from "recharts";

type Slice = { name: string; value: number; color: string; pct: number };

export function SourceMixChart({ slices }: { slices: Slice[] }) {
  return (
    <div className="flex items-center gap-5">
      <div className="h-[140px] w-[140px] shrink-0">
        <ResponsiveContainer width="100%" height="100%">
          <PieChart>
            <Pie
              data={slices}
              dataKey="value"
              nameKey="name"
              innerRadius={36}
              outerRadius={66}
              paddingAngle={2}
              isAnimationActive
            >
              {slices.map((s, i) => (
                <Cell key={i} fill={s.color} stroke="white" strokeWidth={1.5} />
              ))}
            </Pie>
          </PieChart>
        </ResponsiveContainer>
      </div>
      <ul className="flex-1 space-y-1.5 text-xs">
        {slices.map((s) => (
          <li key={s.name} className="flex items-center justify-between gap-2">
            <span className="flex items-center gap-2">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              <span className="text-foreground">{s.name}</span>
            </span>
            <span className="numeric-callout tabular-nums text-muted">
              {s.value} · <span className="text-navy">{s.pct}%</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
