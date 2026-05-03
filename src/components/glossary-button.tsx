"use client";

import { useState } from "react";
import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";

export function GlossaryButton({ tone = "light" }: { tone?: "light" | "dark" }) {
  const [open, setOpen] = useState(false);
  const colors = tone === "dark"
    ? "border-white/20 text-white/80 hover:bg-white/10"
    : "border-border text-muted hover:bg-sand";
  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className={`rounded border px-2.5 py-1 text-xs ${colors}`}
        aria-label="Open glossary"
      >
        ? Glossary
      </button>

      {open && (
        <div className="fixed inset-0 z-50 flex" onClick={() => setOpen(false)}>
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
                <Link href="/glossary" className="text-xs text-bronze underline" onClick={() => setOpen(false)}>Open full page</Link>
                <button onClick={() => setOpen(false)} aria-label="Close" className="text-muted hover:text-foreground">✕</button>
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
