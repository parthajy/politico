"use client";

import Link from "next/link";
import { useEffect } from "react";
import { Button } from "@/components/ui/button";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error("page error", error);
  }, [error]);

  return (
    <div className="container mx-auto max-w-xl px-6 py-24 text-center">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Something broke</div>
      <h1 className="mt-3 font-serif text-3xl font-bold text-navy">We hit an error rendering this view</h1>
      <p className="mt-2 text-sm text-muted">{error.message || "Unknown error"}</p>
      {error.digest && <p className="mt-1 font-mono text-[10px] text-muted">digest: {error.digest}</p>}
      <div className="mt-6 flex justify-center gap-2">
        <Button onClick={reset}>Try again</Button>
        <Link href="/"><Button variant="outline">Home</Button></Link>
      </div>
    </div>
  );
}
