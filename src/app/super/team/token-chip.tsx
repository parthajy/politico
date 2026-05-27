"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { format, formatDistanceToNowStrict } from "date-fns";
import { toast } from "sonner";

export function TokenChip({
  userId, token, issuedAt, expiresAt, lastSeenAt,
}: {
  userId: string; token: string; issuedAt: string; expiresAt: string; lastSeenAt: string | null;
}) {
  const router = useRouter();
  const [reveal, setReveal] = useState(false);
  const [busy, setBusy] = useState(false);

  async function rotate() {
    if (!confirm("Rotate this volunteer's token? The old token stops working immediately. Their PWA will need to be re-signed-in with the new one.")) return;
    setBusy(true);
    try {
      const r = await fetch(`/api/team/${userId}?action=rotate`, { method: "POST" });
      const j = await r.json();
      if (!r.ok || !j.ok) { toast.error(j.error ?? "Rotate failed"); return; }
      toast.success("New token issued");
      setReveal(true);
      router.refresh();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function copy() {
    navigator.clipboard.writeText(token);
    toast.success("Token copied");
  }

  const expired = new Date(expiresAt) < new Date();

  return (
    <div>
      <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-muted">
        <span>Token</span>
        {expired && <span className="text-severity-1">expired</span>}
      </div>
      <div className="mt-1 flex flex-wrap items-center gap-2">
        <code className="break-all rounded border border-border bg-sand/60 px-2 py-1 font-mono text-[11px] text-navy">
          {reveal ? token : token.slice(0, 8) + "…" + token.slice(-4)}
        </code>
        <button onClick={() => setReveal((v) => !v)} className="rounded border border-border bg-white px-2 py-1 text-[10px] text-muted hover:bg-sand">
          {reveal ? "Hide" : "Reveal"}
        </button>
        <button onClick={copy} className="rounded border border-border bg-white px-2 py-1 text-[10px] text-muted hover:bg-sand">
          Copy
        </button>
        <button onClick={rotate} disabled={busy} className="rounded border border-bronze bg-bronze px-2 py-1 text-[10px] text-white hover:bg-bronze-dark disabled:opacity-50">
          {busy ? "…" : "Rotate"}
        </button>
      </div>
      <div className="mt-1 text-[10px] text-muted">
        Issued {formatDistanceToNowStrict(new Date(issuedAt))} ago · expires {format(new Date(expiresAt), "d MMM yyyy")}
        {lastSeenAt && <> · last seen {formatDistanceToNowStrict(new Date(lastSeenAt))} ago</>}
      </div>
    </div>
  );
}
