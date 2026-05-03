import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Patch = z.object({ body_md: z.string().min(20) });

// PATCH = save edits to draft.
// POST  = publish (sets published_at to now, approved_by to current user).
// DELETE is intentionally not supported — briefs are append-only by design.

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  let body: z.infer<typeof Patch>;
  try { body = Patch.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const { error } = await sb.from("briefs").update({ body_md: body.body_md }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await auditLog({ user_id: user.id, action: "brief_save", entity_type: "briefs", entity_id: params.id, metadata: { length: body.body_md.length } });
  return NextResponse.json({ ok: true });
}

export async function POST(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return NextResponse.json({ ok: false, error: "forbidden" }, { status: 403 });
  }

  const { error } = await sb
    .from("briefs")
    .update({ published_at: new Date().toISOString(), approved_by: user.id })
    .eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  await auditLog({ user_id: user.id, action: "brief_publish", entity_type: "briefs", entity_id: params.id });
  return NextResponse.json({ ok: true });
}
