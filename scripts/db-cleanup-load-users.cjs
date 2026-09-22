const { execSync } = require("node:child_process");
function psql(sql) {
  // Pass the SQL as a single argument to -c, with quotes escaped for the outer ssh command.
  const escaped = sql.replace(/"/g, '\\"');
  const c = `ssh root@178.128.103.120 "kubectl -n khmer-vox exec khmer-vox-postgres-76998c7877-f6c59 -- psql -U postgres -d voxtts -tAc \\"${escaped}\\""`;
  return execSync(c, { encoding: "utf8" }).trim();
}
const count = psql("SELECT COUNT(*) FROM users WHERE email LIKE 'load_%'");
console.log("found load_* users: " + count);
if (parseInt(count, 10) > 0) {
  const deletes = [
    "DELETE FROM batch_job_items WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'load_%')",
    "DELETE FROM batch_jobs WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'load_%')",
    "DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'load_%')",
    "DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'load_%')",
    "DELETE FROM generation_history WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'load_%')",
    "DELETE FROM token_ledger WHERE user_id IN (SELECT id FROM users WHERE email LIKE 'load_%')",
    "DELETE FROM users WHERE email LIKE 'load_%'",
  ];
  for (const sql of deletes) {
    try {
      const out = psql(sql);
      console.log(sql.slice(0, 60) + "... -> " + (out || "ok"));
    } catch (e) {
      console.log(sql.slice(0, 60) + "... -> " + (e.stderr || e.message).slice(0, 200));
    }
  }
}
const after = psql("SELECT COUNT(*) FROM users WHERE email LIKE 'load_%'");
console.log("remaining load_* users: " + after);
