import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const PostBody = z.object({
  kind: z.enum(["minister", "constituency", "district", "topic", "narrative"]),
  ref_id: z.string().min(1).max(200),
  label: z.string().min(1).max(200),
  notify_threshold: z.number().min(0).max(1).optional(),
});

// GET /api/watch — list the signed-in user's watch items
export async function GET() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const { data, error } = await sb
    .from("watch_items")
    .select("*")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true, items: data ?? [] });
}

// POST /api/watch — add an item to the watchlist (idempotent on user+kind+ref_id)
export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  let body: z.infer<typeof PostBody>;
  try { body = PostBody.parse(await req.json()); }
  catch (e) { return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 }); }
  const { error } = await sb.from("watch_items").upsert({
    user_id: user.id,
    kind: body.kind,
    ref_id: body.ref_id,
    label: body.label,
    notify_threshold: body.notify_threshold ?? 0.6,
  }, { onConflict: "user_id,kind,ref_id" });
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}

// DELETE /api/watch?kind=...&ref_id=...
export async function DELETE(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });
  const url = new URL(req.url);
  const kind = url.searchParams.get("kind");
  const ref_id = url.searchParams.get("ref_id");
  if (!kind || !ref_id) return NextResponse.json({ ok: false, error: "kind + ref_id required" }, { status: 400 });
  const admin = createAdminClient();
  const { error } = await admin
    .from("watch_items")
    .delete()
    .eq("user_id", user.id)
    .eq("kind", kind)
    .eq("ref_id", ref_id);
  if (error) return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
