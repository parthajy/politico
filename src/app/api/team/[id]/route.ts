import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { addMonths } from "date-fns";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Patch = z.object({
  full_name: z.string().min(2).max(120).optional(),
  phone: z.string().max(40).nullable().optional(),
  photo_url: z.string().url().nullable().optional().or(z.literal("")),
  district_id: z.number().int().nullable().optional(),
  languages: z.array(z.string()).optional(),
  notes: z.string().max(2000).nullable().optional().or(z.literal("")),
  active: z.boolean().optional(),
});

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "superadmin only" }, { status: 403 });
  }

  let body: z.infer<typeof Patch>;
  try { body = Patch.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const admin = createAdminClient();
  const update: Record<string, unknown> = {};
  if (body.full_name !== undefined) update.full_name = body.full_name;
  if (body.phone !== undefined) update.phone = body.phone;
  if (body.photo_url !== undefined) update.photo_url = body.photo_url || null;
  if (body.district_id !== undefined) update.district_id = body.district_id;
  if (body.languages !== undefined) update.languages = body.languages;
  if (body.notes !== undefined) update.notes = body.notes;
  if (body.active !== undefined) update.active = body.active;

  const { error } = await admin.from("users").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: user.id,
    action: "team_member_update",
    entity_type: "users",
    entity_id: params.id,
    metadata: { fields: Object.keys(update) },
  });
  return NextResponse.json({ ok: true });
}

// POST /api/team/[id]/rotate-token — for volunteers; old session invalidated.
// Client sends ?action=rotate via query string to disambiguate without an extra route.
export async function POST(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "superadmin only" }, { status: 403 });
  }

  const url = new URL(req.url);
  if (url.searchParams.get("action") !== "rotate") {
    return NextResponse.json({ ok: false, error: "unknown action" }, { status: 400 });
  }

  const admin = createAdminClient();
  const token = randomBytes(32).toString("base64url");
  const { error } = await admin.from("volunteer_sessions").upsert({
    user_id: params.id,
    token,
    issued_at: new Date().toISOString(),
    expires_at: addMonths(new Date(), 6).toISOString(),
    device_label: null,
    device_fingerprint: null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: user.id,
    action: "volunteer_token_rotate",
    entity_type: "users",
    entity_id: params.id,
  });
  return NextResponse.json({ ok: true, token });
}
