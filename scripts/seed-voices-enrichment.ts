// Backfill the existing 70 voices with realistic CRM data:
// social handles, coverage topics, reach estimates, response_rate,
// last_outreach_at, placement_count.
// Run once: npx tsx scripts/seed-voices-enrichment.ts

import * as dotenv from "dotenv";
dotenv.config({ path: ".env.local" });
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const TOPICS_BY_ROLE: Record<string, string[]> = {
  "schoolteacher": ["education", "youth employment", "school infrastructure"],
  "ASHA worker": ["primary healthcare", "women & child welfare", "tribal welfare"],
  "village headman": ["tribal welfare", "land rights", "rural development"],
  "kiwi farmer": ["agriculture & horticulture", "rural connectivity"],
  "homestay owner": ["sustainable tourism", "rural connectivity"],
  "primary doctor": ["primary healthcare", "telemedicine"],
  "ITBP veteran": ["border infrastructure", "China LAC tensions", "Army-civilian coordination"],
  "GPDP secretary": ["panchayati raj", "rural development"],
  "panchayat member": ["panchayati raj", "land rights"],
  "anganwadi worker": ["women & child welfare", "primary healthcare"],
  "Buddhist monastery elder": ["language preservation", "tribal identity", "cultural heritage"],
  "small-cardamom farmer": ["agriculture & horticulture"],
  "tour guide": ["sustainable tourism"],
  "shopkeeper": ["rural connectivity", "electricity"],
  "cooperative society chair": ["agriculture & horticulture", "rural development"],
  "Naga church pastor": ["tribal identity", "Tirap-Changlang-Longding affairs"],
  "horticulture officer": ["agriculture & horticulture"],
  "BSF community-liaison": ["border infrastructure", "Army-civilian coordination"],
  "language preservation activist": ["language preservation", "tribal identity"],
};

function slugify(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "");
}
function pick<T>(arr: T[], n: number): T[] {
  const c = [...arr];
  const out: T[] = [];
  while (n > 0 && c.length > 0) {
    const i = Math.floor(Math.random() * c.length);
    out.push(c.splice(i, 1)[0]);
    n--;
  }
  return out;
}

async function main() {
  const { data: voices } = await sb.from("voices").select("id, name, role, joined_at");
  if (!voices) throw new Error("no voices");
  console.log(`enriching ${voices.length} voices…`);

  for (const v of voices) {
    const slug = slugify(v.name);
    const handles: Record<string, string> = {};
    // 70% have twitter, 50% facebook, 20% instagram (rural-AP realistic)
    if (Math.random() < 0.7) handles.twitter = `@${slug}_ap`;
    if (Math.random() < 0.5) handles.facebook = `${slug}.arunachal`;
    if (Math.random() < 0.2) handles.instagram = `@${slug}`;

    const topicPool = TOPICS_BY_ROLE[v.role ?? ""] ?? ["rural development", "tribal welfare"];
    const topics = pick(topicPool, Math.min(3, topicPool.length));

    // Reach: scaled by role (officials/teachers have more, farmers less)
    const reachBase: Record<string, number> = {
      "ITBP veteran": 8000, "village headman": 4500, "BSF community-liaison": 7000,
      "Buddhist monastery elder": 12000, "Naga church pastor": 6000,
      "schoolteacher": 2500, "ASHA worker": 1500, "panchayat member": 3200,
      "GPDP secretary": 2000, "homestay owner": 3500, "tour guide": 4000,
      "cooperative society chair": 5000, "horticulture officer": 4000,
      "primary doctor": 5500, "language preservation activist": 9000,
    };
    const baseReach = reachBase[v.role ?? ""] ?? 1500;
    const reach = Math.round(baseReach * (0.5 + Math.random() * 1.2));

    // Response rate: 60-95% for active voices
    const responseRate = +(0.55 + Math.random() * 0.4).toFixed(2);

    // Placements: 0-12 stories
    const placement = Math.floor(Math.random() * 13);

    // Last outreach: within the last 60 days
    const daysAgo = Math.floor(Math.random() * 60);
    const lastOutreach = new Date(Date.now() - daysAgo * 86400_000).toISOString();

    await sb.from("voices").update({
      social_handles: handles,
      coverage_topics: topics,
      reach_estimate: reach,
      response_rate: responseRate,
      placement_count: placement,
      last_outreach_at: lastOutreach,
    }).eq("id", v.id);
  }
  console.log("done");
}

main().catch((e) => { console.error(e); process.exit(1); });
