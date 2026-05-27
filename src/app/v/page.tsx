import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
import { VolunteerHome } from "./home-client";

export const dynamic = "force-dynamic";

export default async function VolunteerLanding() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/v/login");

  const { data: profile } = await sb.from("users").select("full_name, email, role, district_id, districts(name)").eq("id", user.id).single();
  if (profile?.role !== "volunteer") redirect("/v/login?error=not_a_volunteer");

  // Their own submissions
  const { data: subs } = await sb
    .from("field_submissions")
    .select("id, url, note, status, created_at, reviewed_at, rejection_reason, accepted_event_id")
    .order("created_at", { ascending: false })
    .limit(20);

  const counts = { total: subs?.length ?? 0, accepted: 0, rejected: 0, pending: 0 };
  for (const s of subs ?? []) {
    if (s.status === "accepted") counts.accepted++;
    else if (s.status === "rejected") counts.rejected++;
    else counts.pending++;
  }

  const district = (profile?.districts as unknown) as { name: string } | null;

  return (
    <VolunteerHome
      name={profile?.full_name ?? profile?.email ?? "Volunteer"}
      district={district?.name ?? null}
      counts={counts}
      submissions={(subs ?? []).map((s) => ({
        id: s.id, url: s.url, note: s.note, status: s.status,
        created_at: s.created_at, reviewed_at: s.reviewed_at,
        rejection_reason: s.rejection_reason,
      }))}
    />
  );
}
