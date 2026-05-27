"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { GLOSSARY } from "@/lib/glossary";
import { SignOutButton } from "@/components/sign-out-button";

export type NavItem = { href: string; label: string };

export function Sidebar({
  scope,
  nav,
  userName,
}: {
  scope: "firm" | "party" | "super";
  nav: NavItem[];
  userName: string;
}) {
  const pathname = usePathname();
  const [glossaryOpen, setGlossaryOpen] = useState(false);

  function isActive(href: string) {
    if (href === `/${scope}`) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  return (
    <>
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col border-r border-navy-deep bg-navy text-white">
        {/* Logo */}
        <div className="px-4 pt-5 pb-3">
          <Link href={`/${scope}`} className="block rounded-md bg-white px-3 py-2.5">
            <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-5 w-auto" priority />
          </Link>
          <div className="mt-2 text-[10px] uppercase tracking-[0.18em] text-bronze">
            {scope === "firm" ? "Analyst workbench" : scope === "party" ? "Cabinet dashboard" : "Superadmin"}
          </div>
        </div>

        {/* Nav */}
        <nav className="mt-2 flex-1 overflow-y-auto px-3">
          {nav.map((n) => {
            const active = isActive(n.href);
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`mb-0.5 flex items-center rounded-md px-3 py-2 text-sm transition ${
                  active
                    ? "bg-white/10 font-medium text-white"
                    : "text-white/70 hover:bg-white/5 hover:text-white"
                }`}
              >
                {active && <span className="mr-2 h-3.5 w-0.5 rounded-full bg-bronze" />}
                <span className={active ? "" : "ml-[14px]"}>{n.label}</span>
              </Link>
            );
          })}
        </nav>

        {/* Footer */}
        <div className="border-t border-white/10 px-3 py-3">
          <button
            onClick={() => setGlossaryOpen(true)}
            className="mb-2 flex w-full items-center rounded-md px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 hover:text-white"
          >
            ? Glossary
          </button>
          <div className="px-3 text-[11px] text-white/50">{userName}</div>
          <div className="mt-1.5 px-3">
            <SignOutButton />
          </div>
        </div>
      </aside>

      {glossaryOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setGlossaryOpen(false)}>
          <div className="flex-1 bg-navy-deep/40" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-white shadow-sm"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-sand px-5 py-3">
              <div>
                <div className="text-xs uppercase tracking-[0.18em] text-bronze">Reference</div>
                <h2 className="font-serif text-lg font-bold text-navy">Glossary</h2>
              </div>
              <div className="flex items-center gap-3">
                <Link href="/glossary" className="text-xs text-bronze underline" onClick={() => setGlossaryOpen(false)}>Full page</Link>
                <button onClick={() => setGlossaryOpen(false)} aria-label="Close" className="text-muted hover:text-foreground">✕</button>
              </div>
            </div>
            <div className="space-y-6 px-5 py-4">
              {GLOSSARY.map((s) => (
                <section key={s.title}>
                  <h3 className="text-xs font-bold uppercase tracking-wider text-muted">{s.title}</h3>
                  <dl className="mt-2 divide-y divide-border">
                    {s.items.map((i) => (
                      <div key={i.term} className="py-2">
                        <dt className="text-sm font-semibold text-navy">{i.term}</dt>
                        <dd className="mt-0.5 text-xs text-foreground/80">{i.short}</dd>
                        {i.long && <dd className="mt-1 text-xs text-muted">{i.long}</dd>}
                      </div>
                    ))}
                  </dl>
                </section>
              ))}
            </div>
          </aside>
        </div>
      )}
    </>
  );
}
