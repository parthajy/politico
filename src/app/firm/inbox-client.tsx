"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { sntBadge, shortSource, sentimentColor } from "@/lib/format";
import { formatDistanceToNowStrict } from "date-fns";
import { EventDetailSheet } from "./event-detail-sheet";
import { InfoTooltip } from "@/components/info-tooltip";
import { StarButton } from "@/components/star-button";
import { defineTerm } from "@/lib/glossary";

type InboxRow = {
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
  starred: boolean;
};

const SOURCES = ["reddit", "youtube", "google_news", "rss", "gdelt"];
const STATUSES = ["new", "monitoring", "escalated", "closed"];

export function InboxClient({
  rows,
  districts,
  initial,
}: {
  rows: InboxRow[];
  districts: { id: number; name: string }[];
  initial: { source?: string; district?: string; status?: string; min_snt?: string };
}) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();
  const [search, setSearch] = useState("");
  const [openEventId, setOpenEventId] = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (!search.trim()) return rows;
    const q = search.toLowerCase();
    return rows.filter((r) =>
      r.title.toLowerCase().includes(q) ||
      (r.body ?? "").toLowerCase().includes(q) ||
      (r.district ?? "").toLowerCase().includes(q) ||
      (r.constituency ?? "").toLowerCase().includes(q),
    );
  }, [rows, search]);

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    start(() => router.push(`${pathname}?${params.toString()}`));
  }

  const opened = openEventId ? rows.find((r) => r.id === openEventId) ?? null : null;

  return (
    <>
      <div className="mt-6 flex flex-wrap items-center gap-2">
        <Input
          placeholder="Search title, district, constituency…"
          className="max-w-sm"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
        <Select label="Source" value={initial.source ?? "all"} onChange={(v) => setParam("source", v)} options={[
          { value: "all", label: "All sources" },
          ...SOURCES.map((s) => ({ value: s, label: shortSource(s) })),
        ]} />
        <Select label="District" value={initial.district ?? "all"} onChange={(v) => setParam("district", v)} options={[
          { value: "all", label: "All districts" },
          ...districts.map((d) => ({ value: String(d.id), label: d.name })),
        ]} />
        <Select label="Status" value={initial.status ?? "all"} onChange={(v) => setParam("status", v)} options={[
          { value: "all", label: "All status" },
          ...STATUSES.map((s) => ({ value: s, label: s })),
        ]} />
        <Select label="Min SNT" value={initial.min_snt ?? "all"} onChange={(v) => setParam("min_snt", v)} options={[
          { value: "all", label: "Any SNT" },
          { value: "0.85", label: "S1 only (≥0.85)" },
          { value: "0.6", label: "S2+ (≥0.6)" },
          { value: "0.35", label: "S3+ (≥0.35)" },
        ]} />
        <span className="ml-auto text-xs text-muted">{filtered.length} of {rows.length} signals{pending && " · loading…"}</span>
      </div>

      <div className="mt-4 overflow-hidden rounded-lg border border-border bg-white">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-sand text-xs uppercase tracking-wider text-muted">
            <tr>
              <th className="w-16 px-3 py-2 text-left">SNT<InfoTooltip text={defineTerm("SNT score") ?? ""} /></th>
              <th className="w-20 px-3 py-2 text-left">Source</th>
              <th className="px-3 py-2 text-left">Title</th>
              <th className="w-40 px-3 py-2 text-left">Tagged<InfoTooltip text={defineTerm("Tagged") ?? ""} /></th>
              <th className="w-24 px-3 py-2 text-left">Sent<InfoTooltip text={defineTerm("Sentiment") ?? ""} /></th>
              <th className="w-24 px-3 py-2 text-left">Status<InfoTooltip text={defineTerm("Escalated") ?? ""} /></th>
              <th className="w-20 px-3 py-2 text-left">Age</th>
              <th className="w-8 px-2 py-2"></th>
            </tr>
          </thead>
          <tbody>
            {filtered.length === 0 && (
              <tr><td colSpan={8} className="px-3 py-8 text-center text-muted">No signals match the current filters.</td></tr>
            )}
            {filtered.map((r) => {
              const snt = sntBadge(r.snt_score ?? 0);
              return (
                <tr
                  key={r.id}
                  onClick={() => setOpenEventId(r.id)}
                  className="cursor-pointer border-b border-border last:border-0 hover:bg-sand/50"
                >
                  <td className="px-3 py-2"><Badge variant={snt.variant}>{snt.label}</Badge></td>
                  <td className="px-3 py-2 text-xs text-muted">{shortSource(r.source)}</td>
                  <td className="px-3 py-2">
                    <div className="line-clamp-2 font-medium text-navy">{r.title}</div>
                    {r.topic_tags?.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {r.topic_tags.slice(0, 2).map((t) => (
                          <span key={t} className="rounded bg-sand-deep px-1.5 py-0.5 text-[10px] text-muted">{t}</span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-3 py-2 text-xs">
                    {r.constituency ? <div className="text-navy">{r.constituency}</div> : <div className="text-muted">—</div>}
                    {r.district && <div className="text-muted">{r.district}</div>}
                  </td>
                  <td className="px-3 py-2">
                    <span className="inline-block h-2 w-2 rounded-full" style={{ background: sentimentColor(r.sentiment) }} />
                    <span className="ml-2 text-xs tabular-nums">{r.sentiment != null ? r.sentiment.toFixed(2) : "—"}</span>
                  </td>
                  <td className="px-3 py-2"><StatusPill status={r.triage_status} /></td>
                  <td className="px-3 py-2 text-xs text-muted">
                    {r.published_at ? formatDistanceToNowStrict(new Date(r.published_at)) : "—"}
                  </td>
                  <td className="px-2 py-2">
                    <StarButton eventId={r.id} initialStarred={r.starred} size="sm" />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {opened && (
        <EventDetailSheet
          row={opened}
          onClose={() => setOpenEventId(null)}
        />
      )}
    </>
  );
}

function Select({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <label className="flex items-center gap-2 text-xs text-muted">
      <span className="sr-only">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
      >
        {options.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </label>
  );
}

function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    new: "bg-sand text-navy",
    monitoring: "bg-bronze/20 text-bronze-dark",
    escalated: "bg-severity-1/15 text-severity-1",
    closed: "bg-muted/15 text-muted",
  };
  return <span className={`rounded px-2 py-0.5 text-xs ${map[status] ?? map.new}`}>{status}</span>;
}

export { Button };
