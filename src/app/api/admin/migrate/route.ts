import { NextResponse } from "next/server";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// One-time-use migration endpoint. Reads /supabase/migrations/*.sql and
// applies them via direct Postgres. Gated by CRON_SECRET so only the
// admin curl with the header gets through. Idempotent: each statement
// uses CREATE IF NOT EXISTS / DROP IF EXISTS so re-running is safe.

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  if (!process.env.CRON_SECRET || auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }
  if (!process.env.SUPABASE_DB_URL) {
    return NextResponse.json({ ok: false, error: "SUPABASE_DB_URL not set in env" }, { status: 500 });
  }

  // Allow filtering to a single migration via ?file=0008_field_network.sql
  const url = new URL(req.url);
  const onlyFile = url.searchParams.get("file");

  const dir = join(process.cwd(), "supabase", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();
  const targets = onlyFile ? files.filter((f) => f === onlyFile) : files;
  if (targets.length === 0) {
    return NextResponse.json({ ok: false, error: "no migrations matched" }, { status: 400 });
  }

  const client = new Client({ connectionString: process.env.SUPABASE_DB_URL, ssl: { rejectUnauthorized: false } });
  await client.connect();

  const results: { file: string; status: "applied" | "skipped"; note?: string }[] = [];
  try {
    for (const f of targets) {
      const sql = readFileSync(join(dir, f), "utf8");
      try {
        await client.query(sql);
        results.push({ file: f, status: "applied" });
      } catch (e) {
        const msg = (e as Error).message;
        if (/already exists|duplicate object|exists, skipping|cannot drop|enum label .* already exists/i.test(msg)) {
          results.push({ file: f, status: "skipped", note: msg.split("\n")[0].slice(0, 150) });
        } else {
          await client.end();
          return NextResponse.json({ ok: false, error: `failed at ${f}: ${msg}` }, { status: 500 });
        }
      }
    }
  } finally {
    await client.end();
  }

  return NextResponse.json({ ok: true, results });
}
