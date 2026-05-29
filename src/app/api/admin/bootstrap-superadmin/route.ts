import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

// POST /api/admin/bootstrap-superadmin
//
// ONE-TIME use to create the very first superadmin on a fresh deployment
// (since /super/team only lets EXISTING superadmins create more).
//
// Protected by BOOTSTRAP_SECRET env var. Set it once, hit this endpoint,
// then REMOVE the env var from Vercel and redeploy. The endpoint refuses to
// run without it set, so leaving it absent is the safe default state.
//
// Usage:
//   1. In Vercel: add BOOTSTRAP_SECRET = <long random string>
//   2. Redeploy
//   3. curl -X POST https://your-domain/api/admin/bootstrap-superadmin \
//          -H "Authorization: Bearer <BOOTSTRAP_SECRET>" \
//          -H "Content-Type: application/json" \
//          -d '{"email":"you@samvidya.com","full_name":"Your Name"}'
//   4. Sign in at /login using the email OTP flow.
//   5. Remove BOOTSTRAP_SECRET from Vercel and redeploy.

const Body = z.object({
  email: z.string().email(),
  full_name: z.string().min(2).max(120),
});

export async function POST(req: Request) {
  const secret = process.env.BOOTSTRAP_SECRET;
  if (!secret) {
    return NextResponse.json({
      ok: false,
      error: "Bootstrap is disabled. Set BOOTSTRAP_SECRET env var, redeploy, run this once, then remove it.",
    }, { status: 403 });
  }
  const auth = req.headers.get("authorization");
  if (auth !== `Bearer ${secret}`) {
    return NextResponse.json({ ok: false, error: "invalid bootstrap secret" }, { status: 401 });
  }

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const admin = createAdminClient();

  // Find or create the auth user
  const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list.users.find((u) => u.email?.toLowerCase() === body.email.toLowerCase());

  let userId: string;
  let mode: "created" | "promoted";

  if (existing) {
    // Already exists — just promote to superadmin via public.users upsert
    userId = existing.id;
    mode = "promoted";
    await admin.auth.admin.updateUserById(existing.id, { email_confirm: true });
  } else {
    // Create with a throwaway password they'll never use (they sign in via OTP).
    const tmpPwd = randomBytes(24).toString("base64url");
    const { data: created, error: cErr } = await admin.auth.admin.createUser({
      email: body.email,
      password: tmpPwd,
      email_confirm: true,
      user_metadata: { full_name: body.full_name, role: "superadmin" },
    });
    if (cErr || !created.user) {
      return NextResponse.json({ ok: false, error: cErr?.message ?? "create user failed" }, { status: 500 });
    }
    userId = created.user.id;
    mode = "created";
  }

  const { error: pErr } = await admin.from("users").upsert({
    id: userId,
    email: body.email,
    full_name: body.full_name,
    role: "superadmin",
    active: true,
    joined_at: new Date().toISOString().slice(0, 10),
  });
  if (pErr) return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });

  await auditLog({
    user_id: null,
    action: "bootstrap_superadmin",
    entity_type: "users",
    entity_id: userId,
    metadata: { email: body.email, mode },
  });

  return NextResponse.json({
    ok: true,
    mode,
    user_id: userId,
    note: "Superadmin ready. Sign in at /login via the email OTP flow. After confirming, REMOVE BOOTSTRAP_SECRET from your env and redeploy.",
  });
}
