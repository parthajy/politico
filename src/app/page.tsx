import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

// Root URL is not a landing page — Samvidya is a tool, not a marketing site.
// Signed-out → /login. Signed-in → /firm, where middleware bounces by role.
export const dynamic = "force-dynamic";

export default async function RootPage() {
  const sb = createClient();
  const { data: { user } } = await sb.auth.getUser();
  redirect(user ? "/firm" : "/login");
}
