import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNowStrict, subDays } from "date-fns";
import { DigestToggle } from "./digest-toggle";

export const dynamic = "force-dynamic";

type Item = {
  id: number;
  kind: "minister" | "constituency" | "district" | "topic" | "narrative";
  ref_id: string;
  label: string;
  notify_threshold: number;
  last_notified_at: string | null;
  created_at: string;
};

const KIND_LABEL: Record<Item["kind"], string> = {
  minister: "Minister",
  constituency: "Constituency",
  district: "District",
  topic: "Topic",
  narrative: "Narrative",
};

const KIND_ICON: Record<Item["kind"], string> = {
  minister: "👤",
  constituency: "📍",
  district: "🗺️",
  topic: "#",
  narrative: "🧵",
};

export default async function WatchListPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return null;

  const [{ data: profile }, { data: items }] = await Promise.all([
    sb.from("users").select("daily_digest_enabled, email, full_name").eq("id", user.id).maybeSingle(),
    sb.from("watch_items").select("*").eq("user_id", user.id).order("created_at", { ascending: false }),
  ]);

  const watchItems = (items ?? []) as Item[];

  // For each watched item, compute current activity in the last 7 days.
  const sinceISO = subDays(new Date(), 7).toISOString();
  const activity = await Promise.all(
    watchItems.map(async (it) => {
      let signals = 0;
      let peakSnt = 0;
      if (it.kind === "minister") {
        const { data } = await sb.from("classifications")
          .select("snt_score")
          .eq("mla_id", parseInt(it.ref_id, 10))
          .gte("classified_at", sinceISO);
        signals = data?.length ?? 0;
        peakSnt = Math.max(0, ...(data ?? []).map((r) => Number(r.snt_score ?? 0)));
      } else if (it.kind === "constituency") {
        const { data } = await sb.from("classifications")
          .select("snt_score")
          .eq("constituency_id", parseInt(it.ref_id, 10))
          .gte("classified_at", sinceISO);
        signals = data?.length ?? 0;
        peakSnt = Math.max(0, ...(data ?? []).map((r) => Number(r.snt_score ?? 0)));
      } else if (it.kind === "district") {
        const { data } = await sb.from("classifications")
          .select("snt_score")
          .eq("district_id", parseInt(it.ref_id, 10))
          .gte("classified_at", sinceISO);
        signals = data?.length ?? 0;
        peakSnt = Math.max(0, ...(data ?? []).map((r) => Number(r.snt_score ?? 0)));
      } else if (it.kind === "topic") {
        const { data } = await sb.from("classifications")
          .select("snt_score")
          .contains("topic_tags", [it.ref_id])
          .gte("classified_at", sinceISO);
        signals = data?.length ?? 0;
        peakSnt = Math.max(0, ...(data ?? []).map((r) => Number(r.snt_score ?? 0)));
      }
      return { ...it, signals_7d: signals, peak_snt_7d: peakSnt };
    })
  );

  return (
    <div className="container mx-auto max-w-5xl px-6 py-8">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-[11px] font-medium uppercase tracking-[0.18em] text-bronze">Personal</div>
          <h1 className="mt-2 font-serif text-3xl font-bold text-navy">My watchlist</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted">
            Things you&apos;ve pinned. New activity on any of these shows up in your daily digest email at 5:30 IST.
            Use the pin icon on any minister, constituency, topic, or narrative page to add to this list.
          </p>
        </div>
        <DigestToggle enabled={profile?.daily_digest_enabled ?? true} email={profile?.email ?? ""} />
      </div>

      {watchItems.length === 0 && (
        <Card className="mt-8">
          <CardContent className="py-12 text-center">
            <div className="text-3xl">📌</div>
            <h2 className="mt-3 font-serif text-lg font-bold text-navy">No pins yet</h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-muted">
              Open any minister, constituency, or topic and click the <span className="font-medium">Watch</span> button.
              Pinned items show up here and in your daily digest.
            </p>
            <div className="mt-4 flex justify-center gap-2 text-xs">
              <Link href="/firm/narratives" className="rounded-full border border-border bg-white px-3 py-1.5 text-muted hover:bg-surface-2">Browse narratives</Link>
              <Link href="/firm" className="rounded-full border border-border bg-white px-3 py-1.5 text-muted hover:bg-surface-2">Open inbox</Link>
            </div>
          </CardContent>
        </Card>
      )}

      {watchItems.length > 0 && (
        <div className="mt-6 space-y-2">
          {activity.map((it) => {
            const sntBand = it.peak_snt_7d >= 0.85 ? "s1-soft" : it.peak_snt_7d >= 0.6 ? "s2-soft" : "s3-soft";
            const href =
              it.kind === "minister" ? `/firm/entity/person/${it.ref_id}` :
              it.kind === "constituency" ? `/firm/constituency/${it.ref_id}` :
              it.kind === "district" ? `/firm/entity/district/${it.ref_id}` :
              it.kind === "topic" ? `/firm/entity/topic/${encodeURIComponent(it.ref_id)}` :
              `/firm/narratives`;
            return (
              <Link key={it.id} href={href} className="block">
                <Card className="transition hover:border-bronze">
                  <CardHeader className="pb-3">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-surface-2 text-base">{KIND_ICON[it.kind]}</span>
                        <div>
                          <CardTitle className="text-base">{it.label}</CardTitle>
                          <CardDescription className="mt-0.5 text-xs">
                            {KIND_LABEL[it.kind]} · pinned {formatDistanceToNowStrict(new Date(it.created_at))} ago
                          </CardDescription>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant={sntBand as "s1-soft" | "s2-soft" | "s3-soft"}>
                          {it.signals_7d > 0 ? `${it.signals_7d} signals · peak SNT ${it.peak_snt_7d.toFixed(2)}` : "quiet · 7d"}
                        </Badge>
                      </div>
                    </div>
                  </CardHeader>
                </Card>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
