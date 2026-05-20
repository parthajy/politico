import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { Sidebar, type NavItem } from "@/components/sidebar";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/party", label: "Dashboard" },
  { href: "/party/constituencies", label: "Constituencies" },
  { href: "/party/cabinet", label: "Cabinet" },
  { href: "/party/threats", label: "Threats" },
  { href: "/party/decisions", label: "Decisions" },
  { href: "/party/brief", label: "Brief" },
  { href: "/party/alerts", label: "Alerts" },
];

export default async function PartyLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || profile.role !== "party_viewer") redirect("/firm");

  // Audit every party page view. Fire-and-forget so it never adds latency.
  const path = headers().get("x-pathname") ?? "/party";
  auditLog({
    user_id: user.id,
    action: "party_view",
    entity_type: "page",
    entity_id: path,
  }).catch(() => { /* swallow — audit must not break the page */ });

  return (
    <div className="flex min-h-screen bg-sand">
      <Sidebar scope="party" nav={NAV} userName={profile.full_name ?? profile.email} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
