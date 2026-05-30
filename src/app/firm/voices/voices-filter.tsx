"use client";

import { useTransition } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";

export function VoicesFilter({
  districts,
  initial,
  reviewQueueCount,
}: {
  districts: { id: number; name: string }[];
  initial: { district?: string; active?: string; review?: string; profession?: string; rel?: string };
  reviewQueueCount?: number;
}) {
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

  function setReview(v: boolean) {
    const params = new URLSearchParams(sp.toString());
    if (v) params.set("review", "1");
    else params.delete("review");
    start(() => router.push(`${pathname}?${params.toString()}`));
  }

  const reviewOn = initial.review === "1";

  return (
    <div className="flex flex-wrap items-center gap-2">
      {/* Review-queue toggle — auto-extracted + status=unknown */}
      <button
        onClick={() => setReview(!reviewOn)}
        className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-medium transition ${
          reviewOn ? "border-bronze bg-bronze-soft text-bronze-dark" : "border-border bg-white text-muted hover:bg-surface-2"
        }`}
      >
        🔍 Review queue
        {typeof reviewQueueCount === "number" && (
          <span className={`rounded-full px-1.5 text-[10px] ${reviewOn ? "bg-bronze text-white" : "bg-surface-2 text-muted"}`}>
            {reviewQueueCount}
          </span>
        )}
      </button>

      <label className="text-xs text-muted">
        <span className="sr-only">District</span>
        <select
          value={initial.district ?? "all"}
          onChange={(e) => setParam("district", e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
        >
          <option value="all">All districts</option>
          {districts.map((d) => <option key={d.id} value={String(d.id)}>{d.name}</option>)}
        </select>
      </label>

      <label className="text-xs text-muted">
        <span className="sr-only">Profession</span>
        <select
          value={initial.profession ?? "all"}
          onChange={(e) => setParam("profession", e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
        >
          <option value="all">All professions</option>
          <option value="journalist">Journalist</option>
          <option value="activist">Activist</option>
          <option value="official">Official</option>
          <option value="influencer">Influencer</option>
          <option value="community_leader">Community leader</option>
          <option value="politician">Politician</option>
          <option value="expert">Expert</option>
          <option value="troll">Troll</option>
          <option value="commenter">Commenter</option>
          <option value="unknown">Unknown</option>
        </select>
      </label>

      <label className="text-xs text-muted">
        <span className="sr-only">Relationship</span>
        <select
          value={initial.rel ?? "all"}
          onChange={(e) => setParam("rel", e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
        >
          <option value="all">All relationships</option>
          <option value="warm">🤝 Warm</option>
          <option value="cool">🌫️ Cool</option>
          <option value="hostile">⚠️ Hostile</option>
          <option value="unknown">❓ Unknown</option>
        </select>
      </label>

      <label className="text-xs text-muted">
        <span className="sr-only">Active</span>
        <select
          value={initial.active ?? "all"}
          onChange={(e) => setParam("active", e.target.value)}
          className="h-9 rounded-md border border-border bg-white px-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bronze"
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
