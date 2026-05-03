import { NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { askDesk } from "@/lib/ai/ask-desk";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const Body = z.object({
  question: z.string().min(3).max(400),
  lookback_days: z.number().int().min(1).max(60).optional(),
});

export async function POST(req: Request) {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return NextResponse.json({ ok: false, error: "unauthenticated" }, { status: 401 });

  let body: z.infer<typeof Body>;
  try { body = Body.parse(await req.json()); } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 400 });
  }

  const t0 = Date.now();
  let result;
  try {
    result = await askDesk(body.question, body.lookback_days ?? 14);
  } catch (e) {
    return NextResponse.json({ ok: false, error: (e as Error).message }, { status: 500 });
  }

  await auditLog({
    user_id: user.id,
    action: "ask_desk",
    entity_type: "query",
    metadata: { question: body.question, ms: Date.now() - t0, citation_count: result.citations.length, confidence: result.confidence },
  });

  return NextResponse.json({ ok: true, ...result, ms: Date.now() - t0 });
}
