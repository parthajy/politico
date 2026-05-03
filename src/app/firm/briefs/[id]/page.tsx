import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { BriefEditor } from "./brief-editor";
import { format } from "date-fns";

export const dynamic = "force-dynamic";

export default async function BriefEditorPage({ params }: { params: { id: string } }) {
  const sb = createClient();
  const { data: brief } = await sb
    .from("briefs")
    .select("id, brief_date, body_md, generated_by_model, generated_at, published_at, approved_by")
    .eq("id", params.id)
    .maybeSingle();

  if (!brief) notFound();

  return (
    <div className="container mx-auto max-w-4xl px-6 py-10">
      <div className="text-xs uppercase tracking-[0.18em] text-bronze">Brief · {brief.generated_by_model ?? "manual"}</div>
      <h1 className="mt-2 font-serif text-3xl font-bold text-navy">
        {format(new Date(brief.brief_date), "EEEE, d MMMM yyyy")}
      </h1>
      <p className="mt-1 text-sm text-muted">
        {brief.published_at
          ? <>Published {format(new Date(brief.published_at), "d MMM, HH:mm")} · visible on the party view</>
          : <>Draft — generated {format(new Date(brief.generated_at), "d MMM, HH:mm")}</>}
      </p>

      <BriefEditor
        id={brief.id}
        initialBody={brief.body_md ?? ""}
        published={!!brief.published_at}
      />
    </div>
  );
}
