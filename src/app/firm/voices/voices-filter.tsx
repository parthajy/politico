"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function VoicesFilter({ districts, initial }: { districts: { id: number; name: string }[]; initial: { district?: string; active?: string } }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const [pending, start] = useTransition();

  function setParam(key: string, value: string) {
    const params = new URLSearchParams(sp.toString());
    if (value && value !== "all") params.set(key, value);
    else params.delete(key);
    start(() => router.push(`${pathname}?${params.toString()}`));
  }

  return (
    <div className="flex flex-wrap items-center gap-3">
      <label className="text-xs text-muted">
        <span className="sr-only">District</span>
        <select
          value={initial.district ?? "all"}
          onChange={(e) => setParam("district", e.target.value)}
          className="ml-1 h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
        >
          <option value="all">All districts</option>
          {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>
      </label>
      <label className="text-xs text-muted">
        <span className="sr-only">Active</span>
        <select
          value={initial.active ?? "all"}
          onChange={(e) => setParam("active", e.target.value)}
          className="ml-1 h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
        >
          <option value="all">All status</option>
          <option value="1">Active only</option>
          <option value="0">Dormant only</option>
        </select>
      </label>
      {pending && <span className="text-xs text-muted">loading…</span>}
    </div>
  );
}
