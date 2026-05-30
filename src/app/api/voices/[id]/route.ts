import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  name: z.string().min(2).max(120).optional(),
  role: z.string().max(120).nullable().optional(),
  outlet_name: z.string().max(120).nullable().optional(),
  district_id: z.number().int().nullable().optional(),
  constituency_id: z.number().int().nullable().optional(),
  contact_email: z.string().email().or(z.literal("")).nullable().optional(),
  contact_phone: z.string().max(40).nullable().optional(),
  social_handles: z.record(z.string(), z.string()).optional(),
  coverage_topics: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  reach_estimate: z.number().int().nullable().optional(),
  relationship_status: z.enum(["warm", "cool", "hostile", "unknown"]).optional(),
  notes: z.string().max(4000).nullable().optional(),
  active: z.boolean().optional(),
});

async function requireFirm() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { error: "unauthenticated", status: 401 as const };
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (!me || !["firm_admin", "firm_analyst", "superadmin"].includes(me.role)) {
    return { error: "forbidden", status: 403 as const };
  }
  return { user_id: user.id };
}

export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFirm();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: z.infer<typeof PatchBody>;
  try { body = PatchBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  const admin = createAdminClient();
  const update: Record<string, unknown> = { ...body };
  // Normalise empty strings → null for nullable fields
  for (const k of ["role", "outlet_name", "contact_email", "contact_phone", "notes"] as const) {
    if (update[k] === "") update[k] = null;
  }
  const { error } = await admin.from("voices").update(update).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: auth.user_id,
    action: "voice_update",
    entity_type: "voices",
    entity_id: params.id,
    metadata: body as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}

// DELETE archives (sets active=false) rather than hard-delete, so analytics + story
// joins keep working historically.
export async function DELETE(_req: Request, { params }: { params: { id: string } }) {
  const auth = await requireFirm();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { error } = await admin.from("voices").update({ active: false }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: auth.user_id,
    action: "voice_archive",
    entity_type: "voices",
    entity_id: params.id,
    metadata: {},
  });
  return NextResponse.json({ ok: true });
}
