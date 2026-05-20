import Link from "next/link";
import { Button } from "@/components/ui/button";

export default function LandingPage() {
  return (
    <main className="min-h-screen bg-sand">
      <div className="container mx-auto max-w-5xl px-6 py-24">
        <div className="text-xs uppercase tracking-[0.2em] text-bronze">Samvidya</div>
        <h1 className="mt-4 font-serif text-5xl font-bold text-navy md:text-6xl">
          Political intelligence for Arunachal Pradesh.
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted">
          Public-source signals, ranked by significance and routed to the people who can act on them.
        </p>
        <div className="mt-10 flex gap-3">
          <Link href="/login">
            <Button size="lg">Sign in</Button>
          </Link>
        </div>
        <div className="mt-24 grid gap-6 md:grid-cols-3">
          <Stat label="Districts covered" value="25" />
          <Stat label="Constituencies tracked" value="60" />
          <Stat label="Live signal sources" value="5" />
        </div>
      </div>
    </main>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-l-2 border-bronze pl-4">
      <div className="numeric-callout text-4xl text-navy">{value}</div>
      <div className="mt-1 text-sm text-muted">{label}</div>
    </div>
  );
}
