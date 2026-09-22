$ErrorActionPreference = 'SilentlyContinue'
$vhdx = "C:\Users\Asus TUF F15\AppData\Local\Docker\wsl\disk\docker_data.vhdx"

Write-Host "=== Target ===" -ForegroundColor Cyan
if (Test-Path $vhdx) {
    $f = Get-Item $vhdx -Force
    Write-Host "Path:      $($f.FullName)"
    Write-Host "Size:      $([math]::Round($f.Length/1GB,2)) GB"
    Write-Host "Modified:  $($f.LastWriteTime)"
} else {
    Write-Host "NOT FOUND: $vhdx" -ForegroundColor Red
    exit
}

Write-Host "`n=== Is Docker / WSL holding the file? ===" -ForegroundColor Cyan
$dockerProcs = Get-Process -Name "Docker Desktop","com.docker.backend","com.docker.service","dockerd","vpnkit" -EA SilentlyContinue
if ($dockerProcs) {
    Write-Host "Docker processes RUNNING:" -ForegroundColor Yellow
    $dockerProcs | Select-Object Name, Id | Format-Table -AutoSize
} else {
    Write-Host "No Docker processes running." -ForegroundColor Green
}

Write-Host "`n=== WSL distros ===" -ForegroundColor Cyan
$wsl = wsl -l -v 2>&1
Write-Host $wsl

Write-Host "`n=== Try to open file exclusively (lock test) ===" -ForegroundColor Cyan
try {
    $fs = [System.IO.File]::Open($vhdx, 'Open', 'ReadWrite', 'None')
    $fs.Close()
    Write-Host "File is NOT locked - safe to delete." -ForegroundColor Green
} catch {
    Write-Host "File IS LOCKED - Docker/WSL must be stopped first." -ForegroundColor Yellow
    Write-Host $_.Exception.Message
}

Write-Host "`n=== Free space BEFORE ===" -ForegroundColor Cyan
Get-PSDrive C | Select-Object @{N='UsedGB';E={[math]::Round($_.Used/1GB,2)}}, @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize
