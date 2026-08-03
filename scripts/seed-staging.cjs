/*
 * One-time (repeatable) staging DB seed.
 *
 * Resets the public schema, creates the schema from export/database_dump.sql
 * (DDL only — psql meta-commands and COPY data blocks are stripped so plain
 * `pg` can run it), then loads the real data from
 * export/database_dump_production.sql (TRUNCATE + INSERT), then resyncs
 * serial sequences.
 *
 * Run it against the STAGING container (private DB reachable from inside):
 *   railway ssh -e staging -s fitcheq -- node scripts/seed-staging.cjs
 *
 * Guarded against production: refuses to run when RAILWAY_ENVIRONMENT_NAME is
 * "production" unless ALLOW_PROD_SEED=1 (it DROPs the schema and TRUNCATEs).
 */
const { Pool } = require("pg");
const fs = require("fs");

if (process.env.RAILWAY_ENVIRONMENT_NAME === "production" && process.env.ALLOW_PROD_SEED !== "1") {
  console.error("[seed] REFUSING: this is production. Set ALLOW_PROD_SEED=1 to override (it DROPs schema + TRUNCATEs).");
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
  // Single dedicated connection so search_path state is deterministic.
  const client = await pool.connect();
  try {
    // Idempotent reset so the seed can be re-run safely.
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
    console.log("[seed] public schema reset");

    await client.query(extractDDL(fs.readFileSync("export/database_dump.sql", "utf8")));
    console.log("[seed] schema created");

    // The pg_dump above sets search_path to '' on this connection. Restore it
    // so the data dump's unqualified names (TRUNCATE outfit_items, ...) resolve.
    await client.query("SET search_path TO public");

    await client.query(fs.readFileSync("export/database_dump_production.sql", "utf8"));
    console.log("[seed] production data loaded");

    // Resync serial sequences so future inserts don't collide with loaded ids.
    for (const [table, col] of [["items", "id"], ["activity_log", "id"], ["outfit_items", "id"], ["outfits", "id"]]) {
      const s = await client.query("SELECT pg_get_serial_sequence($1, $2) AS seq", [table, col]);
      if (s.rows[0].seq) {
        await client.query(`SELECT setval($1, (SELECT COALESCE(MAX(${col}), 1) FROM ${table}))`, [s.rows[0].seq]);
        console.log(`[seed] sequence resynced: ${table}`);
      }
    }

    for (const t of ["outfits", "items", "outfit_items", "users", "activity_log", "sessions"]) {
      const r = await client.query(`SELECT count(*)::int AS n FROM ${t}`);
      console.log(`[seed] ${t} = ${r.rows[0].n}`);
    }
    console.log("[seed] done");
  } catch (e) {
    console.error("[seed] ERROR:", e.message);
    process.exitCode = 1;
  } finally {
    client.release();
    await pool.end();
  }
})();
