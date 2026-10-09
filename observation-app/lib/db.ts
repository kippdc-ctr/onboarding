import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __obsSql: postgres.Sql | undefined;
}

function create() {
  // POSTGRES_URL is what the Vercel ↔ Supabase integration sets automatically.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false is required for Supabase's transaction pooler. max_pipeline:1 sends one query at a time per
  // connection: with several queries pipelined on one connection, the pooler can hand back another query's rows
  // (seen in production as the track list showing up where the observer list belongs).
  return postgres(url, {
    prepare: false,
    // Supported by postgres.js but missing from its TypeScript types.
    ...({ max_pipeline: 1 } as object),
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    // Return DATE columns as plain 'YYYY-MM-DD' strings (no time zone shifts).
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export const sql: postgres.Sql = globalThis.__obsSql ?? (globalThis.__obsSql = create());
