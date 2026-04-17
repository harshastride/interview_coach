import pg from "pg";

export const pgPool = new pg.Pool({
  connectionString:
    process.env.DATABASE_URL ||
    "postgresql://flashcards:flashcards@localhost:5432/flashcards",
});
