export function LoadingShell({ title = "Loading…" }: { title?: string }) {
  return (
    <div className="container mx-auto max-w-5xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">{title}</div>
      <div className="mt-2 h-8 w-2/3 rounded bg-sand-deep" />
      <div className="mt-2 h-3 w-1/2 rounded bg-sand-deep" />
      <div className="mt-8 grid gap-4 md:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="rounded-lg border border-border bg-white p-5">
            <div className="h-4 w-1/2 rounded bg-sand-deep" />
            <div className="mt-3 h-8 w-1/3 rounded bg-sand-deep" />
            <div className="mt-3 h-3 w-2/3 rounded bg-sand-deep" />
          </div>
        ))}
      </div>
    </div>
  );
}
