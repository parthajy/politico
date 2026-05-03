"use client";

import { LineChart, Line, ResponsiveContainer, YAxis } from "recharts";

export function SentimentSparkline({ series, height = 48, color = "#0F2942" }: { series: { date: string; value: number }[]; height?: number; color?: string }) {
  if (!series || series.length === 0) {
    return <div className="h-12 text-xs text-muted">no trend</div>;
  }
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series}>
          <YAxis hide domain={[-1, 1]} />
          <Line type="monotone" dataKey="value" stroke={color} strokeWidth={1.6} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

export function SentimentTrend({ series, height = 200 }: { series: { date: string; value: number }[]; height?: number }) {
  // Larger version with x-axis dates implied via tooltip
  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={series} margin={{ top: 8, right: 8, left: 0, bottom: 8 }}>
          <YAxis domain={[-1, 1]} ticks={[-1, -0.5, 0, 0.5, 1]} tickLine={false} axisLine={false} stroke="#6B7280" fontSize={10} />
          <Line type="monotone" dataKey="value" stroke="#0F2942" strokeWidth={2} dot={false} isAnimationActive={false} />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
