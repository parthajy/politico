import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { buildAgendaContext, streamAgenda } from "@/lib/ai/cabinet-agenda";
import { MODEL_BRIEF } from "@/lib/ai/openai";

export const dynamic = "force-dynamic";
export const maxDuration = 90;

// Streams the cabinet agenda Markdown. Persists nothing — agendas are ephemeral
// (regenerate weekly). The firm copies into their planning doc.

export async function POST() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return new Response("unauthenticated", { status: 401 });
  const { data: profile } = await sb.from("users").select("role").eq("id", user.id).single();
  if (profile?.role !== "firm_admin" && profile?.role !== "firm_analyst") {
    return new Response("forbidden", { status: 403 });
  }

  const ctx = await buildAgendaContext();
  const encoder = new TextEncoder();
  let chars = 0;

  const stream = new ReadableStream({
    async start(controller) {
      try {
        for await (const chunk of streamAgenda(ctx)) {
          chars += chunk.length;
          controller.enqueue(encoder.encode(chunk));
        }
        await auditLog({
          user_id: user.id,
          action: "agenda_generate",
          entity_type: "agenda",
          metadata: { model: MODEL_BRIEF, length: chars, signals_used: ctx.top_signals.length },
        });
      } catch (e) {
        controller.enqueue(encoder.encode(`\n\n[[AGENDA_ERROR:${(e as Error).message}]]`));
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-cache, no-transform", "X-Accel-Buffering": "no" },
  });
}
