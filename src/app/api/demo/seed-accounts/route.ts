import { NextResponse } from "next/server";
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
// PUBLIC endpoint — no auth required. The only thing it can do is create or
// reset the password on six hardcoded demo emails (super.partha, firm.admin,
// firm.analyst, firm.intern, party.cm, minister.health all at
// @samvidya.demo / @signaldesk.demo). The password it sets is
// DEMO_USER_PASSWORD which is already exposed publicly via
// NEXT_PUBLIC_DEMO_PASSWORD — so there's nothing to abuse.
//
// The login page calls this automatically before the first password sign-in
// attempt on a demo button, so demos always Just Work even on a fresh DB.

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

// Resolve the demo password through the same fallback chain the /login page
// uses on the client. Server-only DEMO_USER_PASSWORD wins if present; we
// fall back to NEXT_PUBLIC_DEMO_PASSWORD (which is also readable server-side
// in Next.js) and finally to the hardcoded value baked into .env.local. This
// guarantees the seed endpoint sets exactly the same password that
// /login's button will try to sign in with, regardless of which env vars
// happen to be configured in Vercel.
const DEMO_PASSWORD =
  process.env.DEMO_USER_PASSWORD ||
  process.env.NEXT_PUBLIC_DEMO_PASSWORD ||
  "SignalDesk2026!";

export async function POST() {
  // Intentionally NOT auth-gated. See header comment — this endpoint can only
  // touch six hardcoded demo emails with a publicly-known demo password, so
  // there is nothing to abuse and gating it would mean demo buttons never
  // work on a fresh deploy.
  const password = DEMO_PASSWORD;

  const admin = createAdminClient();

  // Pre-flight: does the scope_mla_id column exist? If not, the minister
  // demo account can't be seeded. Run migration 0012 first.
  const { error: probe } = await admin.from("users").select("scope_mla_id").limit(1);
  if (probe && /scope_mla_id/i.test(probe.message)) {
    return NextResponse.json({
      ok: false,
      error: "users.scope_mla_id column missing. Run supabase/migrations/0012_minister_scope.sql in the SQL editor first.",
    }, { status: 412 });
  }

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
    user_id: null,
    action: "demo_seed_accounts",
    entity_type: "users",
    entity_id: "batch",
    metadata: { results },
  });

  return NextResponse.json({ ok: true, results });
}
