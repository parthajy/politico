import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { SentimentSparkline } from "@/components/sentiment-sparkline";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";

export default async function CabinetGrid() {
  const sb = createClient();
  const { data: ministers } = await sb
    .from("mlas")
    .select("id, name, party, portfolio, is_cm, is_deputy_cm, constituency_id, constituencies(name, district_id)")
    .eq("is_minister", true)
    .order("is_cm", { ascending: false })
    .order("is_deputy_cm", { ascending: false })
    .order("name");

  const sinceDay = subDays(new Date(), 30).toISOString().slice(0, 10);
  const sinceISO = subDays(new Date(), 30).toISOString();

  const enriched = await Promise.all(
    (ministers ?? []).map(async (m) => {
      const constJoin = (m.constituencies as unknown) as { name: string; district_id: number | null } | null;

      const [{ data: trend }, { count: footprint }] = await Promise.all([
        sb
          .from("sentiment_snapshots")
          .select("date, net_sentiment")
          .eq("scope_type", "minister")
          .eq("scope_id", m.id)
          .gte("date", sinceDay)
          .order("date"),
        sb
          .from("classifications")
          .select("event_id", { count: "exact", head: true })
          .eq("mla_id", m.id)
          .gte("classified_at", sinceISO),
      ]);

      // Fall back to district trend if minister-level is empty
      let series = (trend ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
      if (series.length === 0 && constJoin?.district_id) {
        const { data: dt } = await sb
          .from("sentiment_snapshots")
          .select("date, net_sentiment")
          .eq("scope_type", "district")
          .eq("scope_id", constJoin.district_id)
          .gte("date", sinceDay)
          .order("date");
        series = (dt ?? []).map((r) => ({ date: r.date, value: Number(r.net_sentiment) }));
      }

      return {
        ...m,
        constituency_name: constJoin?.name ?? null,
        trend: series,
        footprint: footprint ?? 0,
      };
    })
  );

  const cm = enriched.filter((e) => e.is_cm);
  const dy = enriched.filter((e) => e.is_deputy_cm);
  const others = enriched.filter((e) => !e.is_cm && !e.is_deputy_cm);

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Cabinet</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Council of Ministers</h1>
      <p className="mt-1 text-sm text-muted">Active footprint and 30-day sentiment trend per minister.</p>

      {[
        { title: "Chief Minister", set: cm },
        { title: "Deputy Chief Minister", set: dy },
        { title: "Cabinet Ministers", set: others },
      ].map(({ title, set }) =>
        set.length === 0 ? null : (
          <section key={title} className="mt-8">
            <h2 className="mb-3 font-serif text-lg font-bold text-navy">{title}</h2>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {set.map((m) => (
                <Card key={m.id}>
                  <CardHeader>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="font-serif text-lg font-bold text-navy">{m.name}</div>
                        <div className="mt-1 text-xs text-muted">
                          {m.constituency_name ?? "Constituency unverified"}
                          {m.party && <span> · {m.party}</span>}
                        </div>
                      </div>
                      {m.is_cm && <Badge variant="bronze">CM</Badge>}
                      {m.is_deputy_cm && <Badge variant="bronze">Dy CM</Badge>}
                    </div>
                  </CardHeader>
                  <CardContent>
                    {m.portfolio && (
                      <p className="line-clamp-3 text-xs text-foreground/80">{m.portfolio}</p>
                    )}
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">30-day footprint</div>
                        <div className="numeric-callout text-xl text-navy">{m.footprint}</div>
                      </div>
                      <div>
                        <div className="text-[10px] uppercase tracking-wider text-muted">Sentiment trend</div>
                        <SentimentSparkline series={m.trend} height={40} />
                      </div>
                    </div>
                    {m.constituency_id && (
                      <Link
                        href={`/party/constituency/${m.constituency_id}`}
                        className="mt-3 inline-block text-xs text-bronze underline"
                      >
                        Open seat →
                      </Link>
                    )}
                  </CardContent>
                </Card>
              ))}
            </div>
          </section>
        )
      )}
    </div>
  );
}
