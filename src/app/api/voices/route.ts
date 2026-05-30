import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  name: z.string().min(2).max(120),
  role: z.string().max(120).optional().nullable(),
  outlet_name: z.string().max(120).optional().nullable(),
  district_id: z.number().int().nullable().optional(),
  constituency_id: z.number().int().nullable().optional(),
  contact_email: z.string().email().optional().or(z.literal("")).nullable(),
  contact_phone: z.string().max(40).optional().nullable(),
  social_handles: z.record(z.string(), z.string()).optional(),    // { twitter, facebook, instagram, ... }
  coverage_topics: z.array(z.string()).optional(),
  languages: z.array(z.string()).optional(),
  reach_estimate: z.number().int().nullable().optional(),
  relationship_status: z.enum(["warm", "cool", "hostile", "unknown"]).optional(),
  notes: z.string().max(4000).optional().nullable(),
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

export async function POST(req: Request) {
  const auth = await requireFirm();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: z.infer<typeof PostBody>;
  try { body = PostBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  const admin = createAdminClient();
  const { data, error } = await admin.from("voices").insert({
    name: body.name,
    role: body.role || null,
    outlet_name: body.outlet_name || null,
    district_id: body.district_id ?? null,
    constituency_id: body.constituency_id ?? null,
    contact_email: body.contact_email || null,
    contact_phone: body.contact_phone || null,
    social_handles: body.social_handles ?? {},
    coverage_topics: body.coverage_topics ?? [],
    languages: body.languages ?? [],
    reach_estimate: body.reach_estimate ?? null,
    relationship_status: body.relationship_status ?? "unknown",
    notes: body.notes || null,
    active: true,
    joined_at: new Date().toISOString().slice(0, 10),
  }).select("id").single();
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: auth.user_id,
    action: "voice_create",
    entity_type: "voices",
    entity_id: data.id,
    metadata: { name: body.name, district_id: body.district_id ?? null },
  });

  return NextResponse.json({ ok: true, id: data.id });
}
