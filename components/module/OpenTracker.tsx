"use client";

import { useEffect } from "react";
import { markModuleOpened } from "@/app/actions/resident";

/** Records that the resident opened the module (moves it from Not started to In progress). */
export function OpenTracker({ moduleSlug }: { moduleSlug: string }) {
  useEffect(() => {
    markModuleOpened(moduleSlug).catch(() => {});
  }, [moduleSlug]);
  return null;
}
