import "server-only";
import postgres from "postgres";

declare global {
  // eslint-disable-next-line no-var
  var __ctrSql: postgres.Sql | undefined;
}

/** The connection string, from DATABASE_URL or (Vercel's Supabase integration) POSTGRES_URL. */
export function databaseUrl(): string | undefined {
  return process.env.DATABASE_URL || process.env.POSTGRES_URL || undefined;
}

/**
 * Removes query parameters meant for other tools (e.g. `supa=`, `pgbouncer=` added by some Supabase/Vercel
 * connection strings). The postgres driver would otherwise send them to the server as settings, which fails.
 */
export function cleanDatabaseUrl(raw: string): string {
  try {
    const u = new URL(raw);
    for (const k of [...u.searchParams.keys()]) if (!["sslmode", "sslrootcert", "options", "application_name"].includes(k)) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return raw;
  }
}

function create(): postgres.Sql {
  return newClient();
}

/** A new, separate client with the app's settings (the setup check uses throwaway ones to test each query alone). */
export function newClient(overrides: { max?: number } = {}): postgres.Sql {
  const url = databaseUrl();
  if (!url) throw new Error("No database connection: set DATABASE_URL (or connect Supabase in Vercel, which sets POSTGRES_URL), then redeploy.");
  // prepare:false is required for Supabase's transaction pooler. max_pipeline:1 sends one query at a time per
  // connection: with several queries pipelined on one connection, the pooler can hand back another query's rows.
  return postgres(cleanDatabaseUrl(url), {
    prepare: false,
    // Supported by postgres.js but missing from its TypeScript types.
    ...({ max_pipeline: 1 } as object),
    // One connection per server instance. Supabase's pooler (especially in session mode, or with its small free pool
    // already in use) can hold extra connections waiting indefinitely, which made any page that runs several queries at
    // once hang. Queries now queue on one connection; at this app's size that costs only milliseconds.
    // Set DB_POOL_SIZE to raise it on a dedicated database.
    max: overrides.max ?? (Number(process.env.DB_POOL_SIZE) || 1),
    idle_timeout: 20,
    connect_timeout: 15,
    onnotice: () => {},
    // Return DATE columns as plain 'YYYY-MM-DD' strings (no time zone shifts).
    types: {
      date: { to: 1082, from: [1082], serialize: (x: string) => x, parse: (x: string) => x },
    },
  });
}

function client(): postgres.Sql {
  return globalThis.__ctrSql ?? (globalThis.__ctrSql = create());
}

/** Connects on first use, so a missing setting shows a helpful page instead of crashing at import. */
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, _this, args) => (client() as unknown as (...a: unknown[]) => unknown)(...args),
  get: (_t, prop) => {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
