import pg from "pg";

const connectionString = process.env.DATABASE_URL;
const useSupabaseSsl = connectionString?.includes(".supabase.co") === true;

export const pgPool = new pg.Pool({
  connectionString,
  ssl: useSupabaseSsl ? { rejectUnauthorized: false } : undefined,
  // Optimize for Supabase (remote DB) — keep connections warm
  min: 2,
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

// Idle pooled clients can be dropped by the remote host (e.g. Supabase's
// pooler recycling idle connections) and emit 'error' on the pool. Without
// a listener, Node treats that as an unhandled EventEmitter error and
// crashes the whole process — the pool itself recovers fine on its own.
pgPool.on("error", (err) => {
  console.error("Idle Postgres client error (pool recovers automatically):", err.message);
});
