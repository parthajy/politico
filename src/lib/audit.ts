import { createAdminClient } from "@/lib/supabase/admin";

// Centralised audit-log writer. Use service role so RLS doesn't block inserts.
export async function auditLog(args: {
  user_id: string | null;
  action: string;
  entity_type?: string;
  entity_id?: string;
  metadata?: Record<string, unknown>;
}) {
  const sb = createAdminClient();
  await sb.from("audit_log").insert({
    user_id: args.user_id,
    action: args.action,
    entity_type: args.entity_type ?? null,
    entity_id: args.entity_id ?? null,
    metadata: args.metadata ?? null,
  });
}
