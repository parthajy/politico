// Signal Desk — seed runner
// Idempotent: safe to re-run. Uses service role key (bypasses RLS).
// Run with: npx tsx scripts/seed.ts

import { createClient } from "@supabase/supabase-js";
import * as dotenv from "dotenv";
import { DISTRICTS, CONSTITUENCIES, CABINET, ISSUES } from "../src/lib/seed/ap-data";

dotenv.config({ path: ".env.local" });

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const demoPassword = process.env.DEMO_USER_PASSWORD ?? "SignalDesk2026!";

if (!url || !serviceKey) {
  console.error("Missing SUPABASE env vars in .env.local");
  process.exit(1);
}

const supabase = createClient(url, serviceKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

async function seedDistricts(): Promise<Map<string, number>> {
  console.log("→ districts");
  const idByName = new Map<string, number>();
  for (const d of DISTRICTS) {
    const { data, error } = await supabase
      .from("districts")
      .upsert(
        { name: d.name, hq: d.hq, population_est: d.population_est, tier: d.tier, dominant_communities: d.dominant_communities },
        { onConflict: "name" }
      )
      .select("id, name")
      .single();
    if (error) throw new Error(`district ${d.name}: ${error.message}`);
    idByName.set(data.name, data.id);
  }
  console.log(`  ✓ ${idByName.size} districts`);
  return idByName;
}

async function seedConstituencies(districtIds: Map<string, number>): Promise<Map<string, number>> {
  console.log("→ constituencies");
  const idByName = new Map<string, number>();
  for (const c of CONSTITUENCIES) {
    const districtId = districtIds.get(c.district);
    if (!districtId) throw new Error(`unknown district ${c.district} for constituency ${c.name}`);
    const { data, error } = await supabase
      .from("constituencies")
      .upsert(
        {
          number: c.number,
          name: c.name,
          district_id: districtId,
          last_election_margin_pct: c.last_election_margin_pct,
        },
        { onConflict: "number" }
      )
      .select("id, name")
      .single();
    if (error) throw new Error(`constituency ${c.name}: ${error.message}`);
    idByName.set(c.name, data.id);
  }
  console.log(`  ✓ ${idByName.size} constituencies`);
  return idByName;
}

async function seedMLAs(constituencyIds: Map<string, number>) {
  console.log("→ MLAs");
  const cabinetByConst = new Map<string, (typeof CABINET)[number]>();
  for (const m of CABINET) if (m.constituency) cabinetByConst.set(m.constituency, m);

  // Wipe existing MLA rows so a re-seed reflects current state cleanly.
  // (Ref tables are small; this avoids stale rows from prior runs.)
  await supabase.from("constituencies").update({ current_mla_id: null }).gte("id", 0);
  await supabase.from("mlas").delete().gte("id", 0);

  let inserted = 0;
  for (const c of CONSTITUENCIES) {
    const constId = constituencyIds.get(c.name)!;
    const cab = cabinetByConst.get(c.name);
    const { data, error } = await supabase
      .from("mlas")
      .insert({
        name: c.mla_name,
        party: c.party,
        constituency_id: constId,
        is_minister: !!cab,
        portfolio: cab?.portfolio ?? null,
        is_cm: cab?.is_cm ?? false,
        is_deputy_cm: cab?.is_deputy_cm ?? false,
      })
      .select("id")
      .single();
    if (error) throw new Error(`mla ${c.mla_name}: ${error.message}`);
    inserted++;
    await supabase.from("constituencies").update({ current_mla_id: data.id }).eq("id", constId);
  }

  // Cabinet members whose constituency couldn't be verified — insert without an FK.
  for (const m of CABINET) {
    if (m.constituency) continue;
    const { error } = await supabase.from("mlas").insert({
      name: m.name,
      party: "BJP",
      constituency_id: null,
      is_minister: true,
      portfolio: m.portfolio,
      is_cm: m.is_cm,
      is_deputy_cm: m.is_deputy_cm,
    });
    if (error) throw new Error(`unverified-constituency cabinet ${m.name}: ${error.message}`);
    inserted++;
    console.warn(`  ! seeded cabinet member ${m.name} with NULL constituency (unverified)`);
  }
  console.log(`  ✓ ${inserted} MLAs`);
}

const FIRST_NAMES = [
  "Tana", "Hage", "Nabam", "Bamang", "Lod", "Yumlam", "Tashi", "Nima", "Sange", "Karma",
  "Pema", "Dorje", "Tsering", "Gyamar", "Goje", "Nyodu", "Tarh", "Likha", "Tana", "Joram",
  "Kipa", "Tana", "Nani", "Mibom", "Oyam", "Onying", "Boni", "Tasso", "Yater", "Mibom",
];
const LAST_NAMES = [
  "Tara", "Riba", "Pertin", "Apang", "Lego", "Tana", "Doke", "Padu", "Nyodu", "Tana",
  "Karbak", "Khrime", "Litin", "Zirdo", "Saroh", "Modi", "Apang", "Padung", "Loyi", "Hina",
  "Mize", "Bagang", "Yangfo", "Komut", "Mannen", "Tato", "Bui", "Tatung", "Wangsu", "Mossang",
];
const ROLES = [
  "schoolteacher", "ASHA worker", "village headman", "kiwi farmer", "homestay owner",
  "primary doctor", "ITBP veteran", "GPDP secretary", "panchayat member", "anganwadi worker",
  "Buddhist monastery elder", "small-cardamom farmer", "tour guide", "shopkeeper", "cooperative society chair",
  "Naga church pastor", "horticulture officer", "BSF community-liaison", "language preservation activist",
];

function rand<T>(arr: T[]): T { return arr[Math.floor(Math.random() * arr.length)]; }
function dateBefore(today: Date, daysBack: number) {
  const d = new Date(today); d.setDate(d.getDate() - Math.floor(Math.random() * daysBack)); return d.toISOString().slice(0, 10);
}

async function seedVoices(districtIds: Map<string, number>) {
  console.log("→ voices");
  // Wipe and reseed for idempotence.
  await supabase.from("voices").delete().gte("joined_at", "1900-01-01");

  const tier1 = DISTRICTS.filter((d) => d.tier === 1);
  const tier2 = DISTRICTS.filter((d) => d.tier === 2);
  const tier3 = DISTRICTS.filter((d) => d.tier === 3);
  const today = new Date();

  // 70 voices: weighted by tier (T1: 4 each, T2: 3 each, T3: 2 each → ~75)
  const dist: typeof DISTRICTS = [];
  for (const d of tier1) for (let i = 0; i < 4; i++) dist.push(d);
  for (const d of tier2) for (let i = 0; i < 3; i++) dist.push(d);
  for (const d of tier3) for (let i = 0; i < 2; i++) dist.push(d);
  while (dist.length > 70) dist.pop();

  const rows = dist.map((d) => ({
    name: `${rand(FIRST_NAMES)} ${rand(LAST_NAMES)}`,
    role: rand(ROLES),
    district_id: districtIds.get(d.name)!,
    constituency_id: null,
    active: Math.random() > 0.1,
    joined_at: dateBefore(today, 540),
    last_engagement_at: dateBefore(today, 30),
    notes: null,
    ever_paid: false,
    ever_scripted: false,
  }));

  const { error } = await supabase.from("voices").insert(rows);
  if (error) throw new Error(`voices: ${error.message}`);
  console.log(`  ✓ ${rows.length} voices`);
}

const DEMO_USERS = [
  { email: "super.partha@samvidya.demo", full_name: "Partha (Superadmin)", role: "superadmin" as const },
  { email: "firm.admin@signaldesk.demo", full_name: "Firm Admin", role: "firm_admin" as const },
  { email: "firm.analyst@signaldesk.demo", full_name: "Firm Analyst", role: "firm_analyst" as const },
  { email: "party.cm@signaldesk.demo", full_name: "CM Office", role: "party_viewer" as const },
];

async function seedUsers() {
  console.log("→ demo users");
  for (const u of DEMO_USERS) {
    // Check existing
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existing = list?.users.find((x) => x.email === u.email);

    if (existing) {
      // Ensure password + role + email_confirmed are set.
      await supabase.auth.admin.updateUserById(existing.id, {
        password: demoPassword,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role },
      });
      await supabase.from("users").upsert({ id: existing.id, email: u.email, full_name: u.full_name, role: u.role });
      console.log(`  ↻ ${u.email} (${u.role}) — refreshed`);
    } else {
      const { data, error } = await supabase.auth.admin.createUser({
        email: u.email,
        password: demoPassword,
        email_confirm: true,
        user_metadata: { full_name: u.full_name, role: u.role },
      });
      if (error) throw new Error(`create ${u.email}: ${error.message}`);
      // Trigger should have inserted the row; force role/name in case metadata wasn't picked up.
      await supabase.from("users").upsert({ id: data.user.id, email: u.email, full_name: u.full_name, role: u.role });
      console.log(`  + ${u.email} (${u.role}) — created`);
    }
  }
}

async function main() {
  console.log("Signal Desk seed — starting");
  const districtIds = await seedDistricts();
  const constituencyIds = await seedConstituencies(districtIds);
  await seedMLAs(constituencyIds);
  await seedVoices(districtIds);
  await seedUsers();
  console.log(`\nDone. ${ISSUES.length} canonical issues defined in src/lib/seed/ap-data.ts.`);
  console.log(`Demo password: ${demoPassword}`);
}

main().catch((e) => {
  console.error("\n✗ seed failed:", e.message);
  process.exit(1);
});
