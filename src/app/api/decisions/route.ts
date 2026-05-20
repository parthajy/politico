import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({
  title: z.string().min(4).max(200),
  summary: z.string().max(2000).nullable().optional(),
  kind: z.enum(["policy_change", "public_statement", "cabinet_decision", "minister_directive", "investigation", "visit", "communication_freeze", "other"]),
  decided_on: z.string().optional(),
  decided_by_role: z.string().max(120).nullable().optional(),
  scope_type: z.enum(["cm", "minister", "constituency"]).nullable().optional(),
  scope_id: z.number().int().nullable().optional(),
  triggering_event_ids: z.array(z.string().uuid()).optional(),
  outcome: z.string().max(2000).nullable().optional(),
});

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const { data, error } = await sb.from("decisions").insert({
    title: body.title,
    summary: body.summary ?? null,
    kind: body.kind,
    decided_on: body.decided_on ?? new Date().toISOString().slice(0, 10),
    decided_by_role: body.decided_by_role ?? null,
    scope_type: body.scope_type ?? null,
    scope_id: body.scope_id ?? null,
    triggering_event_ids: body.triggering_event_ids ?? [],
    outcome: body.outcome ?? null,
    recorded_by: user.id,
  }).select("id").single();

  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await auditLog({ user_id: user.id, action: "decision_record", entity_type: "decisions", entity_id: data.id, metadata: { title: body.title, kind: body.kind } });
  return NextResponse.json({ ok: true, id: data.id });
}
