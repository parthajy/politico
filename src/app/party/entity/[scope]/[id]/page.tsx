// Party-side memory vault. Uses the same loader as /firm/entity — RLS limits
// what party_viewer sees (published stories only, no firm internal notes, etc.).
// We re-export the firm component to avoid duplication.

export { default } from "@/app/firm/entity/[scope]/[id]/page";
export { dynamic } from "@/app/firm/entity/[scope]/[id]/page";
