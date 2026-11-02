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

// ---- One query at a time ----
// On Supabase's pooler, two table queries in flight on the same connection can hang forever (seen in production:
// each query alone answered in a few ms; any two at once never returned, and the connection stayed stuck).
// So every query waits for the previous one to finish before it is sent. If one ever takes too long, the
// connection is thrown away and a fresh one is used, so a single bad moment can't freeze the site.
const QUERY_TIMEOUT_MS = 10_000;
let chain: Promise<unknown> = Promise.resolve();

function enqueue<T>(run: () => Promise<T>): Promise<T> {
  const next = chain.then(run, run);
  chain = next.catch(() => {});
  return next;
}

function withTimeout<T>(p: Promise<T>): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([
    p,
    new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        const stuck = globalThis.__ctrSql;
        globalThis.__ctrSql = undefined;
        stuck?.end({ timeout: 0 }).catch(() => {});
        reject(Object.assign(new Error("The database did not answer in time. Please try again."), { code: "TIMEOUT" }));
      }, QUERY_TIMEOUT_MS);
    }),
  ]).finally(() => clearTimeout(timer));
}

/** Make a postgres.js query run through the one-at-a-time queue when it is awaited. Fragments are untouched. */
function serialize<T>(q: T): T {
  const query = q as unknown as { then?: (...a: unknown[]) => unknown };
  if (!query || typeof query.then !== "function") return q;
  const originalThen = query.then.bind(query) as (f: (v: unknown) => unknown) => Promise<unknown>;
  let result: Promise<unknown> | null = null;
  query.then = (onFulfilled?: unknown, onRejected?: unknown) => {
    result ??= enqueue(() => withTimeout(originalThen((v) => v)));
    return result.then(onFulfilled as never, onRejected as never);
  };
  return q;
}

/** Connects on first use, so a missing setting shows a helpful page instead of crashing at import. */
export const sql: postgres.Sql = new Proxy(function () {} as unknown as postgres.Sql, {
  apply: (_t, _this, args) => serialize((client() as unknown as (...a: unknown[]) => unknown)(...args)),
  get: (_t, prop) => {
    const c = client() as unknown as Record<string | symbol, unknown>;
    const v = c[prop];
    if (prop === "unsafe" && typeof v === "function") return (...a: unknown[]) => serialize((v as (...x: unknown[]) => unknown).apply(c, a));
    return typeof v === "function" ? (v as (...a: unknown[]) => unknown).bind(c) : v;
  },
});
