import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  active: z.boolean().optional(),
  is_broad: z.boolean().optional(),
  display_name: z.string().min(2).max(120).optional(),
  url: z.string().url().optional(),
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

export async function PATCH(req: Request, { params }: { params: { tag: string } }) {
  const auth = await requireFirm();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  let body: z.infer<typeof PatchBody>;
  try { body = PatchBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  const admin = createAdminClient();
  const { error } = await admin.from("feed_registry").update(body).eq("tag", params.tag);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: auth.user_id,
    action: "feed_update",
    entity_type: "feed_registry",
    entity_id: params.tag,
    metadata: body as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}

export async function DELETE(_req: Request, { params }: { params: { tag: string } }) {
  const auth = await requireFirm();
  if ("error" in auth) return NextResponse.json({ ok: false, error: auth.error }, { status: auth.status });

  const admin = createAdminClient();
  const { error } = await admin.from("feed_registry").delete().eq("tag", params.tag);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: auth.user_id,
    action: "feed_delete",
    entity_type: "feed_registry",
    entity_id: params.tag,
    metadata: {},
  });
  return NextResponse.json({ ok: true });
}
