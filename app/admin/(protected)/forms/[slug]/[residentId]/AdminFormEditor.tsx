"use client";

import { useRouter } from "next/navigation";
import { FormRenderer } from "@/components/FormRenderer";

export function AdminFormEditor(props: Omit<React.ComponentProps<typeof FormRenderer>, "onDone" | "saveDraft">) {
  const router = useRouter();
  return <FormRenderer {...props} submitLabel="Save changes" onDone={() => router.refresh()} />;
}
