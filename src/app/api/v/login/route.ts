import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

// Volunteer PWA login: paste the token issued by superadmin. Server validates
// against volunteer_sessions, looks up the volunteer's email, signs them in via
// Supabase Auth using email + token-as-password.
//
// On success the response sets the session cookie via the regular Supabase SSR
// flow (which the createClient() helper handles).

const Body = z.object({ token: z.string().min(8).max(200) });

export async function POST(req: Request) {
  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const admin = createAdminClient();
  // Look up the volunteer by token. Service role key bypasses RLS.
  const { data: sess } = await admin
    .from("volunteer_sessions")
    .select("user_id, expires_at")
    .eq("token", body.token)
    .maybeSingle();
  if (!sess) {
    return NextResponse.json({ ok: false, error: "Invalid token" }, { status: 401 });
  }
  if (new Date(sess.expires_at) < new Date()) {
    return NextResponse.json({ ok: false, error: "Token expired — ask the desk to rotate" }, { status: 401 });
  }

  // Pull the email so we can sign in via Supabase
  const { data: profile } = await admin.from("users").select("email, full_name, role, active").eq("id", sess.user_id).single();
  if (!profile || profile.role !== "volunteer") {
    return NextResponse.json({ ok: false, error: "Not a volunteer account" }, { status: 401 });
  }
  if (!profile.active) {
    return NextResponse.json({ ok: false, error: "Account deactivated. Contact the desk." }, { status: 403 });
  }

  // Sign in with the session client so the cookie is set on the response
  const sb = createClient();
  const { error: signErr } = await sb.auth.signInWithPassword({
    email: profile.email,
    password: body.token,
  });
  if (signErr) {
    return NextResponse.json({ ok: false, error: signErr.message }, { status: 401 });
  }

  // Update last_seen + device label (UA only — kept short)
  const ua = req.headers.get("user-agent")?.slice(0, 120) ?? null;
  await admin.from("volunteer_sessions").update({
    last_seen_at: new Date().toISOString(),
    device_label: ua,
  }).eq("user_id", sess.user_id);

  await auditLog({
    user_id: sess.user_id,
    action: "volunteer_login",
    entity_type: "volunteer_sessions",
    entity_id: sess.user_id,
    metadata: { ua },
  });

  return NextResponse.json({ ok: true, name: profile.full_name });
}
