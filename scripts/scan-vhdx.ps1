# Find large .vhdx files (Docker/WSL)
$ErrorActionPreference = 'SilentlyContinue'
$user = "C:\Users\Asus TUF F15"
Write-Host "=== Docker WSL .vhdx files ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\Docker\wsl" -Recurse -File -Force -EA SilentlyContinue |
    Where-Object { $_.Extension -eq '.vhdx' } |
    Select-Object @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}, FullName |
    Sort-Object SizeGB -Descending | Format-Table -AutoSize -Wrap

Write-Host "`n=== Python installs (Programs) ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local\Programs\Python" -Directory -Force -EA SilentlyContinue |
    ForEach-Object {
        $s = (Get-ChildItem $_.FullName -Recurse -File -Force -EA SilentlyContinue | Measure-Object Length -Sum).Sum
        [PSCustomObject]@{ Folder=$_.Name; SizeGB=[math]::Round($s/1GB,2); LastWrite=$_.LastWriteTime }
    } | Sort-Object SizeGB -Descending | Format-Table -AutoSize

Write-Host "`n=== Cursor snapshots ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Roaming\Cursor\snapshots" -Force -EA SilentlyContinue |
    Select-Object Name, LastWriteTime, @{N='DaysOld';E={[int]((Get-Date) - $_.LastWriteTime).Days}} |
    Sort-Object LastWriteTime | Format-Table -AutoSize