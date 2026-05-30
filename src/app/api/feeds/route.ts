import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  source: z.enum(["rss", "google_news"]),
  tag: z.string().min(2).max(80).regex(/^[a-z0-9_]+$/, "lowercase letters, digits, underscore only"),
  display_name: z.string().min(2).max(120),
  url: z.string().url(),
  is_broad: z.boolean().default(false),
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
  const { error } = await admin.from("feed_registry").insert({
    source: body.source,
    tag: body.tag,
    display_name: body.display_name,
    url: body.url,
    is_broad: body.is_broad,
    active: true,
    created_by: auth.user_id,
  });
  if (error) {
    if (error.message.includes("duplicate") || error.code === "23505") {
      return NextResponse.json({ ok: false, error: `A feed with tag "${body.tag}" already exists.` }, { status: 400 });
    }
    return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  }

  await auditLog({
    user_id: auth.user_id,
    action: "feed_create",
    entity_type: "feed_registry",
    entity_id: body.tag,
    metadata: body as unknown as Record<string, unknown>,
  });
  return NextResponse.json({ ok: true });
}
