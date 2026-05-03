import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({ note: z.string().max(500).optional().nullable() });

export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: z.infer<typeof Body> = {};
  try { body = Body.parse(await req.json().catch(() => ({}))); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const { error } = await sb
    .from("event_stars")
    .upsert({ user_id: user.id, event_id: params.id, note: body.note ?? null }, { onConflict: "user_id,event_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({ user_id: user.id, action: "event_star", entity_type: "events", entity_id: params.id, metadata: { note: body.note ?? null } });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  const { error } = await sb.from("event_stars").delete().eq("user_id", user.id).eq("event_id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({ user_id: user.id, action: "event_unstar", entity_type: "events", entity_id: params.id });
  return NextResponse.json({ ok: true });
}
