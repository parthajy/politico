"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/input";
import { sntBadge, sentimentColor, shortSource } from "@/lib/format";
import { formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

type Row = {
  id: string;
  source: string;
  title: string;
  body: string | null;
  url: string | null;
  published_at: string | null;
  ingested_at: string;
  sentiment: number | null;
  snt_score: number | null;
  topic_tags: string[];
  district: string | null;
  constituency: string | null;
  triage_status: string;
};

type Detail = {
  language: string | null;
  sentiment_justification: string | null;
  entities: { type: string; value: string; confidence: number }[] | null;
  snt_velocity: number | null;
  snt_credibility: number | null;
  snt_vector: number | null;
  mla_name: string | null;
};

type TriageStatus = "new" | "monitoring" | "escalated" | "closed";

export function EventDetailSheet({ row, onClose }: { row: Row; onClose: () => void }) {
  const router = useRouter();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [notes, setNotes] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [status, setStatus] = useState(row.triage_status);

  useEffect(() => {
    let cancelled = false;
    const sb = createClient();
    (async () => {
      const [{ data: cls }, { data: tri }] = await Promise.all([
        sb
          .from("classifications")
          .select("language, sentiment_justification, entities, snt_velocity, snt_credibility, snt_vector, mlas(name)")
          .eq("event_id", row.id)
          .maybeSingle(),
        sb.from("triage").select("notes, status").eq("event_id", row.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const mlaJoin = (cls?.mlas as unknown) as { name: string } | null;
      setDetail({
        language: cls?.language ?? null,
        sentiment_justification: cls?.sentiment_justification ?? null,
        entities: (cls?.entities as Detail["entities"]) ?? null,
        snt_velocity: cls?.snt_velocity ?? null,
        snt_credibility: cls?.snt_credibility ?? null,
        snt_vector: cls?.snt_vector ?? null,
        mla_name: mlaJoin?.name ?? null,
      });
      setNotes(tri?.notes ?? "");
      if (tri?.status) setStatus(tri.status);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [row.id]);

  async function save(newStatus: TriageStatus) {
    setSaving(newStatus);
    try {
      const r = await fetch(`/api/triage`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ event_id: row.id, status: newStatus, notes }),
      });
      const j = await r.json();
      if (!r.ok || !j.ok) {
        toast.error(j.error ?? "Triage update failed");
      } else {
        toast.success(`Marked ${newStatus}`);
        setStatus(newStatus);
        router.refresh();
      }
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setSaving(null);
    }
  }

  const snt = sntBadge(row.snt_score ?? 0);

  return (
    <div className="fixed inset-0 z-40 flex" onClick={onClose}>
      <div className="flex-1 bg-navy-deep/30" />
      <aside
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full max-w-xl flex-col overflow-y-auto border-l border-border bg-white shadow-sm"
      >
        <div className="border-b border-border bg-sand px-6 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Badge variant={snt.variant}>{snt.label}</Badge>
              <span className="text-xs uppercase tracking-wider text-muted">{shortSource(row.source)}</span>
              {row.published_at && (
                <span className="text-xs text-muted">· {formatDistanceToNowStrict(new Date(row.published_at))} ago</span>
              )}
            </div>
            <button onClick={onClose} className="text-muted hover:text-foreground" aria-label="Close">✕</button>
          </div>
          <h2 className="mt-2 font-serif text-lg font-bold leading-tight text-navy">{row.title}</h2>
          {row.url && (
            <a href={row.url} target="_blank" rel="noreferrer" className="mt-1 inline-block text-xs text-bronze underline">
              Open source ↗
            </a>
          )}
        </div>

        <div className="flex-1 px-6 py-4">
          <div className="grid grid-cols-3 gap-3 rounded-lg border border-border bg-sand/40 p-3 text-xs">
            <Stat label="SNT" value={row.snt_score?.toFixed(2) ?? "—"} />
            <Stat label="Velocity" value={detail?.snt_velocity?.toFixed(2) ?? "—"} />
            <Stat label="Credibility" value={detail?.snt_credibility?.toFixed(2) ?? "—"} />
            <Stat label="Vector" value={detail?.snt_vector?.toFixed(2) ?? "—"} />
            <Stat label="Sentiment" value={row.sentiment != null ? row.sentiment.toFixed(2) : "—"} dotColor={sentimentColor(row.sentiment)} />
            <Stat label="Language" value={detail?.language ?? "—"} />
          </div>

          {detail?.sentiment_justification && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-muted">Why this score</div>
              <p className="mt-1 text-sm">{detail.sentiment_justification}</p>
            </div>
          )}

          <div className="mt-4 grid grid-cols-2 gap-3 text-sm">
            <KV label="District" value={row.district} />
            <KV label="Constituency" value={row.constituency} />
            <KV label="MLA" value={detail?.mla_name ?? null} />
            <KV label="Topic tags" value={row.topic_tags.length > 0 ? row.topic_tags.join(", ") : null} />
          </div>

          {detail?.entities && detail.entities.length > 0 && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-muted">Entities</div>
              <div className="mt-1 flex flex-wrap gap-1">
                {detail.entities.map((e, i) => (
                  <span key={i} className="rounded bg-sand-deep px-1.5 py-0.5 text-xs text-navy">
                    {e.value} <span className="text-muted">{e.type}</span>
                  </span>
                ))}
              </div>
            </div>
          )}

          {row.body && (
            <div className="mt-4">
              <div className="text-xs uppercase tracking-wider text-muted">Excerpt</div>
              <p className="mt-1 max-h-64 overflow-y-auto whitespace-pre-wrap text-sm text-foreground/90">{row.body.slice(0, 1500)}</p>
            </div>
          )}

          <div className="mt-6 border-t border-border pt-4">
            <div className="text-xs uppercase tracking-wider text-muted">Triage</div>
            <div className="mt-2 text-sm">Current status: <span className="font-medium text-navy">{status}</span></div>
            <Textarea
              placeholder="Add a note for the team…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="mt-2"
            />
            <div className="mt-3 flex flex-wrap gap-2">
              <Button size="sm" variant="outline" disabled={saving === "monitoring" || loading} onClick={() => save("monitoring")}>
                {saving === "monitoring" ? "…" : "Mark monitoring"}
              </Button>
              <Button size="sm" variant="bronze" disabled={saving === "escalated" || loading} onClick={() => save("escalated")}>
                {saving === "escalated" ? "…" : "Escalate"}
              </Button>
              <Button size="sm" variant="ghost" disabled={saving === "closed" || loading} onClick={() => save("closed")}>
                {saving === "closed" ? "…" : "Close"}
              </Button>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Stat({ label, value, dotColor }: { label: string; value: string; dotColor?: string }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 flex items-center gap-1 numeric-callout text-sm text-navy">
        {dotColor && <span className="h-2 w-2 rounded-full" style={{ background: dotColor }} />}
        {value}
      </div>
    </div>
  );
}

function KV({ label, value }: { label: string; value: string | null }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted">{label}</div>
      <div className="mt-0.5 text-sm text-navy">{value ?? <span className="text-muted">—</span>}</div>
    </div>
  );
}
