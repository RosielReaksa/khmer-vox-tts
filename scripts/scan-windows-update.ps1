# Windows Update cache
$ErrorActionPreference = 'SilentlyContinue'
Write-Host "=== Windows Update cache ===" -ForegroundColor Cyan
$winsxs = (Get-ChildItem "C:\Windows\SoftwareDistribution\Download" -Recurse -File -Force -EA SilentlyContinue |
           Measure-Object -Property Length -Sum).Sum
Write-Host "Windows Update Download cache: $([math]::Round($winsxs/1GB,2)) GB" -ForegroundColor Yellow

Write-Host "`n=== DISM component store (WinSxS) - DO NOT DELETE ===" -ForegroundColor Cyan
$winsxs2 = (Get-ChildItem "C:\Windows\WinSxS" -Recurse -File -Force -EA SilentlyContinue |
           Measure-Object -Property Length -Sum).Sum
Write-Host "WinSxS size: $([math]::Round($winsxs2/1GB,2)) GB" -ForegroundColor Red

Write-Host "`n=== User AppData\Local\Programs total ===" -ForegroundColor Cyan
$user = "C:\Users\Asus TUF F15"
$programs = (Get-ChildItem "$user\AppData\Local\Programs" -Recurse -File -Force -EA SilentlyContinue |
           Measure-Object -Property Length -Sum).Sum
Write-Host "Total Programs folder: $([math]::Round($programs/1GB,2)) GB" -ForegroundColor Yellow