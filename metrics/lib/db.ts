import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __metricsSql: postgres.Sql | undefined;
}

function create() {
  // POSTGRES_URL is what the Vercel ↔ Supabase integration sets automatically.
  const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false is required for Supabase's transaction pooler.
  return postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    types: {
      // DATE columns as plain 'YYYY-MM-DD' strings (no time zone shifts); NUMERIC as JS numbers.
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
      numeric: { to: 1700, from: [1700], serialize: (x: number) => String(x), parse: (x: string) => Number(x) },
    },
  });
}

export const sql: postgres.Sql = globalThis.__metricsSql ?? (globalThis.__metricsSql = create());
