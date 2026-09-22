$ErrorActionPreference = 'SilentlyContinue'

Write-Host "=== Top-level folders on C:\ ===" -ForegroundColor Cyan
$results = Get-ChildItem -Path 'C:\' -Directory -Force | ForEach-Object {
    $folder = $_.FullName
    $size = (Get-ChildItem -Path $folder -Recurse -File -Force -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum
    [PSCustomObject]@{
        Folder = $folder
        SizeGB = [math]::Round($size / 1GB, 2)
    }
}
$results | Sort-Object SizeGB -Descending | Format-Table -AutoSize

Write-Host "`n=== Free space ===" -ForegroundColor Cyan
Get-PSDrive C | Select-Object Used, Free | Format-Table -AutoSize
