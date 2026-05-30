"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import dynamic from "next/dynamic";
import type { BrainGraph, BrainNode, BrainLink } from "@/lib/loaders/brain";
// BrainLink referenced via type-only assertions in link callbacks below.

// react-force-graph relies on canvas + window, so it MUST be client-only and
// dynamic-imported with ssr: false.
const ForceGraph2D = dynamic(() => import("react-force-graph-2d"), { ssr: false });

type FilterKey = "all" | "ministers" | "constituencies" | "topics" | "events";

// Brighter palette — designed to read on the deep-navy background.
const KIND_COLOR: Record<BrainNode["kind"], string> = {
  minister: "#F3D08A",       // warm gold — principals stand out
  constituency: "#C99A5A",   // bronze
  district: "#8DA3B5",       // muted blue-grey — scaffolding
  topic: "#7FB39B",          // sage green
  event: "#E0613E",          // alert orange-red
};

const RISK_RING: Record<NonNullable<BrainNode["risk_band"]>, string> = {
  critical: "#FF4848",
  high: "#FF6A5C",
  medium: "#F3B042",
  low: "#7FA5C2",
};

const BG_NAVY = "#0B1E33";          // canvas background — deeper than UI navy for contrast
const BG_NAVY_BAR = "rgba(11,30,51,0.92)";

export function BrainMap({ graph, title, subtitle }: { graph: BrainGraph; title: string; subtitle: string }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const shellRef = useRef<HTMLDivElement>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const fgRef = useRef<any>(null);
  const [dim, setDim] = useState({ w: 800, h: 600 });
  const [hover, setHover] = useState<BrainNode | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [search, setSearch] = useState("");
  const [fullscreen, setFullscreen] = useState(false);

  // Resize observer — track container size for the canvas
  useEffect(() => {
    if (!containerRef.current) return;
    const ro = new ResizeObserver((entries) => {
      const e = entries[0];
      setDim({ w: Math.max(360, e.contentRect.width), h: Math.max(420, e.contentRect.height) });
    });
    ro.observe(containerRef.current);
    return () => ro.disconnect();
  }, []);

  // Fit-to-view on graph load + on filter change. We do it twice — once early
  // while the simulation is still warming up (gets the camera roughly right),
  // then again after the layout has settled so the final framing is tight.
  useEffect(() => {
    const t1 = setTimeout(() => fgRef.current?.zoomToFit?.(400, 60), 200);
    const t2 = setTimeout(() => fgRef.current?.zoomToFit?.(800, 60), 1400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, [graph.nodes.length, filter]);

  // Tune the d3 forces for cleaner clustering — pull related nodes tight,
  // push unrelated apart, prevent the whole graph from collapsing or
  // exploding off-screen.
  useEffect(() => {
    const fg = fgRef.current;
    if (!fg) return;
    // give it a tick for the inner d3 sim to exist
    const t = setTimeout(() => {
      try {
        fg.d3Force?.("charge")?.strength?.(-180).distanceMax(420);
        fg.d3Force?.("link")?.distance?.((l: { kind?: string }) => {
          // Same-cluster relationships pull tighter than cross-cluster
          if (l.kind === "seat") return 28;
          if (l.kind === "about") return 50;
          if (l.kind === "tagged_with") return 90;
          if (l.kind === "in_district") return 70;
          return 60;
        }).strength?.((l: { weight?: number }) => 0.4 + (l.weight ?? 0.3) * 0.4);
        fg.d3Force?.("center")?.strength?.(0.04);
      } catch { /* d3Force API may not be ready yet on first paint */ }
    }, 80);
    return () => clearTimeout(t);
  }, [graph.nodes.length]);

  // Browser fullscreen API
  useEffect(() => {
    const onChange = () => setFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);
  async function toggleFullscreen() {
    if (!shellRef.current) return;
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await shellRef.current.requestFullscreen?.();
    }
  }

  // Apply filter + search
  const filtered = useMemo(() => applyFilter(graph, filter, search), [graph, filter, search]);

  // Build an adjacency map for hover highlighting
  const adjacency = useMemo(() => {
    const m = new Map<string, Set<string>>();
    for (const l of filtered.links) {
      const s = typeof l.source === "object" ? (l.source as { id: string }).id : (l.source as string);
      const t = typeof l.target === "object" ? (l.target as { id: string }).id : (l.target as string);
      if (!m.has(s)) m.set(s, new Set());
      if (!m.has(t)) m.set(t, new Set());
      m.get(s)!.add(t);
      m.get(t)!.add(s);
    }
    return m;
  }, [filtered]);

  const hoverId = hover?.id ?? null;
  const hoverNeighbours = hoverId ? adjacency.get(hoverId) ?? new Set<string>() : null;

  // Stats for the bottom-right chip
  const counts = useMemo(() => {
    const c: Record<BrainNode["kind"], number> = { minister: 0, constituency: 0, district: 0, topic: 0, event: 0 };
    for (const n of filtered.nodes) c[n.kind] += 1;
    return c;
  }, [filtered.nodes]);

  return (
    <div
      ref={shellRef}
      className="relative overflow-hidden rounded-xl border border-navy-deep shadow-xl"
      style={{ height: fullscreen ? "100vh" : 720, background: BG_NAVY }}
    >
      {/* Top bar */}
      <div
        className="absolute left-0 right-0 top-0 z-10 flex flex-wrap items-center gap-3 border-b border-white/10 px-4 py-2.5 text-xs text-white/80 backdrop-blur"
        style={{ background: BG_NAVY_BAR }}
      >
        <div>
          <div className="font-serif text-sm font-bold text-white">{title}</div>
          <div className="text-[10px] uppercase tracking-wider text-white/50">{subtitle}</div>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search…"
            className="h-8 w-44 rounded-md border border-white/20 bg-white/5 px-2.5 text-[12px] text-white placeholder:text-white/40 focus:outline-none focus:ring-1 focus:ring-bronze"
          />
          <div className="flex items-center gap-1 rounded-md border border-white/15 bg-white/5 p-0.5">
            {(["all", "ministers", "constituencies", "topics", "events"] as FilterKey[]).map((k) => (
              <button
                key={k}
                onClick={() => setFilter(k)}
                className={`rounded px-2.5 py-1 text-[11px] capitalize transition ${
                  filter === k ? "bg-bronze text-white" : "text-white/70 hover:text-white"
                }`}
              >
                {k}
              </button>
            ))}
          </div>
          <button
            onClick={() => fgRef.current?.zoomToFit?.(600, 60)}
            className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:text-white"
            title="Fit to view"
          >
            Fit
          </button>
          <button
            onClick={toggleFullscreen}
            className="rounded-md border border-white/15 bg-white/5 px-2.5 py-1 text-[11px] text-white/70 hover:text-white"
            title={fullscreen ? "Exit full screen" : "Full screen"}
          >
            {fullscreen ? "⤓ Exit" : "⤢ Full screen"}
          </button>
        </div>
      </div>

      {/* Legend + stats */}
      <div
        className="absolute bottom-3 left-3 z-10 flex flex-col gap-1.5 rounded-md border border-white/10 px-3 py-2.5 text-[11px] text-white/85"
        style={{ background: BG_NAVY_BAR, backdropFilter: "blur(6px)" }}
      >
        <div className="text-[9px] uppercase tracking-wider text-bronze">Nodes · {filtered.nodes.length}</div>
        {(Object.entries(KIND_COLOR) as [BrainNode["kind"], string][]).map(([k, c]) => (
          <div key={k} className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: c, boxShadow: `0 0 6px ${c}` }} />
              <span className="capitalize">{k}</span>
            </div>
            <span className="tabular-nums text-white/50">{counts[k]}</span>
          </div>
        ))}
        <div className="mt-1 border-t border-white/10 pt-1.5 text-[9px] text-white/45">Ring = threat band · {filtered.links.length} edges</div>
      </div>

      {/* Hover card — bigger, brighter, more info */}
      {hover && (
        <div
          className="absolute right-3 top-16 z-10 max-w-sm rounded-lg border border-bronze/60 bg-white p-4 shadow-2xl"
          style={{ animation: "fadeIn 120ms ease-out" }}
        >
          <div className="flex items-center gap-2">
            <span className="inline-block h-2.5 w-2.5 rounded-full" style={{ background: KIND_COLOR[hover.kind] }} />
            <div className="text-[10px] uppercase tracking-wider text-bronze">{hover.kind}</div>
            {hover.risk_band && (
              <span
                className="ml-auto rounded-full px-2 py-0.5 text-[9px] font-bold uppercase tracking-wider text-white"
                style={{ background: RISK_RING[hover.risk_band] }}
              >
                {hover.risk_band}
              </span>
            )}
          </div>
          <div className="mt-1.5 font-serif text-base font-bold leading-tight text-navy">{hover.label}</div>
          {hover.sub && <div className="mt-0.5 text-xs text-muted">{hover.sub}</div>}

          {(hover.snt_score != null || hover.sentiment != null) && (
            <div className="mt-3 grid grid-cols-2 gap-2 rounded border border-border bg-sand-deep/30 p-2">
              {hover.snt_score != null && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted">SNT score</div>
                  <div className="numeric-callout text-lg text-navy">{hover.snt_score.toFixed(2)}</div>
                </div>
              )}
              {hover.sentiment != null && (
                <div>
                  <div className="text-[9px] uppercase tracking-wider text-muted">Sentiment</div>
                  <div
                    className="numeric-callout text-lg"
                    style={{ color: hover.sentiment < -0.15 ? "#C04646" : hover.sentiment > 0.15 ? "#3F6B5B" : "#9C6B2D" }}
                  >
                    {hover.sentiment >= 0 ? "+" : ""}{hover.sentiment.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          )}

          <div className="mt-3 text-[10px] text-muted">
            <span className="font-medium text-navy">{hoverNeighbours?.size ?? 0}</span> connection{(hoverNeighbours?.size ?? 0) === 1 ? "" : "s"} in view
          </div>
          {hover.href && (
            <div className="mt-2 rounded bg-bronze/10 px-2 py-1.5 text-[11px] font-medium text-bronze">
              Click node → open entity
            </div>
          )}
        </div>
      )}

      <div ref={containerRef} className="absolute inset-0 pt-[58px]">
        <ForceGraph2D
          ref={fgRef}
          graphData={filtered}
          width={dim.w}
          height={dim.h - 58}
          backgroundColor={BG_NAVY}
          nodeRelSize={5}
          // d3 force tweaks for prettier spacing
          d3VelocityDecay={0.28}
          d3AlphaDecay={0.012}
          cooldownTicks={180}
          warmupTicks={50}
          onEngineStop={() => fgRef.current?.zoomToFit?.(400, 60)}

          // Custom node paint: glow + ring + label, dim non-neighbours on hover
          nodeCanvasObject={(node: unknown, ctx: CanvasRenderingContext2D, globalScale: number) => {
            const n = node as BrainNode & { x?: number; y?: number };
            // Force-graph occasionally calls us before d3 has assigned x/y
            // (or with NaN positions during simulation warm-up). Bail safely
            // — the next tick will have real coordinates.
            if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
            const nx = n.x as number;
            const ny = n.y as number;
            const baseR = Math.max(2, 5 + (n.weight ?? 0.4) * 12);
            const ring = n.risk_band ? RISK_RING[n.risk_band] : null;

            // Determine dim/highlight state for hover
            let alpha = 1;
            if (hoverId && hoverId !== n.id) {
              alpha = hoverNeighbours?.has(n.id) ? 1 : 0.18;
            }

            let color = KIND_COLOR[n.kind];
            if (n.kind === "event" && n.sentiment != null) {
              color = n.sentiment < -0.15 ? "#E0613E" : n.sentiment > 0.15 ? "#7FB39B" : "#C99A5A";
            }

            ctx.globalAlpha = alpha;

            // Glow halo for big nodes
            if (baseR > 7) {
              const grad = ctx.createRadialGradient(nx, ny, baseR * 0.6, nx, ny, baseR * 2.4);
              grad.addColorStop(0, hexToRgba(color, 0.55));
              grad.addColorStop(1, hexToRgba(color, 0));
              ctx.fillStyle = grad;
              ctx.beginPath();
              ctx.arc(nx, ny, baseR * 2.4, 0, 2 * Math.PI);
              ctx.fill();
            }

            // Risk ring
            if (ring) {
              ctx.beginPath();
              ctx.arc(nx, ny, baseR + 3, 0, 2 * Math.PI);
              ctx.strokeStyle = ring;
              ctx.lineWidth = 2;
              ctx.stroke();
            }

            // Core
            ctx.beginPath();
            ctx.arc(nx, ny, baseR, 0, 2 * Math.PI);
            ctx.fillStyle = color;
            ctx.fill();
            ctx.strokeStyle = "rgba(0,0,0,0.35)";
            ctx.lineWidth = 0.5;
            ctx.stroke();

            // Label — show ministers + constituencies always, others above a zoom threshold
            const alwaysLabel = n.kind === "minister" || n.kind === "constituency";
            const showLabel = alwaysLabel || globalScale > 1.6 || (hoverId === n.id);
            if (showLabel) {
              const fontSize = alwaysLabel ? Math.max(10, 13 / Math.sqrt(globalScale)) : Math.max(9, 11 / Math.sqrt(globalScale));
              ctx.font = `${n.kind === "minister" ? "600 " : ""}${fontSize}px Inter, sans-serif`;
              ctx.textAlign = "center";
              ctx.textBaseline = "top";
              const label = n.label.length > 28 ? n.label.slice(0, 26) + "…" : n.label;

              // Subtle text shadow / pill for readability
              const padX = 4;
              const padY = 1.5;
              const w = ctx.measureText(label).width + padX * 2;
              const h = fontSize + padY * 2;
              ctx.fillStyle = "rgba(11,30,51,0.78)";
              roundRect(ctx, nx - w / 2, ny + baseR + 4, w, h, 3);
              ctx.fill();

              ctx.fillStyle = n.kind === "minister" ? "#F3D08A" : "#F3EBDD";
              ctx.fillText(label, nx, ny + baseR + 4 + padY);
            }

            ctx.globalAlpha = 1;
          }}
          nodePointerAreaPaint={(node: unknown, color: string, ctx: CanvasRenderingContext2D) => {
            const n = node as BrainNode & { x?: number; y?: number };
            if (!Number.isFinite(n.x) || !Number.isFinite(n.y)) return;
            const baseR = Math.max(2, 8 + (n.weight ?? 0.4) * 14);
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(n.x as number, n.y as number, baseR, 0, 2 * Math.PI);
            ctx.fill();
          }}

          // Bright, visible edges — dim non-adjacent ones on hover
          linkColor={(link: unknown) => {
            if (!hoverId) return "rgba(243,208,138,0.45)"; // warm gold at 45% — more visible
            const { s, t } = endpointIds(link);
            const isHovered = s === hoverId || t === hoverId;
            return isHovered ? "rgba(255,220,150,1)" : "rgba(232,206,160,0.08)";
          }}
          linkWidth={(link: unknown) => {
            const l = link as { weight?: number };
            const w = 0.6 + (l.weight ?? 0.3) * 1.8;
            if (!hoverId) return w;
            const { s, t } = endpointIds(link);
            return (s === hoverId || t === hoverId) ? w * 2 : w;
          }}
          linkDirectionalParticles={(link: unknown) => {
            const l = link as { kind: BrainLink["kind"] };
            // Only events flow toward their target — keeps the map readable
            return l.kind === "about" || l.kind === "tagged_with" ? 2 : 0;
          }}
          linkDirectionalParticleSpeed={0.005}
          linkDirectionalParticleWidth={2.5}
          linkDirectionalParticleColor={() => "rgba(243,208,138,0.85)"}

          onNodeHover={(node: unknown) => setHover((node as BrainNode) ?? null)}
          onNodeClick={(node: unknown) => {
            const n = node as BrainNode;
            if (n.href) window.location.href = n.href;
          }}
        />
      </div>
      <style jsx>{`
        @keyframes fadeIn {
          from { opacity: 0; transform: translateY(-4px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `}</style>
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
  const keepLinks = graph.links.filter((l) => {
    const s = typeof l.source === "object" ? (l.source as { id: string }).id : (l.source as string);
    const t = typeof l.target === "object" ? (l.target as { id: string }).id : (l.target as string);
    return keepIds.has(s) && keepIds.has(t);
  });
  return { nodes: keepNodes, links: keepLinks, focus_id: graph.focus_id };
}

// Helpers ------------------------------------------------------------------
function endpointIds(link: unknown): { s: string; t: string } {
  const l = link as { source: unknown; target: unknown };
  const idOf = (x: unknown) => (typeof x === "object" && x !== null ? (x as { id: string }).id : (x as string));
  return { s: idOf(l.source), t: idOf(l.target) };
}

function hexToRgba(hex: string, a: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${a})`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}
