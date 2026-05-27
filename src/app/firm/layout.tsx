import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "@/components/sidebar";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { adminOnly?: boolean })[] = [
  { href: "/firm", label: "Inbox" },
  { href: "/firm/intake", label: "Intake" },
  { href: "/firm/voices", label: "Voices" },
  { href: "/firm/stories", label: "Stories" },
  { href: "/firm/sources", label: "Sources" },
  { href: "/firm/briefs", label: "Briefs" },
  { href: "/firm/agenda", label: "Agenda" },
  { href: "/firm/decisions", label: "Decisions" },
  { href: "/firm/threats", label: "Threats", adminOnly: true },
  { href: "/firm/audit", label: "Audit", adminOnly: true },
];

export default async function FirmLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (!profile || (profile.role !== "firm_admin" && profile.role !== "firm_analyst")) {
    redirect("/party");
  }

  const nav = NAV.filter((n) => !n.adminOnly || profile.role === "firm_admin");

  return (
    <div className="flex min-h-screen bg-sand">
      <Sidebar scope="firm" nav={nav} userName={profile.full_name ?? profile.email} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
