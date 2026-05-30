import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "@/components/sidebar";
import { FeedbackButton } from "@/components/feedback-button";
import { Icons } from "@/components/sidebar-icons";

export const dynamic = "force-dynamic";

const BASE_NAV: NavItem[] = [
  { href: "/super",            label: "Overview",          icon: Icons.overview },
  { href: "/super/team",       label: "People",            icon: Icons.team,       section: "Manage" },
  { href: "/super/feedback",   label: "Feedback",          icon: Icons.feedback,   section: "Manage", badgeTone: "warning" },
  { href: "/super/activity",   label: "Activity",          icon: Icons.activity,   section: "Pulse" },
  { href: "/super/engagement", label: "Client engagement", icon: Icons.engagement, section: "Pulse" },
  { href: "/super/health",     label: "Pipeline health",   icon: Icons.health,     section: "Pulse" },
];

export default async function SuperLayout({ children }: { children: React.ReactNode }) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: profile } = await supabase
    .from("users")
    .select("role, full_name, email")
    .eq("id", user.id)
    .single();

  if (profile?.role !== "superadmin") {
    if (profile?.role === "party_viewer") redirect("/party");
    redirect("/firm");
  }

  // Unread feedback count → badge on the Feedback nav item.
  const { count: unreadFeedback } = await supabase
    .from("feedback")
    .select("id", { count: "exact", head: true })
    .eq("status", "new");

  const nav: NavItem[] = BASE_NAV.map((n) =>
    n.href === "/super/feedback"
      ? { ...n, badge: unreadFeedback ?? 0 }
      : n,
  );

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar scope="super" nav={nav} userName={profile.full_name ?? profile.email} />
      <main className="min-w-0 flex-1">{children}</main>
      <FeedbackButton />
    </div>
  );
}
