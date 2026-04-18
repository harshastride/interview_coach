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
