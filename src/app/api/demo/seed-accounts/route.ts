import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// POST /api/demo/seed-accounts
//
// Idempotently ensures the six demo accounts shown on the login page exist
// AND have the demo password set, so the "fill demo" buttons on /login can
// sign in directly via signInWithPassword without going through OTP.
//
// Superadmin-only. Safe to re-run; updates passwords + roles + scope on each call.
//
// The intern account and the per-minister account are the new additions —
// they previously didn't have passwords (interns sign in via OTP), so without
// this endpoint the demo buttons would 400.

type Spec = {
  email: string;
  role: "superadmin" | "firm_admin" | "firm_analyst" | "firm_intern" | "party_viewer";
  full_name: string;
  scope_mla_name?: string; // for minister-scoped party_viewer
};

const SPECS: Spec[] = [
  { email: "super.partha@samvidya.demo", role: "superadmin", full_name: "Partha (superadmin)" },
  { email: "firm.admin@signaldesk.demo", role: "firm_admin", full_name: "Firm Admin (demo)" },
  { email: "firm.analyst@signaldesk.demo", role: "firm_analyst", full_name: "Firm Analyst (demo)" },
  { email: "firm.intern@samvidya.demo", role: "firm_intern", full_name: "Intern — queue triage (demo)" },
  { email: "party.cm@signaldesk.demo", role: "party_viewer", full_name: "CMO — Chief Minister's office" },
  // The Health minister demo — scope_mla_name resolved to an mla_id at runtime.
  // If no minister with that portfolio exists we fall back to the first cabinet minister.
  { email: "minister.health@samvidya.demo", role: "party_viewer", full_name: "Minister — Health (demo)", scope_mla_name: "Health" },
];

export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (me?.role !== "superadmin") {
    return NextResponse.json({ ok: false, error: "superadmin only" }, { status: 403 });
  }

  const password = process.env.DEMO_USER_PASSWORD;
  if (!password) {
    return NextResponse.json({ ok: false, error: "DEMO_USER_PASSWORD env var not set" }, { status: 500 });
  }

  const admin = createAdminClient();

  // Resolve a Health minister id (or first cabinet minister) for the demo scope
  const { data: healthMin } = await admin
    .from("mlas")
    .select("id, name, portfolio")
    .eq("is_minister", true)
    .ilike("portfolio", "%health%")
    .limit(1)
    .maybeSingle();
  const { data: fallbackMin } = await admin
    .from("mlas")
    .select("id, name, portfolio")
    .eq("is_minister", true)
    .order("id")
    .limit(1)
    .maybeSingle();
  const scopedMla = healthMin ?? fallbackMin;

  const results: { email: string; status: string; note?: string }[] = [];

  for (const spec of SPECS) {
    try {
      // Look up existing auth user by listing (Supabase has no getUserByEmail v2 server helper)
      const { data: list } = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
      const existing = list.users.find((u) => u.email?.toLowerCase() === spec.email.toLowerCase());

      let userId: string;
      if (existing) {
        // Reset password + ensure email is confirmed
        await admin.auth.admin.updateUserById(existing.id, { password, email_confirm: true });
        userId = existing.id;
      } else {
        const { data: created, error } = await admin.auth.admin.createUser({
          email: spec.email,
          password,
          email_confirm: true,
          user_metadata: { full_name: spec.full_name, role: spec.role },
        });
        if (error || !created.user) throw new Error(error?.message ?? "create user failed");
        userId = created.user.id;
      }

      // Upsert profile in public.users with the right role + scope
      const scope_mla_id = spec.role === "party_viewer" && spec.scope_mla_name && scopedMla
        ? scopedMla.id
        : null;
      const { error: pErr } = await admin.from("users").upsert({
        id: userId,
        email: spec.email,
        full_name: spec.full_name,
        role: spec.role,
        scope_mla_id,
        active: true,
        joined_at: new Date().toISOString().slice(0, 10),
      });
      if (pErr) throw new Error(pErr.message);

      results.push({
        email: spec.email,
        status: existing ? "updated" : "created",
        note: scope_mla_id ? `scoped to ${scopedMla?.name}` : undefined,
      });
    } catch (e) {
      results.push({ email: spec.email, status: "error", note: (e as Error).message });
    }
  }

  await auditLog({
    user_id: user.id,
    action: "demo_seed_accounts",
    entity_type: "users",
    entity_id: "batch",
    metadata: { results },
  });

  return NextResponse.json({ ok: true, results });
}
