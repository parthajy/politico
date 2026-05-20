import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { assessThreat, buildScopeContext } from "@/lib/ai/threat-radar";
import { MODEL_BRIEF } from "@/lib/ai/openai";
import { subDays } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Refresh: CM + top 5 most-active ministers + top 5 most-active constituencies.
// Runs in parallel with concurrency limit so we don't blow rate limits.

export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const userId = user.id; // capture before closure to satisfy TS narrowing
  const { data: profile } = await sb.from("users").select("role").eq("id", userId).single();
  if (profile?.role !== "firm_admin") {
    return NextResponse.json({ ok: false, error: "forbidden — admin only" }, { status: 403 });
  }

  const admin = createAdminClient();
  const since = subDays(new Date(), 14).toISOString();

  // Pick the top 5 most-active ministers and constituencies in the last 14 days.
  const [ministersRes, constsRes] = await Promise.all([
    admin
      .from("classifications")
      .select("mla_id")
      .not("mla_id", "is", null)
      .gte("classified_at", since),
    admin
      .from("classifications")
      .select("constituency_id")
      .not("constituency_id", "is", null)
      .gte("classified_at", since),
  ]);

  const mCounts = new Map<number, number>();
  for (const r of ministersRes.data ?? []) mCounts.set(r.mla_id!, (mCounts.get(r.mla_id!) ?? 0) + 1);
  const cCounts = new Map<number, number>();
  for (const r of constsRes.data ?? []) cCounts.set(r.constituency_id!, (cCounts.get(r.constituency_id!) ?? 0) + 1);

  // Filter ministers to actual ministers
  const { data: actualMinisters } = await admin.from("mlas").select("id, is_minister, is_cm").eq("is_minister", true);
  const ministerIds = new Set((actualMinisters ?? []).map((m) => m.id));
  const cmIds = new Set((actualMinisters ?? []).filter((m) => m.is_cm).map((m) => m.id));

  const topMinisters = Array.from(mCounts.entries())
    .filter(([id]) => ministerIds.has(id) && !cmIds.has(id))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const topConstituencies = Array.from(cCounts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([id]) => id);

  const jobs: { scope_type: "cm" | "minister" | "constituency"; scope_id: number | null }[] = [
    { scope_type: "cm", scope_id: null },
    ...topMinisters.map((id) => ({ scope_type: "minister" as const, scope_id: id })),
    ...topConstituencies.map((id) => ({ scope_type: "constituency" as const, scope_id: id })),
  ];

  const PARALLEL = 4;
  const results: { scope_type: string; scope_id: number | null; ok: boolean; error?: string; threat_band?: string }[] = [];
  let next = 0;
  const t0 = Date.now();

  async function worker() {
    while (true) {
      const idx = next++;
      if (idx >= jobs.length) return;
      const job = jobs[idx];
      try {
        const ctx = await buildScopeContext(job.scope_type, job.scope_id);
        const a = await assessThreat(ctx);
        await admin.from("threat_assessments").upsert({
          scope_type: job.scope_type,
          scope_id: job.scope_id,
          entity_name: ctx.entity_name,
          threat_score: a.threat_score,
          threat_band: a.threat_band,
          headline: a.headline,
          public_posture: a.public_posture,
          threats: a.threats,
          recommended_actions: a.recommended_actions,
          evidence_event_ids: a.evidence_event_ids,
          generated_by: userId,
          generated_at: new Date().toISOString(),
          model_version: MODEL_BRIEF,
        }, { onConflict: "scope_type,scope_id" });
        results.push({ scope_type: job.scope_type, scope_id: job.scope_id, ok: true, threat_band: a.threat_band });
      } catch (e) {
        results.push({ scope_type: job.scope_type, scope_id: job.scope_id, ok: false, error: (e as Error).message });
      }
    }
  }
  await Promise.all(Array.from({ length: PARALLEL }, () => worker()));

  await auditLog({
    user_id: userId,
    action: "threat_generate_all",
    entity_type: "threat",
    metadata: { ms: Date.now() - t0, total: jobs.length, ok: results.filter((r) => r.ok).length, failed: results.filter((r) => !r.ok).length },
  });

  return NextResponse.json({ ok: true, ms: Date.now() - t0, results });
}
