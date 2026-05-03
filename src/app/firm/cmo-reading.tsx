import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { sntBadge } from "@/lib/format";
import { formatDistanceToNowStrict } from "date-fns";

// Surfaces what party_viewer accounts have starred recently. Doctrine 6 in
// reverse: the leader's attention IS the strategic signal — let the firm
// see what the boss is reading.

export async function CmoReadingWidget() {
  const sb = createClient();

  const { data: stars } = await sb
    .from("event_stars")
    .select(`
      created_at, note, user_id,
      users!inner(role, full_name, email),
      events!inner(id, title, source, published_at, url),
      classifications:event_id(snt_score, sentiment, districts(name), constituencies(name))
    `)
    .order("created_at", { ascending: false })
    .limit(10);

  const partyStars = (stars ?? []).filter((s) => {
    const u = (s.users as unknown) as { role: string };
    return u?.role === "party_viewer";
  });

  if (partyStars.length === 0) {
    return (
      <Card className="mt-6 border-l-4 border-l-bronze">
        <CardHeader>
          <CardTitle>What the CMO is reading</CardTitle>
          <CardDescription>The boss hasn&apos;t starred anything yet. When they do, it&apos;ll show up here.</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  return (
    <Card className="mt-6 border-l-4 border-l-bronze">
      <CardHeader>
        <CardTitle>What the CMO is reading</CardTitle>
        <CardDescription>Doctrine 6: the leader&apos;s attention is the strategic signal. Bias your day toward what the boss starred.</CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {partyStars.map((s) => {
          const u = (s.users as unknown) as { full_name: string | null; email: string };
          const ev = (s.events as unknown) as { id: string; title: string; source: string; published_at: string | null; url: string | null };
          const cls = (s.classifications as unknown) as { snt_score: number | null; sentiment: number | null; districts: { name: string } | null; constituencies: { name: string } | null } | null;
          const snt = sntBadge(cls?.snt_score ?? 0);
          return (
            <div key={`${s.user_id}-${ev.id}`} className="flex gap-3 border-b border-border pb-3 last:border-0">
              <Badge variant={snt.variant}>{snt.label}</Badge>
              <div className="flex-1">
                <div className="line-clamp-2 text-sm font-medium text-navy">
                  {ev.url ? <a href={ev.url} target="_blank" rel="noreferrer" className="hover:underline">{ev.title}</a> : ev.title}
                </div>
                <div className="mt-0.5 flex flex-wrap items-center gap-2 text-xs text-muted">
                  <span>{u.full_name ?? u.email}</span>
                  <span>· {formatDistanceToNowStrict(new Date(s.created_at))} ago</span>
                  {cls?.constituencies?.name && <Link href={`/firm/constituency/${"" /* would need id */}`} className="text-bronze">{cls.constituencies.name}</Link>}
                  {!cls?.constituencies && cls?.districts?.name && <span>{cls.districts.name}</span>}
                </div>
                {s.note && <div className="mt-1 text-xs italic text-bronze">&ldquo;{s.note}&rdquo;</div>}
              </div>
            </div>
          );
        })}
      </CardContent>
    </Card>
  );
}
