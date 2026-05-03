import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const password = process.env.DEMO_USER_PASSWORD ?? "SignalDesk2026!";

const ACCOUNTS = [
  { email: "firm.admin@signaldesk.demo", expectedRole: "firm_admin" },
  { email: "firm.analyst@signaldesk.demo", expectedRole: "firm_analyst" },
  { email: "party.cm@signaldesk.demo", expectedRole: "party_viewer" },
];

async function main() {
  let pass = 0, fail = 0;
  for (const a of ACCOUNTS) {
    const supabase = createClient(url, anon);
    const { data: signIn, error: signErr } = await supabase.auth.signInWithPassword({
      email: a.email,
      password,
    });
    if (signErr || !signIn.user) {
      console.error(`✗ ${a.email}: sign-in failed — ${signErr?.message}`);
      fail++; continue;
    }
    const { data: profile, error: pErr } = await supabase
      .from("users")
      .select("role, email")
      .eq("id", signIn.user.id)
      .single();
    if (pErr || !profile) {
      console.error(`✗ ${a.email}: profile fetch failed — ${pErr?.message}`);
      fail++; continue;
    }
    if (profile.role !== a.expectedRole) {
      console.error(`✗ ${a.email}: role mismatch — got ${profile.role}, expected ${a.expectedRole}`);
      fail++; continue;
    }
    console.log(`✓ ${a.email} → ${profile.role}`);
    pass++;
    await supabase.auth.signOut();
  }

  // Also verify reference data
  const sb = createClient(url, anon);
  await sb.auth.signInWithPassword({ email: ACCOUNTS[0].email, password });
  const [d, c, m, v] = await Promise.all([
    sb.from("districts").select("id", { count: "exact", head: true }),
    sb.from("constituencies").select("id", { count: "exact", head: true }),
    sb.from("mlas").select("id", { count: "exact", head: true }),
    sb.from("voices").select("id", { count: "exact", head: true }),
  ]);
  console.log(`\nreference rows: districts=${d.count}, constituencies=${c.count}, mlas=${m.count}, voices=${v.count}`);

  console.log(`\n${pass}/${ACCOUNTS.length} accounts verified`);
  if (fail > 0) process.exit(1);
}

main().catch((e) => { console.error(e); process.exit(1); });
