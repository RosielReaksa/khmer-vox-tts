# Investigate hermes and .cache folders
$ErrorActionPreference = 'SilentlyContinue'
$user = "C:\Users\Asus TUF F15"

Write-Host "=== HERMES FOLDER ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\hermes" -Force | Select-Object Mode, Name, LastWriteTime | Format-Table -AutoSize

Write-Host "`n=== HERMES subfolders with sizes ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\hermes" -Directory -Force | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Folder=$_.Name; SizeGB=[math]::Round($s/1GB,2); LastWrite=$_.LastWriteTime }
} | Sort-Object SizeGB -Descending | Format-Table -AutoSize

Write-Host "`n=== HERMES sample files (to identify the app) ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\hermes" -Recurse -File -Force -EA SilentlyContinue |
    Sort-Object Length -Descending | Select-Object -First 15 @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}}, FullName |
    Format-Table -AutoSize -Wrap

Write-Host "`n=== .CACHE FOLDER ===" -ForegroundColor Cyan
Get-ChildItem "$user\.cache" -Directory -Force | ForEach-Object {
    $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
    [PSCustomObject]@{ Folder=$_.Name; SizeGB=[math]::Round($s/1GB,2); LastWrite=$_.LastWriteTime }
} | Sort-Object SizeGB -Descending | Format-Table -AutoSize