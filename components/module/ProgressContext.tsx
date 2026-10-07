"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

export type Requirement = { key: string; label: string; done: boolean };

type Ctx = { report: (key: string, done: boolean) => void; reqs: Requirement[] };
const C = createContext<Ctx>({ report: () => {}, reqs: [] });

export function ModuleProgressProvider({ initial, children }: { initial: Requirement[]; children: React.ReactNode }) {
  const [reqs, setReqs] = useState(initial);
  const report = useCallback((key: string, done: boolean) => {
    setReqs((rs) => (rs.some((r) => r.key === key && r.done !== done) ? rs.map((r) => (r.key === key ? { ...r, done } : r)) : rs));
  }, []);
  const value = useMemo(() => ({ report, reqs }), [report, reqs]);
  return <C.Provider value={value}>{children}</C.Provider>;
}

export const useModuleProgress = () => useContext(C);
