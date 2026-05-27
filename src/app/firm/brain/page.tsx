import { loadBrainGraph } from "@/lib/loaders/brain";
import { BrainMap } from "@/components/brain-map";

export const dynamic = "force-dynamic";

// Firm-side brain map. Same data as the CMO view, but the firm uses it as the
// strategy room — they ARE building these relationships.

export default async function FirmBrain() {
  const graph = await loadBrainGraph({ kind: "state" }, { windowDays: 30, maxEvents: 80, maxTopics: 18 });
  const title = "AP brain map · strategy room";
  const subtitle = "Every minister, constituency, event and topic — and how they connect";

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Brain map</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">{title}</h1>
      <p className="mt-1 text-sm text-muted">{subtitle}. Hover for detail, click to open the entity, drag nodes to find the shape of the moment.</p>

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
          <p className="mt-1">Tight clusters around a topic = a narrative is forming. Bright-red events crowding a minister = pre-emptive comms needed.</p>
        </div>
        <div className="rounded border border-border bg-white p-3">
          <div className="text-[10px] uppercase tracking-wider text-bronze">Window</div>
          <p className="mt-1">Last 30 days. Top {graph.nodes.filter((n) => n.kind === "event").length} signals by SNT, top topics by frequency.</p>
        </div>
      </div>
    </div>
  );
}
