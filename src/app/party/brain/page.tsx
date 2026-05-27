import { requireSession, isMinisterScope } from "@/lib/auth";
import { loadBrainGraph } from "@/lib/loaders/brain";
import { BrainMap } from "@/components/brain-map";

export const dynamic = "force-dynamic";

export default async function PartyBrain() {
  const ctx = await requireSession();
  const minister = isMinisterScope(ctx);

  const graph = minister
    ? await loadBrainGraph({
        kind: "minister",
        mla_id: ctx.scope.mla_id,
        constituency_id: ctx.scope.constituency_id,
        district_id: ctx.scope.district_id,
      })
    : await loadBrainGraph({ kind: "state" });

  const title = minister ? `${ctx.scope.mla_name} · brain map` : "Arunachal Pradesh · brain map";
  const subtitle = minister
    ? "Your portfolio, your seat, the events forming around you"
    : "Every minister, constituency, event and topic — and how they connect";

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Brain map</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}. Hover for detail, click to open the entity, drag nodes to explore.</p>

      <div className="mt-6">
        <BrainMap graph={graph} title={title} subtitle={subtitle} />
      </div>

      <div className="mt-4 grid gap-3 text-xs text-muted md:grid-cols-3">
        <div className="rounded border border-border bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider text-bronze">Reading it</div>
          <p className="mt-1">Lines glow toward where attention is flowing. Larger nodes carry more weight. Rings mark active threat assessments.</p>
        </div>
        <div className="rounded border border-border bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider text-bronze">What to look for</div>
          <p className="mt-1">Clusters = forming narratives. Bright-red events near a minister = pressure building. Isolated nodes = handled or stale.</p>
        </div>
        <div className="rounded border border-border bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider text-bronze">Window</div>
          <p className="mt-1">Last 30 days. Top {graph.nodes.filter((n) => n.kind === "event").length} signals by SNT, top topics by frequency.</p>
        </div>
      </div>
    </div>
  );
}
