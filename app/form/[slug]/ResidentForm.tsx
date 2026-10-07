"use client";

import { useRouter } from "next/navigation";
import { FormRenderer } from "@/components/FormRenderer";

export function ResidentForm(props: Omit<React.ComponentProps<typeof FormRenderer>, "onDone"> & { back: string }) {
  const router = useRouter();
  const { back, ...rest } = props;
  return (
    <FormRenderer
      {...rest}
      submitLabel="Submit survey"
      onDone={() => {
        router.push(back);
        router.refresh();
      }}
    />
  );
}
