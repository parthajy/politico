import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { randomBytes } from "crypto";
import { addMonths } from "date-fns";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";

const Create = z.object({
  role: z.enum(["volunteer", "firm_intern", "firm_analyst", "firm_admin", "superadmin", "party_viewer"]),
  full_name: z.string().min(2).max(120),
  email: z.string().email().optional().or(z.literal("")),
  phone: z.string().max(40).optional().or(z.literal("")),
  photo_url: z.string().url().optional().or(z.literal("")),
  district_id: z.number().int().nullable().optional(),
  // Only meaningful for party_viewer: when set, this user is a cabinet
  // minister scoped to ONLY this MLA's universe. Null = CMO (full state view).
  scope_mla_id: z.number().int().nullable().optional(),
  languages: z.array(z.string()).optional(),
  notes: z.string().max(2000).optional().or(z.literal("")),
});

// POST /api/team — create a volunteer or intern user.
// - intern: standard email+password account in Supabase Auth, role 'firm_intern'.
// - volunteer: creates a user row + a 32-char API token in volunteer_sessions,
//   no password (the volunteer signs into the PWA with magic link OTP later
//   OR uses the token directly via QR code on first install).

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "superadmin only" }, { status: 403 });
  }

  let body: z.infer<typeof Create>;
  try { body = Create.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  // Interns sign in via email-OTP; only email required.
  if (body.role === "firm_intern" && !body.email) {
    return NextResponse.json({ ok: false, error: "interns need an email (sign-in via OTP)" }, { status: 400 });
  }
  // CMO / minister accounts also use email OTP.
  if (body.role === "party_viewer" && !body.email) {
    return NextResponse.json({ ok: false, error: "CMO / minister accounts need an email (sign-in via OTP)" }, { status: 400 });
  }

  const admin = createAdminClient();

  // Synthetic email for volunteers without one
  const email = body.email || `volunteer.${Date.now()}.${randomBytes(3).toString("hex")}@samvidya.local`;
  // No passwords on this platform — Supabase Auth requires a value, but it's never used.
  // Interns + everyone else sign in via OTP via the login page.
  const password = randomBytes(24).toString("base64url");

  // Create Supabase auth user (email auto-confirmed)
  const { data: created, error: cErr } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { full_name: body.full_name, role: body.role },
  });
  if (cErr || !created.user) {
    return NextResponse.json({ ok: false, error: cErr?.message ?? "create user failed" }, { status: 500 });
  }

  // Upsert profile in public.users with the right role + extended fields
  const { error: pErr } = await admin.from("users").upsert({
    id: created.user.id,
    email,
    full_name: body.full_name,
    role: body.role,
    photo_url: body.photo_url || null,
    phone: body.phone || null,
    district_id: body.district_id ?? null,
    scope_mla_id: body.role === "party_viewer" ? (body.scope_mla_id ?? null) : null,
    languages: body.languages ?? [],
    joined_at: new Date().toISOString().slice(0, 10),
    active: true,
    notes: body.notes || null,
  });
  if (pErr) {
    return NextResponse.json({ ok: false, error: pErr.message }, { status: 500 });
  }

  // For volunteers: mint a long-lived token AND set the auth-user password to it.
  // The PWA login flow signs the volunteer in with email + token-as-password — this
  // gives them a regular Supabase session (so RLS applies normally) without us
  // needing to roll a separate token-session layer in this codebase.
  let token: string | null = null;
  if (body.role === "volunteer") {
    token = `sv_v_${randomBytes(20).toString("base64url")}`;
    await admin.auth.admin.updateUserById(created.user.id, { password: token });
    await admin.from("volunteer_sessions").upsert({
      user_id: created.user.id,
      token,
      issued_at: new Date().toISOString(),
      expires_at: addMonths(new Date(), 6).toISOString(),
      device_label: null,
    });
  }

  await auditLog({
    user_id: user.id,
    action: "team_member_create",
    entity_type: "users",
    entity_id: created.user.id,
    metadata: { role: body.role, name: body.full_name, district_id: body.district_id ?? null, scope_mla_id: body.scope_mla_id ?? null },
  });

  return NextResponse.json({
    ok: true,
    user_id: created.user.id,
    role: body.role,
    email,
    token,  // only present for volunteers; show once
  });
}
