$ErrorActionPreference = 'SilentlyContinue'

function Scan-Folder($path, $title) {
    Write-Host "`n=== $title ($path) ===" -ForegroundColor Cyan
    Get-ChildItem -Path $path -Directory -Force | ForEach-Object {
        $folder = $_.FullName
        $size = (Get-ChildItem -Path $folder -Recurse -File -Force -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum).Sum
        [PSCustomObject]@{
            Folder = $folder.Replace($path, '.')
            SizeGB = [math]::Round($size / 1GB, 2)
        }
    } | Sort-Object SizeGB -Descending | Select-Object -First 20 | Format-Table -AutoSize
}

# Drill into C:\Users\<user>
$users = Get-ChildItem -Path 'C:\Users' -Directory -Force -ErrorAction SilentlyContinue
foreach ($u in $users) {
    $usize = (Get-ChildItem -Path $u.FullName -Recurse -File -Force -ErrorAction SilentlyContinue |
              Measure-Object -Property Length -Sum).Sum
    $gb = [math]::Round($usize / 1GB, 2)
    if ($gb -ge 1) {
        Write-Host "`n*** User folder: $($u.FullName) = $gb GB ***" -ForegroundColor Yellow
        Scan-Folder $u.FullName "Top folders inside $($u.Name)"
    }
}

# Windows cleanable areas
Scan-Folder 'C:\Windows\Temp' 'Windows Temp'
Scan-Folder 'C:\Windows\SoftwareDistribution' 'Windows Update cache'

# Current user temp + caches
$localAppData = $env:LOCALAPPDATA
Scan-Folder "$localAppData\Temp" 'User LocalAppData Temp'
Scan-Folder "$localAppData\npm-cache" 'npm-cache'
Scan-Folder "$localAppData\pnpm" 'pnpm store (LocalAppData)'
Scan-Folder "$localAppData\NuGet" 'NuGet cache'
Scan-Folder "$env:APPDATA\npm-cache" 'AppData npm-cache'

# Recycle bin total
$rb = (Get-ChildItem -Path 'C:\$Recycle.Bin' -Recurse -File -Force -ErrorAction SilentlyContinue |
       Measure-Object -Property Length -Sum).Sum
Write-Host "`nRecycle Bin total: $([math]::Round($rb/1GB,2)) GB" -ForegroundColor Cyan

# Hibernation / pagefile
Write-Host "`n=== Large system files in C:\ ===" -ForegroundColor Cyan
Get-ChildItem -Path 'C:\' -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 100MB } |
    Select-Object Name, @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}} |
    Sort-Object SizeGB -Descending | Format-Table -AutoSize
