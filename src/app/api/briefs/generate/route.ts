import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { auditLog } from "@/lib/audit";
import { buildBriefContext, streamBrief } from "@/lib/ai/brief";
import { MODEL_BRIEF } from "@/lib/ai/openai";
import { format } from "date-fns";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Streams the gpt-4o output as raw text. The client appends each chunk to the
// editor in real time. After the stream finishes, the server upserts a draft
// brief row and emits a final line `\n\n[[BRIEF_ID:<uuid>]]` so the client
// knows what record to PATCH on save / publish.

export async function POST() {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return new Response("unauthenticated", { status: 401 });

  const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return new Response("forbidden", { status: 403 });
  }

  const today = new Date();
  const dateKey = format(today, "yyyy-MM-dd");

  const ctx = await buildBriefContext(today);

  const encoder = new TextEncoder();
  let accumulated = "";

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamBrief(ctx)) {
          accumulated += chunk;
          controller.enqueue(encoder.encode(chunk));
        }

        // Persist as draft brief
        const sb = createAdminClient();
        const { data: row, error } = await sb
          .from("briefs")
          .upsert(
            { brief_date: dateKey, body_md: accumulated, generated_by_model: MODEL_BRIEF, generated_at: new Date().toISOString() },
            { onConflict: "brief_date" },
          )
          .select("id")
          .single();
        if (error) {
          controller.enqueue(encoder.encode(`\n\n[[BRIEF_ERROR:${error.message}]]`));
        } else {
          await auditLog({
            user_id: user.id,
            action: "brief_generate",
            entity_type: "briefs",
            entity_id: row.id,
            metadata: { model: MODEL_BRIEF, length: accumulated.length, date: dateKey },
          });
          controller.enqueue(encoder.encode(`\n\n[[BRIEF_ID:${row.id}]]`));
        }
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[[BRIEF_ERROR:${(e as Error).message}]]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/plain; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
