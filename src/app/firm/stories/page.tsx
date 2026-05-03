import { createClient } from "@/lib/supabase/server";
import { StoriesBoard } from "./stories-board";

export const dynamic = "force-dynamic";

export default async function StoriesPage() {
  const sb = createClient();
  const { data: stories } = await sb
    .from("stories")
    .select("id, title, status, outlet, url, reach_estimate, published_at, created_at, district_id, constituency_id, voice_id, districts(name), constituencies(name), voices(name)")
    .order("created_at", { ascending: false });

  const rows = (stories ?? []).map((s) => ({
    id: s.id,
    title: s.title,
    status: s.status as "idea" | "in_production" | "published",
    outlet: s.outlet,
    url: s.url,
    reach_estimate: s.reach_estimate,
    published_at: s.published_at,
    district: ((s.districts as unknown) as { name: string } | null)?.name ?? null,
    constituency: ((s.constituencies as unknown) as { name: string } | null)?.name ?? null,
    voice: ((s.voices as unknown) as { name: string } | null)?.name ?? null,
  }));

  return (
    <div className="container mx-auto max-w-7xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Stories</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">Story pipeline</h1>
      <p className="mt-1 text-sm text-muted">Doctrine 5 (Visual Proof Over Claims). Drag cards to advance; published cards carry outlet, URL, and reach.</p>
      <StoriesBoard initial={rows} />
    </div>
  );
}
