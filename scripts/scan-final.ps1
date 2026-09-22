$ErrorActionPreference = 'SilentlyContinue'
$user = "C:\Users\Asus TUF F15"

# Cursor snapshots detail (10 GB)
Write-Host "=== Cursor snapshots ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Roaming\Cursor\snapshots" -Force -ErrorAction SilentlyContinue |
    Select-Object Name, LastWriteTime, @{N='DaysOld';E={[int]((Get-Date) - $_.LastWriteTime).Days}} |
    Sort-Object LastWriteTime | Format-Table -AutoSize

# Python Programs - many versions?
Write-Host "`n=== Python installs (Programs) ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\Programs\Python" -Directory -Force -ErrorAction SilentlyContinue |
    ForEach-Object {
        $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
        [PSCustomObject]@{ Folder=$_.Name; SizeGB=[math]::Round($s/1GB,2); LastWrite=$_.LastWriteTime }
    } | Sort-Object SizeGB -Descending | Format-Table -AutoSize

# Docker WSL distros (.vhdx files)
Write-Host "`n=== Docker WSL .vhdx files ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\Docker\wsl" -Recurse -File -Force -EA SilentlyContinue |
    Where-Object { $_.Extension -eq '.vhdx' } |
    Select-Object @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}, FullName |
    Sort-Object SizeGB -Descending | Format-Table -AutoSize -Wrap

# Chrome cache subfolders (cache is safe to delete)
Write-Host "`n=== Chrome Default cache breakdown ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\Google\Chrome\User Data\Default" -Directory -Force -EA SilentlyContinue |
    Where-Object { $_.Name -match 'Cache|Code Cache|GPUCache|Service Worker' } |
    ForEach-Object {
        $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
        [PSCustomObject]@{ Folder=$_.Name; SizeGB=[math]::Round($s/1GB,2) }
    } | Sort-Object SizeGB -Descending | Format-Table -AutoSize

# Ollama models (3 GB)
Write-Host "`n=== Ollama models ===" -ForegroundColor Cyan
Get-ChildItem "$user\.ollama\models" -Recurse -File -Force -EA SilentlyContinue |
    Where-Object { -not $_.PSIsContainer } |
    Select-Object @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}, Name, FullName |
    Sort-Object SizeGB -Descending | Select-Object -First 10 | Format-Table -AutoSize -Wrap
