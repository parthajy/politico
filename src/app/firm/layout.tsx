import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { FeedbackButton } from "@/components/feedback-button";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { adminOnly?: boolean; internToo?: boolean })[] = [
  { href: "/firm", label: "Inbox" },
  { href: "/firm/queue", label: "Triage queue", internToo: true },
  { href: "/firm/voices", label: "Voices" },
  { href: "/firm/stories", label: "Stories" },
  { href: "/firm/sources", label: "Sources" },
  { href: "/firm/briefs", label: "Briefs" },
  { href: "/firm/agenda", label: "Agenda" },
  { href: "/firm/narratives", label: "Narratives" },
  { href: "/firm/watch", label: "My watchlist" },
  { href: "/firm/decisions", label: "Decisions" },
  { href: "/firm/threats", label: "Threats", adminOnly: true },
  { href: "/firm/brain", label: "Brain map" },
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

  const role = profile?.role;
  // Allow firm_admin, firm_analyst, firm_intern (interns see a limited nav)
  if (!profile || (role !== "firm_admin" && role !== "firm_analyst" && role !== "firm_intern")) {
    redirect("/party");
  }

  let nav = NAV.filter((n) => !n.adminOnly || role === "firm_admin");
  if (role === "firm_intern") {
    // Interns see only the triage queue + glossary
    nav = nav.filter((n) => n.internToo);
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar scope="firm" nav={nav} userName={profile.full_name ?? profile.email} />
      <main className="min-w-0 flex-1">{children}</main>
      <FeedbackButton />
    </div>
  );
}
