import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { sentimentColor } from "@/lib/format";
import { subDays } from "date-fns";

// MLA spotlight — most-mentioned and most-negatively-covered MLAs this week.
// A leaderboard the CMO scans to see who needs cover.

export async function MlaSpotlightWidget() {
  const sb = createClient();
  const since = subDays(new Date(), 7).toISOString();

  const { data: rows } = await sb
    .from("classifications")
    .select("mla_id, sentiment")
    .not("mla_id", "is", null)
    .gte("classified_at", since);

  const agg = new Map<number, { count: number; sum: number; neg: number }>();
  for (const r of rows ?? []) {
    const id = r.mla_id as number;
    const a = agg.get(id) ?? { count: 0, sum: 0, neg: 0 };
    a.count += 1;
    a.sum += Number(r.sentiment ?? 0);
    if (Number(r.sentiment ?? 0) <= -0.15) a.neg += 1;
    agg.set(id, a);
  }

  const ids = Array.from(agg.keys());
  if (ids.length === 0) {
    return (
      <Card>
        <CardHeader><CardTitle>MLA spotlight</CardTitle></CardHeader>
        <CardContent className="text-xs text-muted">No MLA-tagged signals this week.</CardContent>
      </Card>
    );
  }

  const { data: mlas } = await sb
    .from("mlas")
    .select("id, name, party, constituency_id, is_minister")
    .in("id", ids);
  const mlaById = new Map((mlas ?? []).map((m) => [m.id, m]));

  const enriched = ids.map((id) => {
    const a = agg.get(id)!;
    const m = mlaById.get(id);
    return {
      id,
      name: m?.name ?? "Unknown",
      party: m?.party ?? null,
      constituency_id: m?.constituency_id ?? null,
      is_minister: m?.is_minister ?? false,
      count: a.count,
      avg: a.sum / a.count,
      neg: a.neg,
    };
  });

  const mostMentioned = [...enriched].sort((a, b) => b.count - a.count).slice(0, 5);
  const mostNegative = [...enriched].filter((e) => e.count >= 2).sort((a, b) => a.avg - b.avg).slice(0, 5);

  return (
    <Card>
      <CardHeader>
        <CardTitle>MLA spotlight · this week</CardTitle>
        <p className="mt-0.5 text-xs text-muted">Who&apos;s in the conversation, and who&apos;s taking heat.</p>
      </CardHeader>
      <CardContent>
        <div className="grid gap-5 sm:grid-cols-2">
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Most mentioned</div>
            <ul className="mt-2 space-y-1.5">
              {mostMentioned.map((m, i) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="flex items-center gap-1.5">
                    <span className="w-3 text-muted">{i + 1}</span>
                    <MlaName m={m} />
                  </span>
                  <span className="numeric-callout text-navy">{m.count}</span>
                </li>
              ))}
            </ul>
          </div>
          <div>
            <div className="text-[10px] uppercase tracking-wider text-muted">Most negative coverage</div>
            <ul className="mt-2 space-y-1.5">
              {mostNegative.length === 0 && <li className="text-xs text-muted">None notably negative.</li>}
              {mostNegative.map((m) => (
                <li key={m.id} className="flex items-center justify-between gap-2 text-xs">
                  <MlaName m={m} />
                  <span className="flex items-center gap-1">
                    <span className="h-2 w-2 rounded-full" style={{ background: sentimentColor(m.avg) }} />
                    <span className="numeric-callout tabular-nums text-navy">{m.avg.toFixed(2)}</span>
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

function MlaName({ m }: { m: { name: string; party: string | null; constituency_id: number | null; is_minister: boolean } }) {
  const inner = (
    <span>
      <span className="text-navy">{m.name}</span>
      {m.party && <span className="text-muted"> · {m.party}</span>}
      {m.is_minister && <span className="text-bronze"> · Min</span>}
    </span>
  );
  return m.constituency_id
    ? <Link href={`/party/constituency/${m.constituency_id}`} className="hover:underline">{inner}</Link>
    : inner;
}
