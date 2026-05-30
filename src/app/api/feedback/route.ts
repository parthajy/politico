import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const Body = z.object({
  kind: z.enum(["bug", "idea", "praise", "other"]),
  message: z.string().min(3).max(4000),
  page: z.string().max(500).optional(),
});

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }

  const { data: profile } = await sb.from("users").select("email, role").eq("id", user.id).maybeSingle();

  // Use admin client to bypass RLS for insert audit-style table.
  const admin = createAdminClient();
  const { error } = await admin.from("feedback").insert({
    user_id: user.id,
    user_email: profile?.email ?? user.email ?? null,
    user_role: profile?.role ?? null,
    kind: body.kind,
    message: body.message,
    page: body.page ?? null,
    user_agent: req.headers.get("user-agent") ?? null,
  });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
