import Link from "next/link";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { SignOutButton } from "@/components/sign-out-button";
import { GlossaryButton } from "@/components/glossary-button";

export const dynamic = "force-dynamic";

const NAV = [
  { href: "/firm", label: "Inbox" },
  { href: "/firm/voices", label: "Voices" },
  { href: "/firm/stories", label: "Stories" },
  { href: "/firm/sources", label: "Sources" },
  { href: "/firm/briefs", label: "Briefs" },
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

  return (
    <div className="min-h-screen bg-sand">
      <header className="border-b border-border bg-navy text-white">
        <div className="container mx-auto flex h-14 max-w-7xl items-center justify-between px-6">
          <div className="flex items-center gap-8">
            <Link href="/firm" className="font-serif text-lg font-bold tracking-tight">
              Signal Desk <span className="ml-2 text-xs font-sans font-normal uppercase tracking-widest text-bronze">Firm</span>
            </Link>
            <nav className="flex items-center gap-1">
              {NAV.filter(n => !n.adminOnly || profile.role === "firm_admin").map((n) => (
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
