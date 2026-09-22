#!/usr/bin/env node
/* Delete load_*@example.com users (and their jobs/api keys) from the staging DB.
 * Usage:
 *   DATABASE_URL=... node scripts/cleanup-loadtest-users.cjs
 * Or set DATABASE_URL in env.
 */
const { Client } = require("pg");

const url = process.env.DATABASE_URL;
if (!url) { console.error("DATABASE_URL required"); process.exit(2); }

(async () => {
  const c = new Client({ connectionString: url });
  await c.connect();
  try {
    const sel = await c.query(`SELECT id, email FROM users WHERE email LIKE $1`, ["load_%@example.com"]);
    console.log(`Found ${sel.rowCount} load_* users`);
    if (sel.rowCount === 0) { await c.end(); return; }
    const ids = sel.rows.map(r => r.id);
    await c.query(`DELETE FROM batch_jobs WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => {});
    await c.query(`DELETE FROM batch_job_items WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => {});
    await c.query(`DELETE FROM api_keys WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => {});
    await c.query(`DELETE FROM user_sessions WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => {});
    await c.query(`DELETE FROM generation_history WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => {});
    await c.query(`DELETE FROM token_ledger WHERE user_id = ANY($1::uuid[])`, [ids]).catch(() => {});
    await c.query(`DELETE FROM users WHERE id = ANY($1::uuid[])`, [ids]);
    console.log(`Deleted ${ids.length} users`);
  } finally {
    await c.end();
  }
})().catch((e) => { console.error(e); process.exit(1); });
