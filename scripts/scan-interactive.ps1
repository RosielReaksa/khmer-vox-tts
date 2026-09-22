# Scan C: drive and output list of cleanable items
$ErrorActionPreference = 'SilentlyContinue'

function Get-FolderSize($path) {
    $size = (Get-ChildItem -Path $path -Recurse -File -Force -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum
    return [math]::Round($size / 1GB, 2)
}

$user = "C:\Users\Asus TUF F15"
$areas = @(
    @{ Path="$user\AppData\Local\Temp"; Title="User Temp Files" },
    @{ Path="$user\AppData\Local\npm-cache"; Title="npm Cache" },
    @{ Path="$user\AppData\Local\pnpm"; Title="pnpm Store" },
    @{ Path="$user\AppData\Local\NuGet"; Title="NuGet Cache" },
    @{ Path="$user\AppData\Local\Docker"; Title="Docker Data" },
    @{ Path="$user\AppData\Local\Google\Chrome\User Data\Default\Cache"; Title="Chrome Cache" },
    @{ Path="$user\AppData\Local\Google\Chrome\User Data\Default\Code Cache"; Title="Chrome Code Cache" },
    @{ Path="$user\AppData\Local\Google\Chrome\User Data\Default\GPUCache"; Title="Chrome GPU Cache" },
    @{ Path="$user\AppData\Local\Microsoft\Windows\INetCache"; Title="Windows INet Cache" },
    @{ Path="$user\AppData\Local\Microsoft\Windows\Explorer"; Title="Windows Explorer Cache" },
    @{ Path="C:\Windows\Temp"; Title="Windows Temp" },
    @{ Path="C:\Windows\SoftwareDistribution\Download"; Title="Windows Update Download Cache" },
    @{ Path="C:\$Recycle.Bin"; Title="Recycle Bin" },
    @{ Path="$user\AppData\Local\hermes"; Title="Hermes (unknown)" },
    @{ Path="$user\.cache"; Title="User .cache folder" },
    @{ Path="$user\.ollama\models"; Title="Ollama Models" }
)

$scanResults = @()
foreach ($area in $areas) {
    if (Test-Path $area.Path) {
        $size = Get-FolderSize $area.Path
        if ($size -gt 0.01) {  # Only show items > 10MB
            $scanResults += @{ Path=$area.Path; SizeGB=$size; Title=$area.Title }
        }
    }
}

# Sort by size descending
$scanResults = $scanResults | Sort-Object { $_.SizeGB } -Descending

# Output as structured data
Write-Host "SCAN_RESULTS_START" -ForegroundColor Green
Write-Host "Total cleanable: $([math]::Round(($scanResults | Measure-Object -Property SizeGB -Sum).Sum, 2)) GB" -ForegroundColor Yellow
Write-Host ""

$i = 1
foreach ($item in $scanResults) {
    Write-Host ("{0}. {1} - {2} GB" -f $i, $item.Title, $item.SizeGB) -ForegroundColor White
    Write-Host ("   Path: {0}" -f $item.Path) -ForegroundColor DarkGray
    $i++
}
Write-Host "SCAN_RESULTS_END" -ForegroundColor Green