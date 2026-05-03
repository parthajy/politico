import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Body = z.object({
  id: z.string().uuid(),
  status: z.enum(["idea", "in_production", "published"]),
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

  const update: Record<string, unknown> = { status: body.status };
  if (body.status === "published") update.published_at = new Date().toISOString();

  const { error } = await sb.from("stories").update(update).eq("id", body.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({ user_id: user.id, action: `story_${body.status}`, entity_type: "stories", entity_id: body.id });
  return NextResponse.json({ ok: true });
}
