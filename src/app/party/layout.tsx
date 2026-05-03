import Link from "next/link";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { auditLog } from "@/lib/audit";
import { SignOutButton } from "@/components/sign-out-button";
import { GlossaryButton } from "@/components/glossary-button";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/party", label: "Dashboard" },
  { href: "/party/cabinet", label: "Cabinet" },
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

  // Audit every party page view per the brief. Log path so the firm can see
  // what the CMO is actually reading.
  const path = headers().get("x-pathname") ?? "/party";
  // Don't await — fire-and-forget so it never adds latency to the page render.
  auditLog({
    user_id: user.id,
    action: "party_view",
    entity_type: "page",
    entity_id: path,
  }).catch(() => { /* swallow — audit must not break the page */ });

  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-border bg-navy text-white">
        <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/party" className="font-serif text-lg font-bold tracking-tight">
              Signal Desk <span className="ml-2 text-xs font-sans font-normal uppercase tracking-widest text-bronze">Cabinet</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.map((n) => (
                <Link
                  key={n.href}
                  href={n.href}
                  className="rounded px-3 py-1.5 text-sm text-white/80 hover:bg-white/5 hover:text-white"
                >
                  {n.label}
                </Link>
              ))}
            </nav>
          </div>
          <div className="flex items-center gap-3 text-sm">
            <GlossaryButton tone="dark" />
            <span className="text-white/60">{profile.full_name ?? profile.email}</span>
            <SignOutButton />
          </div>
        </div>
      </header>
      <main>{children}</main>
    </div>
  );
}
