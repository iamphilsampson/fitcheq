/*
 * One-time (repeatable) staging DB seed.
 *
 * Creates the schema from export/database_dump.sql (DDL only — the psql
 * meta-commands and COPY data blocks are stripped so plain `pg` can run it),
 * then loads the real data from export/database_dump_production.sql
 * (TRUNCATE + INSERT), then resyncs serial sequences.
 *
 * Run it against the STAGING container (private DB reachable from inside):
 *   railway ssh -e staging -s fitcheq -- node scripts/seed-staging.js
 *
 * Guarded against production: it refuses to run when RAILWAY_ENVIRONMENT_NAME
 * is "production" unless ALLOW_PROD_SEED=1 is explicitly set, because the
 * production data dump begins with TRUNCATE ... CASCADE.
 */
const { Pool } = require("pg");
const fs = require("fs");

if (process.env.RAILWAY_ENVIRONMENT_NAME === "production" && process.env.ALLOW_PROD_SEED !== "1") {
  console.error("[seed] REFUSING: this is the production environment. Set ALLOW_PROD_SEED=1 to override (it TRUNCATEs).");
  process.exit(1);
}

// Extract pure DDL from a pg_dump file: drop psql backslash meta-commands
// (\restrict, \unrestrict, \.) and every COPY ... FROM stdin data block.
function extractDDL(sql) {
  const out = [];
  let inCopy = false;
  for (const line of sql.split("\n")) {
    if (inCopy) {
      if (line.trim() === "\\.") inCopy = false;
      continue;
    }
    if (/^COPY .* FROM stdin;/.test(line)) { inCopy = true; continue; }
    if (/^\\/.test(line)) continue; // \restrict / \unrestrict / other meta
    out.push(line);
  }
  return out.join("\n");
}

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    await pool.query(extractDDL(fs.readFileSync("export/database_dump.sql", "utf8")));
    console.log("[seed] schema created");

    await pool.query(fs.readFileSync("export/database_dump_production.sql", "utf8"));
    console.log("[seed] production data loaded");

    // Resync serial sequences so future inserts don't collide with loaded ids.
    for (const [table, col] of [["items", "id"], ["activity_log", "id"], ["outfit_items", "id"], ["outfits", "id"]]) {
      const s = await pool.query("SELECT pg_get_serial_sequence($1, $2) AS seq", [table, col]);
      if (s.rows[0].seq) {
        await pool.query(`SELECT setval($1, (SELECT COALESCE(MAX(${col}), 1) FROM ${table}))`, [s.rows[0].seq]);
        console.log(`[seed] sequence resynced: ${table}`);
      }
    }

    for (const t of ["outfits", "items", "outfit_items", "users", "activity_log", "sessions"]) {
      try {
        const r = await pool.query(`SELECT count(*)::int AS n FROM ${t}`);
        console.log(`[seed] ${t} = ${r.rows[0].n}`);
      } catch (e) {
        console.log(`[seed] ${t} = (missing: ${e.message})`);
      }
    }
    console.log("[seed] done");
  } catch (e) {
    console.error("[seed] ERROR:", e.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
})();
