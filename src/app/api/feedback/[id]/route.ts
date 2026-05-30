import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const PatchBody = z.object({
  status: z.enum(["new", "triaged", "in_progress", "done", "wontfix"]),
});

// PATCH /api/feedback/[id] — superadmin updates the status of a feedback item.
export async function PATCH(req: Request, { params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "superadmin") return NextResponse.json({ ok: false, error: "superadmin only" }, { status: 403 });

  let body: z.infer<typeof PatchBody>;
  try { body = PatchBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  const admin = createAdminClient();
  const { error } = await admin.from("feedback").update({ status: body.status }).eq("id", params.id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  await auditLog({
    user_id: user.id,
    action: "feedback_status_update",
    entity_type: "feedback",
    entity_id: params.id,
    metadata: { status: body.status },
  });

  return NextResponse.json({ ok: true });
}
