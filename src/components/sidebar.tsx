"use client";

import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { GLOSSARY } from "@/lib/glossary";
import { SignOutButton } from "@/components/sign-out-button";
import { CommandPalette } from "@/components/command-palette";

export type NavItem = { href: string; label: string };

const SCOPE_LABEL: Record<"firm" | "party" | "super", string> = {
  firm: "Analyst workbench",
  party: "Cabinet dashboard",
  super: "Superadmin",
};

const COLLAPSE_KEY = "samvidya:sidebar:collapsed";

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
  const [collapsed, setCollapsed] = useState(false);

  // Load persisted state once on mount
  useEffect(() => {
    try {
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
    } catch { /* localStorage may be blocked */ }
  }, []);

  function toggleCollapse() {
    setCollapsed((v) => {
      const next = !v;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch { /* noop */ }
      return next;
    });
  }

  function isActive(href: string) {
    if (href === `/${scope}`) return pathname === href;
    return pathname === href || pathname.startsWith(href + "/");
  }

  const initials = userName.split(/\s+|@/).slice(0, 2).map((s) => s[0]?.toUpperCase()).join("");

  return (
    <>
      <aside
        className={`sticky top-0 flex h-screen shrink-0 flex-col border-r border-border bg-white transition-[width] duration-200 ease-out ${
          collapsed ? "w-14" : "w-60"
        }`}
      >
        {/* Brand block + collapse toggle + brain-map shortcut */}
        <div className={`pt-5 pb-4 ${collapsed ? "px-2" : "px-4"}`}>
          <div className="flex items-center justify-between gap-2">
            <Link href={`/${scope}`} className="block" title="Samvidya">
              {collapsed ? (
                <div className="flex h-7 w-7 items-center justify-center rounded-md bg-navy text-[11px] font-bold text-white">S</div>
              ) : (
                <Image src="/logo.png" alt="Samvidya" width={1114} height={242} className="h-6 w-auto" priority />
              )}
            </Link>
            {!collapsed && scope !== "super" && (
              <Link
                href={`/${scope}/brain`}
                title="Brain map — entity graph"
                className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-border text-bronze-dark hover:border-bronze hover:bg-bronze-soft"
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M9.5 2A2.5 2.5 0 0 1 12 4.5v15a2.5 2.5 0 0 1-4.96.44 2.5 2.5 0 0 1-2.96-3.08 3 3 0 0 1-.34-5.58 2.5 2.5 0 0 1 1.32-4.24 2.5 2.5 0 0 1 1.98-3A2.5 2.5 0 0 1 9.5 2Z"/>
                  <path d="M14.5 2A2.5 2.5 0 0 0 12 4.5v15a2.5 2.5 0 0 0 4.96.44 2.5 2.5 0 0 0 2.96-3.08 3 3 0 0 0 .34-5.58 2.5 2.5 0 0 0-1.32-4.24 2.5 2.5 0 0 0-1.98-3A2.5 2.5 0 0 0 14.5 2Z"/>
                </svg>
              </Link>
            )}
          </div>
          {!collapsed && (
            <div className="mt-2 text-[10px] font-medium uppercase tracking-[0.18em] text-bronze">
              {SCOPE_LABEL[scope]}
            </div>
          )}
        </div>

        {/* Search trigger — opens the ⌘K palette */}
        {!collapsed && (
          <div className="px-3 pb-2">
            <CommandPalette />
          </div>
        )}

        {/* Nav */}
        <nav className={`mt-1 flex-1 overflow-y-auto ${collapsed ? "px-2" : "px-2.5"}`}>
          {nav.map((n) => {
            const active = isActive(n.href);
            // Collapsed mode: just a colored dot pill as the link target
            if (collapsed) {
              return (
                <Link
                  key={n.href}
                  href={n.href}
                  title={n.label}
                  className={`mb-0.5 flex h-9 items-center justify-center rounded-lg transition ${
                    active ? "bg-bronze-soft text-bronze-dark" : "text-foreground/60 hover:bg-surface-2 hover:text-foreground"
                  }`}
                >
                  <span className="text-[11px] font-semibold uppercase">{n.label[0]}</span>
                </Link>
              );
            }
            return (
              <Link
                key={n.href}
                href={n.href}
                className={`mb-0.5 flex items-center gap-2.5 rounded-lg px-3 py-2 text-[13px] transition ${
                  active
                    ? "bg-bronze-soft font-medium text-bronze-dark"
                    : "text-foreground/70 hover:bg-surface-2 hover:text-foreground"
                }`}
              >
                <span
                  className={`inline-block h-1.5 w-1.5 rounded-full ${
                    active ? "bg-bronze" : "bg-transparent group-hover:bg-muted/40"
                  }`}
                />
                {n.label}
              </Link>
            );
          })}
        </nav>

        {/* Footer — collapse toggle + glossary + user */}
        <div className={`border-t border-border py-3 ${collapsed ? "px-2" : "px-3"}`}>
          <button
            onClick={toggleCollapse}
            title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
            className={`mb-2 flex w-full items-center rounded-md px-3 py-1.5 text-[11px] text-muted hover:bg-surface-2 hover:text-foreground ${
              collapsed ? "justify-center px-0" : "gap-2"
            }`}
          >
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {collapsed ? <path d="M5 12h14M13 6l6 6-6 6" /> : <path d="M19 12H5M11 6l-6 6 6 6" />}
            </svg>
            {!collapsed && <span>Collapse</span>}
          </button>

          {!collapsed && (
            <>
              <button
                onClick={() => setGlossaryOpen(true)}
                className="mb-2 flex w-full items-center gap-2 rounded-md px-3 py-1.5 text-[11px] text-muted hover:bg-surface-2 hover:text-foreground"
              >
                <span className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-border text-[9px] text-muted">?</span>
                Glossary
              </button>

              <div className="flex items-center gap-2.5 px-2 pt-1">
                <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-bronze-soft text-[11px] font-semibold text-bronze-dark">
                  {initials || "U"}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="truncate text-[12px] font-medium text-navy">{userName}</div>
                  <SignOutButton />
                </div>
              </div>
            </>
          )}

          {collapsed && (
            <div className="flex flex-col items-center gap-2 pt-1">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-bronze-soft text-[11px] font-semibold text-bronze-dark" title={userName}>
                {initials || "U"}
              </div>
            </div>
          )}
        </div>
      </aside>

      {glossaryOpen && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setGlossaryOpen(false)}>
          <div className="flex-1 bg-navy/20" />
          <aside
            onClick={(e) => e.stopPropagation()}
            className="flex h-full w-full max-w-lg flex-col overflow-y-auto border-l border-border bg-white shadow-soft-lg"
          >
            <div className="sticky top-0 flex items-center justify-between border-b border-border bg-surface px-5 py-3">
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
