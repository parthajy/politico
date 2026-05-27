import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { assessThreat, buildScopeContext } from "@/lib/ai/threat-radar";
import { MODEL_BRIEF } from "@/lib/ai/anthropic";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  scope_type: z.enum(["cm", "minister", "constituency"]),
  scope_id: z.number().int().nullable().optional(),
});

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin") {
    return NextResponse.json({ ok: false, error: "forbidden — admin only" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const t0 = Date.now();
  let assessment;
  try {
    const ctx = await buildScopeContext(body.scope_type, body.scope_id ?? null);
    assessment = await assessThreat(ctx);

    // Persist (upsert by scope_type + scope_id)
    const admin = createAdminClient();
    const { error } = await admin.from("threat_assessments").upsert({
      scope_type: body.scope_type,
      scope_id: body.scope_id ?? null,
      entity_name: ctx.entity_name,
      threat_score: assessment.threat_score,
      threat_band: assessment.threat_band,
      headline: assessment.headline,
      public_posture: assessment.public_posture,
      threats: assessment.threats,
      recommended_actions: assessment.recommended_actions,
      evidence_event_ids: assessment.evidence_event_ids,
      generated_by: user.id,
      generated_at: new Date().toISOString(),
      model_version: MODEL_BRIEF,
    }, { onConflict: "scope_type,scope_id" });
    if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  await auditLog({
    user_id: user.id,
    action: "threat_generate",
    entity_type: "threat",
    entity_id: `${body.scope_type}:${body.scope_id ?? "_"}`,
    metadata: { ms: Date.now() - t0, threat_band: assessment.threat_band, threat_count: assessment.threats.length },
  });

  return NextResponse.json({ ok: true, ms: Date.now() - t0, assessment });
}
