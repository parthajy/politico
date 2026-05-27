"use client";

import { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BrainGraph, BrainNode } from "@/lib/loaders/brain";

// react-force-graph relies on canvas + window, so it MUST be client-only and
// dynamic-imported with ssr: false.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type FilterKey = "all" | "ministers" | "constituencies" | "topics" | "events";

const KIND_COLOR: Record<BrainNode["kind"], string> = {
  minister: "#0F2942",       // navy
  constituency: "#9C6B2D",   // bronze
  district: "#C9B79C",       // sand-deep
  topic: "#3F6B5B",          // muted teal
  event: "#C04646",          // severity-1
};

const RISK_RING: Record<NonNullable<BrainNode["risk_band"]>, string> = {
  critical: "#C04646",
  high: "#C04646",
  medium: "#9C6B2D",
  low: "#6B7C8C",
};

export function BrainMap({ graph, title, subtitle }: { graph: BrainGraph; title: string; subtitle: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  // The ForceGraph2D component exposes imperative methods (zoomToFit, etc).
  // We don't depend on the precise method type here, so a loose ref is fine.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<BrainNode | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setDim({ w: Math.max(360, e.contentRect.width), h: Math.max(420, e.contentRect.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // After first paint, zoom to fit and warm the layout
  useEffect(() => {
    const t = setTimeout(() => {
      fgRef.current?.zoomToFit?.(600, 40);
    }, 400);
    return () => clearTimeout(t);
  }, [graph.nodes.length]);

  // Apply filter + search to a copy of the graph so the underlying data stays intact
  const filtered = applyFilter(graph, filter, search);

  return (
    <div className="relative overflow-hidden rounded-xl border border-border bg-navy/[0.96] shadow-sm" style={{ height: 720 }}>
      {/* Top bar */}
      <div className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-3 border-b border-white/10 bg-navy/80 px-4 py-2 text-xs text-white/80 backdrop-blur">
        <div className="font-serif text-sm font-bold text-white">{title}</div>
        <div className="text-[10px] uppercase tracking-wider text-white/50">{subtitle}</div>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search nodes…"
            className="h-7 rounded-md border border-white/15 bg-white/5 px-2 text-[11px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-bronze"
          />
          <div className="flex items-center gap-1 rounded-md border border-white/15 bg-white/5 p-0.5">
            {(["all", "ministers", "constituencies", "topics", "events"] as FilterKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded px-2 py-0.5 text-[11px] capitalize transition ${
                  filter === k ? "bg-bronze text-white" : "text-white/60 hover:text-white"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Legend */}
      <div className="absolute bottom-3 left-3 z-10 flex flex-col gap-1 rounded-md border border-white/10 bg-navy/80 px-3 py-2 text-[10px] text-white/80 backdrop-blur">
        {Object.entries(KIND_COLOR).map(([k, c]) => (
          <div key={k} className="flex items-center gap-2">
            <span className="inline-block h-2 w-2 rounded-full" style={{ background: c }} />
            <span className="capitalize">{k}</span>
          </div>
        ))}
        <div className="mt-1 border-t border-white/10 pt-1 text-[9px] text-white/50">Ring = threat band</div>
      </div>

      {/* Hover card */}
      {hover && (
        <div className="absolute right-3 top-12 z-10 max-w-xs rounded-md border border-white/10 bg-white p-3 shadow-lg">
          <div className="text-[10px] uppercase tracking-wider text-bronze">{hover.kind}</div>
          <div className="mt-0.5 text-sm font-semibold text-navy">{hover.label}</div>
          {hover.sub && <div className="text-[11px] text-muted">{hover.sub}</div>}
          {hover.risk_band && (
            <div className="mt-2 text-[10px]">
              <span className="font-medium" style={{ color: RISK_RING[hover.risk_band] }}>
                Threat · {hover.risk_band.toUpperCase()}
              </span>
            </div>
          )}
          {hover.snt_score != null && (
            <div className="mt-1 text-[10px] text-muted">
              SNT {hover.snt_score.toFixed(2)}
              {hover.sentiment != null && <> · sent {hover.sentiment.toFixed(2)}</>}
            </div>
          )}
          {hover.href && (
            <div className="mt-2 text-[10px] text-bronze">Click to open →</div>
          )}
        </div>
      )}

      <div ref={containerRef} className="absolute inset-0 pt-10">
        <ForceGraph2D
          ref={fgRef}
          graphData={filtered}
          width={dim.w}
          height={dim.h - 40}
          backgroundColor="rgba(15,41,66,0)"
          nodeRelSize={4}
          // Use a custom paint to draw nice labels + risk ring
          nodeCanvasObject={(node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const n = node as BrainNode & { x: number; y: number };
            const baseR = 4 + (n.weight ?? 0.4) * 10;
            const ring = n.risk_band ? RISK_RING[n.risk_band] : null;
            // For events, also colour by sentiment
            let color = KIND_COLOR[n.kind];
            if (n.kind === "event" && n.sentiment != null) {
              color = n.sentiment < -0.15 ? "#C04646" : n.sentiment > 0.15 ? "#3F6B5B" : "#9C6B2D";
            }

            if (ring) {
              ctx.beginPath();
              ctx.arc(n.x, n.y, baseR + 2.5, 0, 2 * Math.PI);
              ctx.strokeStyle = ring;
              ctx.lineWidth = 1.5;
              ctx.stroke();
            }

            ctx.beginPath();
            ctx.arc(n.x, n.y, baseR, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();

            // Label
            const showLabel = n.kind === "minister" || n.kind === "district" || (globalScale > 1.5);
            if (showLabel) {
              const fontSize = Math.max(10, 12 / Math.sqrt(globalScale));
              ctx.font = `${fontSize}px Inter, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              ctx.fillStyle = "#F3EBDD";
              const label = n.label.length > 30 ? n.label.slice(0, 28) + "…" : n.label;
              ctx.fillText(label, n.x, n.y + baseR + 3);
            }
          }}
          nodePointerAreaPaint={(node: unknown, color: string, ctx: CanvasRenderingContext2D) => {
            const n = node as BrainNode & { x: number; y: number };
            const baseR = 6 + (n.weight ?? 0.4) * 10;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x, n.y, baseR, 0, 2 * Math.PI);
            ctx.fill();
          }}
          linkColor={() => "rgba(255,255,255,0.18)"}
          linkWidth={(link: unknown) => {
            const l = link as { weight?: number };
            return 0.4 + (l.weight ?? 0.3) * 1.5;
          }}
          linkDirectionalParticles={2}
          linkDirectionalParticleSpeed={0.004}
          linkDirectionalParticleWidth={(link: unknown) => {
            const l = link as { weight?: number };
            return (l.weight ?? 0.3) * 2;
          }}
          linkDirectionalParticleColor={() => "rgba(156,107,45,0.6)"}
          d3VelocityDecay={0.35}
          cooldownTicks={120}
          onNodeHover={(node: unknown) => setHover((node as BrainNode) ?? null)}
          onNodeClick={(node: unknown) => {
            const n = node as BrainNode;
            if (n.href) window.location.href = n.href;
          }}
        />
      </div>
    </div>
  );
}

function applyFilter(graph: BrainGraph, filter: FilterKey, search: string): BrainGraph {
  const q = search.trim().toLowerCase();
  const passes = (n: BrainNode) => {
    if (filter === "ministers" && n.kind !== "minister") return false;
    if (filter === "constituencies" && n.kind !== "constituency") return false;
    if (filter === "topics" && n.kind !== "topic") return false;
    if (filter === "events" && n.kind !== "event") return false;
    if (q && !n.label.toLowerCase().includes(q) && !(n.sub ?? "").toLowerCase().includes(q)) return false;
    return true;
  };
  // Always keep districts as scaffolding, even when filtering, so the layout stays anchored.
  const keepNodes = graph.nodes.filter((n) => n.kind === "district" || passes(n));
  const keepIds = new Set(keepNodes.map((n) => n.id));
  const keepLinks = graph.links.filter((l) => keepIds.has(l.source as string) && keepIds.has(l.target as string));
  return { nodes: keepNodes, links: keepLinks, focus_id: graph.focus_id };
}
