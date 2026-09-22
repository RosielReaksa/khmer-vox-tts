$ErrorActionPreference = 'SilentlyContinue'
$user = "C:\Users\Asus TUF F15"

Write-Host "=== hermes folder breakdown ===" -ForegroundColor Cyan
Write-Host "Path: $user\AppData\Local\hermes" -ForegroundColor DarkGray
# Identify what created it - look at top files/dirs
Get-ChildItem "$user\AppData\Local\hermes" -Force -EA SilentlyContinue | Select-Object Mode, Name, LastWriteTime, @{N='SizeMB';E={if(-not $_.PSIsContainer){[math]::Round($_.Length/1MB,2)}}} | Format-Table -AutoSize
Get-ChildItem "$user\AppData\Local\hermes" -Directory -Force -EA SilentlyContinue | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Subfolder=$_.Name; SizeGB=[math]::Round($s/1GB,2) }
} | Sort-Object SizeGB -Descending | Format-Table -AutoSize

# Sample files to identify the app
Write-Host "`n--- Sample files (top 10 largest) ---" -ForegroundColor Gray
Get-ChildItem "$user\AppData\Local\hermes" -Recurse -File -Force -EA SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 10 @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}, FullName |
    Format-Table -AutoSize -Wrap

Write-Host "`n=== .cache breakdown ===" -ForegroundColor Cyan
Write-Host "Path: $user\.cache" -ForegroundColor DarkGray
Get-ChildItem "$user\.cache" -Directory -Force -EA SilentlyContinue | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Folder=$_.Name; SizeGB=[math]::Round($s/1GB,2); LastWrite=$_.LastWriteTime }
} | Sort-Object SizeGB -Descending | Format-Table -AutoSize

# Docker prune preview - what would be removed
Write-Host "`n=== Docker current usage (before prune) ===" -ForegroundColor Cyan
Write-Host "Images:" -ForegroundColor Gray
docker images --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}" 2>$null
Write-Host "`nContainers:" -ForegroundColor Gray
docker ps -a --format "table {{.Names}}\t{{.Status}}\t{{.Size}}" 2>$null
Write-Host "`nSystem df:" -ForegroundColor Gray
docker system df 2>$null
