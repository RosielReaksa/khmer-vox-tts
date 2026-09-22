$ErrorActionPreference = 'Stop'
$remoteCmd = "kubectl -n khmer-vox exec khmer-vox-postgres-76998c7877-f6c59 -- psql -U postgres -d voxtts -tAc 'SELECT COUNT(*) FROM users WHERE email LIKE ''load_%'';'"
$count = ssh root@178.128.103.120 $remoteCmd 2>&1
Write-Host "Found load_* users: $count"
if ([int]$count -gt 0) {
    $delCmd = "kubectl -n khmer-vox exec khmer-vox-postgres-76998c7877-f6c59 -- psql -U postgres -d voxtts -c 'DELETE FROM batch_jobs WHERE user_id IN (SELECT id FROM users WHERE email LIKE ''load_%''); DELETE FROM batch_job_items WHERE user_id IN (SELECT id FROM users WHERE email LIKE ''load_%''); DELETE FROM api_keys WHERE user_id IN (SELECT id FROM users WHERE email LIKE ''load_%''); DELETE FROM user_sessions WHERE user_id IN (SELECT id FROM users WHERE email LIKE ''load_%''); DELETE FROM generation_history WHERE user_id IN (SELECT id FROM users WHERE email LIKE ''load_%''); DELETE FROM token_ledger WHERE user_id IN (SELECT id FROM users WHERE email LIKE ''load_%''); DELETE FROM users WHERE email LIKE ''load_%'';'"
    ssh root@178.128.103.120 $delCmd
}
$verifyCmd = "kubectl -n khmer-vox exec khmer-vox-postgres-76998c7877-f6c59 -- psql -U postgres -d voxtts -tAc 'SELECT COUNT(*) FROM users WHERE email LIKE ''load_%'';'"
$after = ssh root@178.128.103.120 $verifyCmd 2>&1
Write-Host "Remaining load_* users: $after"
