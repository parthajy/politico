import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type AppRole =
  | "superadmin"
  | "firm_admin"
  | "firm_analyst"
  | "firm_intern"
  | "party_viewer"
  | "volunteer";

export type Scope =
  | { type: "cmo" }
  | {
      type: "minister";
      mla_id: number;
      mla_name: string;
      is_cm: boolean;
      is_deputy_cm: boolean;
      portfolio: string | null;
      constituency_id: number | null;
      constituency_name: string | null;
      district_id: number | null;
      district_name: string | null;
    };

export type SessionContext = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: AppRole;
  scope: Scope | null; // populated for party_viewer only
};

/**
 * Resolve the current user + their scope. Redirects to /login when there is no
 * session. Returns the scope for party_viewer (CMO if scope_mla_id is null,
 * minister otherwise). For everyone else, scope is null.
 *
 * Use this at the top of any party/* route. Pages can branch on
 * `ctx.scope?.type === "minister"` to render the scoped view.
 */
export async function requireSession(): Promise<SessionContext> {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await sb
    .from("users")
    .select("role, full_name, email, scope_mla_id")
    .eq("id", user.id)
    .single();

  if (!profile) redirect("/login");

  const role = profile.role as AppRole;
  let scope: Scope | null = null;

  if (role === "party_viewer") {
    if (profile.scope_mla_id == null) {
      scope = { type: "cmo" };
    } else {
      const { data: mla } = await sb
        .from("mlas")
        .select("id, name, is_cm, is_deputy_cm, portfolio, constituency_id, constituencies!mlas_constituency_id_fkey(id, name, district_id, districts(id, name))")
        .eq("id", profile.scope_mla_id)
        .maybeSingle();
      const constJoin = (mla?.constituencies as unknown) as {
        id: number; name: string; district_id: number | null;
        districts: { id: number; name: string } | null;
      } | null;
      scope = {
        type: "minister",
        mla_id: mla?.id ?? profile.scope_mla_id,
        mla_name: mla?.name ?? "Minister",
        is_cm: !!mla?.is_cm,
        is_deputy_cm: !!mla?.is_deputy_cm,
        portfolio: mla?.portfolio ?? null,
        constituency_id: constJoin?.id ?? null,
        constituency_name: constJoin?.name ?? null,
        district_id: constJoin?.districts?.id ?? null,
        district_name: constJoin?.districts?.name ?? null,
      };
    }
  }

  return {
    user_id: user.id,
    email: profile.email,
    full_name: profile.full_name,
    role,
    scope,
  };
}

/** Helper: is this a minister-scoped party_viewer? */
export function isMinisterScope(ctx: SessionContext): ctx is SessionContext & { scope: Extract<Scope, { type: "minister" }> } {
  return ctx.role === "party_viewer" && ctx.scope?.type === "minister";
}

/** Helper: is this the CMO (unscoped party_viewer)? */
export function isCmoScope(ctx: SessionContext): boolean {
  return ctx.role === "party_viewer" && ctx.scope?.type === "cmo";
}
