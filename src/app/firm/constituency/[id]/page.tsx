import { notFound } from "next/navigation";
import { ConstituencyView } from "@/components/constituency-view";
import { loadConstituency } from "@/lib/loaders/constituency";

export const dynamic = "force-dynamic";

export default async function FirmConstituency({ params }: { params: { id: string } }) {
  const id = parseInt(params.id, 10);
  if (Number.isNaN(id)) notFound();
  const data = await loadConstituency(id);
  if (!data) notFound();
  return <ConstituencyView data={data} readOnly={false} />;
}
