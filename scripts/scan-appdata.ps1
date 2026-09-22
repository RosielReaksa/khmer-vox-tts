$ErrorActionPreference = 'SilentlyContinue'

function Scan-Folder($path, $title, $top = 20) {
    Write-Host "`n=== $title ===" -ForegroundColor Cyan
    Write-Host "    $path" -ForegroundColor DarkGray
    Get-ChildItem -Path $path -Directory -Force -ErrorAction SilentlyContinue | ForEach-Object {
        $folder = $_.FullName
        $size = (Get-ChildItem -Path $folder -Recurse -File -Force -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{
            Folder = $_.Name
            SizeGB = [math]::Round($size / 1GB, 2)
        }
    } | Sort-Object SizeGB -Descending | Select-Object -First $top | Format-Table -AutoSize
}

$user = "C:\Users\Asus TUF F15"

Scan-Folder "$user\AppData\Local"  "AppData\Local (biggest)" 25
Scan-Folder "$user\AppData\Roaming" "AppData\Roaming" 25

# Also list single large files (>500MB) anywhere in AppData top 2 levels
Write-Host "`n=== Large single files (>500MB) directly under AppData\Local ===" -ForegroundColor Cyan
Get-ChildItem "$user\AppData\Local" -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 500MB } |
    Select-Object Name, @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}}, FullName |
    Sort-Object SizeGB -Descending | Format-Table -AutoSize
