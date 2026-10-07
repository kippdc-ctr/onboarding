import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __ctrSql: postgres.Sql | undefined;
}

function create() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is not set");
  // prepare:false is required for Supabase's transaction pooler.
  return postgres(url, {
    prepare: false,
    max: 5,
    idle_timeout: 20,
    onnotice: () => {},
    // Return DATE columns as plain 'YYYY-MM-DD' strings (no time zone shifts).
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

export const sql: postgres.Sql = globalThis.__ctrSql ?? (globalThis.__ctrSql = create());
