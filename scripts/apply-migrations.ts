// Apply Supabase migrations via direct Postgres connection.
// Requires SUPABASE_DB_URL in .env.local (the pooler connection string from
// Supabase dashboard → Project Settings → Database → Connection string → "Transaction" pooler).
//
// Run with: npx tsx scripts/apply-migrations.ts
//
// If you don't want to set SUPABASE_DB_URL, you can instead paste each file in
// /supabase/migrations/ into the Supabase SQL Editor in dashboard.

import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";
import * as dotenv from "dotenv";

dotenv.config({ path: ".env.local" });

const dbUrl = process.env.SUPABASE_DB_URL;
if (!dbUrl) {
  console.error("Missing SUPABASE_DB_URL in .env.local");
  console.error("");
  console.error("Get it from: Supabase dashboard → Project Settings → Database");
  console.error("→ Connection string → 'Transaction pooler' (port 6543)");
  console.error("Substitute [YOUR-PASSWORD] with the database password.");
  console.error("");
  console.error("Alternative: paste each migration in /supabase/migrations/ into");
  console.error("the SQL Editor at https://supabase.com/dashboard/project/" + (process.env.SUPABASE_PROJECT_ID ?? "<ref>") + "/sql/new");
  process.exit(1);
}

async function main() {
  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const client = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  console.log(`Connected. Applying ${files.length} migration(s).`);

  for (const f of files) {
    const sql = readFileSync(join(dir, f), "utf8");
    console.log(`→ ${f}`);
    try {
      await client.query(sql);
      console.log(`  ✓ applied`);
    } catch (e) {
      const msg = (e as Error).message;
      // Idempotent re-run: tolerate "already exists" errors so we can rerun safely.
      if (/already exists|duplicate object|exists, skipping/i.test(msg)) {
        console.log(`  ↻ already applied (${msg.split("\n")[0]})`);
      } else {
        await client.end();
        throw e;
      }
    }
  }

  await client.end();
  console.log("\nDone.");
}

main().catch((e) => {
  console.error("\n✗ migration failed:", e.message);
  process.exit(1);
});
