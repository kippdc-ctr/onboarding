import StepPage from "../[id]/page";

export const dynamic = "force-dynamic";

export default async function NewStep({ searchParams }: { searchParams: Promise<{ ok?: string; error?: string }> }) {
  return StepPage({ params: Promise.resolve({ id: "new" }), searchParams });
}
