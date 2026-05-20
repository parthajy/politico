"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { Badge } from "@/components/ui/badge";

// CMO-facing threat detail. Reads from threat_assessments_summary (RLS-safe view)
// so even if mis-mounted on the firm side it never leaks strategic detail.

type SummaryRow = {
  id: string;
  scope_type: string;
  scope_id: number | null;
  entity_name: string;
  threat_band: string;
  headline: string;
  public_posture: string | null;
  evidence_event_ids: string[];
  generated_at: string;
};

type EventStub = { id: string; title: string; source: string; published_at: string | null; url: string | null; constituency: string | null; district: string | null };

export function ThreatDetailSheet({ scope_type, scope_id, onClose }: { scope_type: "cm" | "minister" | "constituency"; scope_id: number | null; onClose: () => void }) {
  const [row, setRow] = useState<SummaryRow | null>(null);
  const [events, setEvents] = useState<EventStub[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const sb = createClient();
      const q = sb.from("threat_assessments_summary").select("*").eq("scope_type", scope_type);
      const { data: r } = scope_id == null
        ? await q.is("scope_id", null).limit(1).maybeSingle()
        : await q.eq("scope_id", scope_id).limit(1).maybeSingle();
      if (cancelled) return;
      setRow(r as SummaryRow | null);

      // Hydrate anchor signals (titles + URLs) from classifications
      if (r?.evidence_event_ids?.length) {
        const { data: evs } = await sb
          .from("classifications")
          .select("event_id, events!inner(id, title, source, published_at, url), districts(name), constituencies(name)")
          .in("event_id", r.evidence_event_ids);
        if (cancelled) return;
        setEvents(((evs ?? []) as unknown as { event_id: string; events: { id: string; title: string; source: string; published_at: string | null; url: string | null }; districts: { name: string } | null; constituencies: { name: string } | null }[]).map((e) => ({
          id: e.events.id,
          title: e.events.title,
          source: e.events.source,
          published_at: e.events.published_at,
          url: e.events.url,
          constituency: e.constituencies?.name ?? null,
          district: e.districts?.name ?? null,
        })));
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [scope_type, scope_id]);

  const bandVariant = row?.threat_band === "critical" || row?.threat_band === "high" ? "s1" : row?.threat_band === "medium" ? "s2" : "s3";

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-navy-deep/30" />
      <aside onClick={(e) => e.stopPropagation()} className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-white shadow-sm">
        <div className="border-b border-border bg-sand px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="text-xs uppercase tracking-wider text-muted">Threat detail</div>
            <button onClick={onClose} aria-label="Close" className="text-muted hover:text-foreground">✕</button>
          </div>
          {row && (
            <>
              <h2 className="mt-2 font-serif text-xl font-bold text-navy">{row.entity_name}</h2>
              <div className="mt-2 flex items-center gap-2">
                <Badge variant={bandVariant}>{row.threat_band.toUpperCase()}</Badge>
                <span className="text-xs text-muted capitalize">{row.scope_type === "cm" ? "Chief Minister" : row.scope_type}</span>
              </div>
            </>
          )}
        </div>

        <div className="flex-1 px-6 py-5">
          {loading && <div className="animate-pulse rounded bg-sand/40 p-4 text-sm text-muted">Loading…</div>}

          {row && (
            <>
              <section>
                <div className="text-[10px] uppercase tracking-wider text-muted">Headline</div>
                <p className="mt-1 text-sm leading-relaxed">{row.headline}</p>
              </section>

              {row.public_posture && (
                <section className="mt-5 rounded border-l-2 border-bronze bg-sand/40 p-3">
                  <div className="text-[10px] uppercase tracking-wider text-bronze">If asked in public, the line is</div>
                  <p className="mt-1 text-sm leading-relaxed italic text-foreground">&ldquo;{row.public_posture}&rdquo;</p>
                </section>
              )}

              <section className="mt-5">
                <div className="text-[10px] uppercase tracking-wider text-muted">What this is based on ({events.length} anchor signal{events.length === 1 ? "" : "s"})</div>
                {events.length === 0 && <div className="mt-1 text-xs text-muted">No anchor signals attached.</div>}
                <ul className="mt-2 space-y-2">
                  {events.map((e) => (
                    <li key={e.id} className="rounded border border-border bg-white p-2 text-xs">
                      <div className="font-medium text-navy">
                        {e.url ? <a href={e.url} target="_blank" rel="noreferrer" className="hover:underline">{e.title}</a> : e.title}
                      </div>
                      <div className="mt-0.5 text-[10px] text-muted">
                        {e.source}
                        {e.constituency && <> · {e.constituency}</>}
                        {!e.constituency && e.district && <> · {e.district}</>}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              <p className="mt-6 text-[10px] text-muted">
                Full assessment (specific threats with time horizons + recommended pre-emptive actions) is briefed in the weekly principals meeting.
              </p>
            </>
          )}
        </div>
      </aside>
    </div>
  );
}
