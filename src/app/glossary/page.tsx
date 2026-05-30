import Link from "next/link";
import { GLOSSARY } from "@/lib/glossary";

export const dynamic = "force-static";

export default function GlossaryPage() {
  return (
    <main className="min-h-screen bg-surface">
      <div className="container mx-auto max-w-3xl px-6 py-16">
        <div className="text-xs uppercase tracking-[0.18em] text-bronze">Reference</div>
        <h1 className="mt-2 font-serif text-4xl font-bold text-navy">Samvidya glossary</h1>
        <p className="mt-2 text-sm text-muted">
          Vocabulary, scoring rules, doctrines and source map. Bookmark or print for the cabinet briefing.
        </p>

        <div className="mt-10 space-y-10">
          {GLOSSARY.map((s) => (
            <section key={s.title}>
              <h2 className="font-serif text-xl font-bold text-navy">{s.title}</h2>
              <dl className="mt-3 divide-y divide-border border-y border-border bg-white">
                {s.items.map((i) => (
                  <div key={i.term} className="grid gap-2 px-4 py-3 sm:grid-cols-[200px_1fr]">
                    <dt className="font-semibold text-navy">{i.term}</dt>
                    <dd>
                      <div className="text-sm text-foreground/85">{i.short}</div>
                      {i.long && <div className="mt-1 text-xs text-muted">{i.long}</div>}
                    </dd>
                  </div>
                ))}
              </dl>
            </section>
          ))}
        </div>

        <div className="mt-16 flex justify-between text-sm">
          <Link href="/firm" className="text-bronze underline">← Back to Firm</Link>
          <Link href="/party" className="text-bronze underline">Open Party →</Link>
        </div>
      </div>
    </main>
  );
}
