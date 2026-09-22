$ErrorActionPreference = 'SilentlyContinue'

function Scan-Folder($path, $title, $top = 15) {
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

# Programs (29.7 GB) - usually installed apps; list contents
Scan-Folder "$user\AppData\Local\Programs" "AppData\Local\Programs"

# Docker (27.7 GB) - data, images, WSL distros
Scan-Folder "$user\AppData\Local\Docker" "Docker"

# Google (16 GB) - Chrome cache/profiles
Scan-Folder "$user\AppData\Local\Google" "Google (Chrome)"

# Microsoft (4.27 GB)
Scan-Folder "$user\AppData\Local\Microsoft" "Microsoft"

# Cursor (12 GB Roaming) - check for big cache/workspace
Scan-Folder "$user\AppData\Roaming\Cursor" "Cursor (Roaming)"

# Drill deeper into Chrome cache specifically
Write-Host "`n=== Chrome profile caches (User Data) ===" -ForegroundColor Cyan
Scan-Folder "$user\AppData\Local\Google\Chrome\User Data" "Chrome User Data" 15

# Windows Update / DISM component store size (Windows\WinSxS is huge but do NOT delete)
$winsxs = (Get-ChildItem "C:\Windows\WinSxS" -Recurse -File -Force -ErrorAction SilentlyContinue |
           Measure-Object -Property Length -Sum).Sum
Write-Host "`nWinSxS (component store - DO NOT delete): $([math]::Round($winsxs/1GB,2)) GB" -ForegroundColor Yellow
