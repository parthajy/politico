import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { Sidebar, type NavItem } from "@/components/sidebar";

export const dynamic = "force-dynamic";

const NAV: NavItem[] = [
  { href: "/super", label: "Overview" },
  { href: "/super/team", label: "People" },
  { href: "/super/activity", label: "Activity" },
  { href: "/super/engagement", label: "Client engagement" },
  { href: "/super/health", label: "Pipeline health" },
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
    // Send everyone else to their home
    if (profile?.role === "party_viewer") redirect("/party");
    redirect("/firm");
  }

  return (
    <div className="flex min-h-screen bg-surface">
      <Sidebar scope="super" nav={NAV} userName={profile.full_name ?? profile.email} />
      <main className="min-w-0 flex-1">{children}</main>
    </div>
  );
}
