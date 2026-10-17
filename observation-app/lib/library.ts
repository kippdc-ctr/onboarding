import "server-only";
import { sql } from "./db";

/** Next permanent ID for a new library step: AS-101, AS-102, … (seed steps use AS-001 to AS-048 and AS-L01…). */
export async function nextStepId(): Promise<string> {
  const [r] = await sql<{ n: number | null }[]>`
    select max(substring(id from 4)::int) as n from action_steps where id ~ '^AS-[0-9]+$'`;
  return `AS-${String(Math.max(100, r?.n ?? 0) + 1).padStart(3, "0")}`;
}
