$ErrorActionPreference = 'Stop'
$vhdx = "C:\Users\Asus TUF F15\AppData\Local\Docker\wsl\disk\docker_data.vhdx"

Write-Host "=== Lock check ===" -ForegroundColor Cyan
try {
    $fs = [System.IO.File]::Open($vhdx, 'Open', 'ReadWrite', 'None')
    $fs.Close()
    Write-Host "UNLOCKED - proceeding to delete." -ForegroundColor Green
} catch {
    Write-Host "STILL LOCKED:" -ForegroundColor Red
    Write-Host $_.Exception.Message
    exit 1
}

Write-Host "`n=== Free space BEFORE ===" -ForegroundColor Cyan
Get-PSDrive C | Select-Object @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize

Write-Host "Deleting $vhdx ..." -ForegroundColor Yellow
Remove-Item -LiteralPath $vhdx -Force -ErrorAction Stop
Write-Host "Deleted." -ForegroundColor Green

Write-Host "`n=== Verify gone ===" -ForegroundColor Cyan
if (Test-Path $vhdx) {
    Write-Host "STILL EXISTS - something recreated it." -ForegroundColor Red
} else {
    Write-Host "Confirmed deleted." -ForegroundColor Green
}

Write-Host "`n=== Free space AFTER ===" -ForegroundColor Cyan
Get-PSDrive C | Select-Object @{N='UsedGB';E={[math]::Round($_.Used/1GB,2)}}, @{N='FreeGB';E={[math]::Round($_.Free/1GB,2)}} | Format-Table -AutoSize
