import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { FeedbackButton } from "@/components/feedback-button";

export const dynamic = "force-dynamic";

const NAV: (NavItem & { adminOnly?: boolean; internToo?: boolean })[] = [
  // Main workspace
  { href: "/firm",            label: "Inbox",         icon: "inbox" },
  { href: "/firm/queue",      label: "Triage queue",  icon: "queue", internToo: true },
  { href: "/firm/narratives", label: "Narratives",    icon: "narratives", section: "Intelligence" },
  { href: "/firm/voices",     label: "Voices",        icon: "voices",     section: "Intelligence" },
  { href: "/firm/sources",    label: "Sources",       icon: "sources",    section: "Intelligence" },
  { href: "/firm/threats",    label: "Threats",       icon: "threats",    section: "Intelligence", adminOnly: true },
  { href: "/firm/stories",    label: "Stories",       icon: "stories",    section: "Output" },
  { href: "/firm/briefs",     label: "Briefs",        icon: "briefs",     section: "Output" },
  { href: "/firm/agenda",     label: "Agenda",        icon: "agenda",     section: "Output" },
  { href: "/firm/decisions",  label: "Decisions",     icon: "decisions",  section: "Output" },
  { href: "/firm/watch",      label: "My watchlist",  icon: "watchlist",  section: "Personal" },
  { href: "/firm/audit",      label: "Audit",         icon: "audit",      section: "Personal", adminOnly: true },
  // /firm/brain reachable via the brain-icon shortcut at the top of the sidebar
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
