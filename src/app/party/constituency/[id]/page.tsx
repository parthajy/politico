import { notFound, redirect } from "next/navigation";
import { ConstituencyView } from "@/components/constituency-view";
import { loadConstituency } from "@/lib/loaders/constituency";
import { requireSession, isMinisterScope } from "@/lib/auth";

export const dynamic = "force-dynamic";

export default async function PartyConstituency({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();

  const ctx = await requireSession();
  // Ministers can only open their own seat. CMO can open any.
  if (isMinisterScope(ctx) && ctx.scope.constituency_id !== id) {
    redirect("/party");
  }

  const data = await loadConstituency(id);
  if (!data) notFound();
  return <ConstituencyView data={data} readOnly={true} />;
}
