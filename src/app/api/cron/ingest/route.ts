import { NextResponse } from "next/server";
import { runIngestAll } from "@/lib/ingest";

// Vercel cron entry point. Vercel sends `Authorization: Bearer ${CRON_SECRET}`.
// Also callable by external schedulers (cron-job.org) using the same header.

export const dynamic = "force-dynamic";
export const maxDuration = 60; // seconds; this fits a fetch + classify cycle

export async function GET(req: Request) {
  const auth = req.headers.get("authorization");
  const expected = `Bearer ${process.env.CRON_SECRET ?? ""}`;
  if (!process.env.CRON_SECRET || auth !== expected) {
    return NextResponse.json({ ok: false, error: "unauthorized" }, { status: 401 });
  }

  const started = Date.now();
  try {
    const summaries = await runIngestAll();
    return NextResponse.json({
      ok: true,
      ms: Date.now() - started,
      summaries,
    });
  } catch (e) {
    return NextResponse.json(
      { ok: false, error: (e as Error).message, ms: Date.now() - started },
      { status: 500 }
    );
  }
}
