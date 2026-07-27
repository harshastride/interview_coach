import { pgPool } from "./src/server/db/pool.ts";
import { TERM_ENTRIES } from "./src/termData.ts";

async function seed() {
  console.log("Seeding database...");
  const client = await pgPool.connect();
  try {
    const { rows: users } = await client.query("SELECT id FROM users LIMIT 1");
    let userId = users[0]?.id;
    if (!userId) {
      console.log("Creating dummy admin user...");
      const res = await client.query(
        "INSERT INTO users (google_id, email, name, role, is_allowed) VALUES ($1, $2, $3, $4, $5) RETURNING id",
        ['dummy-admin', 'admin@example.com', 'Admin', 'admin', 1]
      );
      userId = res.rows[0].id;
    }

    console.log("Inserting terms...");
    let count = 0;
    for (const term of TERM_ENTRIES) {
      const check = await client.query("SELECT id FROM uploaded_terms WHERE t = $1", [term.t]);
      if (check.rows.length === 0) {
        await client.query(
          "INSERT INTO uploaded_terms (t, d, l, c, added_by) VALUES ($1, $2, $3, $4, $5)",
          [term.t, term.d, term.l, term.c, userId]
        );
        count++;
      }
    }
    console.log(`Successfully seeded ${count} terms.`);

    // Check if we need to insert dummy interview data
    const interviewCount = await client.query("SELECT count(*) FROM uploaded_interview");
    if (parseInt(interviewCount.rows[0].count) === 0) {
      console.log("Inserting dummy interview data...");
      await client.query(`
        INSERT INTO uploaded_interview (question, ideal_answer, role, company, category, added_by)
        VALUES 
        ('What is your greatest strength?', 'My ability to learn quickly.', 'Engineer', 'General', 'Behavioral', $1),
        ('How does a HashMap work?', 'It uses a hash function to map keys to buckets.', 'Software Engineer', 'Tech', 'Technical', $1)
      `, [userId]);
    }
    console.log("Seeding complete.");
  } catch (error) {
    console.error("Error seeding data:", error);
  } finally {
    client.release();
    process.exit(0);
  }
}

seed();
