import { createClient } from "@/lib/supabase/server";

/**
 * Returns true if the request is from an authorized cron caller
 * (Authorization: Bearer <CRON_SECRET>). Lets the same endpoint serve both
 * the in-app UI calls (user session) and external scheduler hits.
 */
export function isCronCaller(req: Request): boolean {
  const auth = req.headers.get("authorization");
  return !!process.env.CRON_SECRET && auth === `Bearer ${process.env.CRON_SECRET}`;
}

/**
 * Drop-in auth for batch endpoints that should be callable EITHER by
 * a firm-side user session OR by an external cron scheduler with the
 * CRON_SECRET bearer token.
 *
 * On success: returns { ok: true, user_id, via }.
 * On failure: returns a NextResponse-shaped { ok: false, status, error }
 * the caller should pass straight back to the client.
 */
export async function requireFirmOrCron(
  req: Request,
  allowedRoles: readonly string[] = ["firm_admin", "firm_analyst", "superadmin"],
): Promise<
  | { ok: true; user_id: string | null; via: "cron" | "user" }
  | { ok: false; status: number; error: string }
> {
  if (isCronCaller(req)) {
    return { ok: true, user_id: null, via: "cron" };
  }
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) return { ok: false, status: 401, error: "unauthenticated" };
  const { data: me } = await sb.from("users").select("role").eq("id", user.id).single();
  if (!me || !allowedRoles.includes(me.role)) {
    return { ok: false, status: 403, error: "forbidden" };
  }
  return { ok: true, user_id: user.id, via: "user" };
}
