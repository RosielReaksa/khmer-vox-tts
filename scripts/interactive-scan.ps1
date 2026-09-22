# Interactive C: drive scanner with safe deletion prompts
$ErrorActionPreference = 'SilentlyContinue'

function Get-FolderSize($path) {
    $size = (Get-ChildItem -Path $path -Recurse -File -Force -ErrorAction SilentlyContinue |
             Measure-Object -Property Length -Sum).Sum
    return [math]::Round($size / 1GB, 2)
}

function Show-Menu($items, $title) {
    Write-Host "`n=== $title ===" -ForegroundColor Cyan
    if ($items.Count -eq 0) {
        Write-Host "No items found." -ForegroundColor Gray
        return
    }
    $i = 1
    foreach ($item in $items) {
        Write-Host ("{0,3}. {1,6} GB  {2}" -f $i, $item.SizeGB, $item.Path) -ForegroundColor White
        $i++
    }
    Write-Host ""
    Write-Host "Options:" -ForegroundColor Yellow
    Write-Host "  Enter item numbers separated by spaces (e.g., 1 3 5) to DELETE those items" -ForegroundColor Gray
    Write-Host "  Press Enter to skip and continue" -ForegroundColor Gray
    Write-Host "  Type 'list' to see more details about an item" -ForegroundColor Gray
    Write-Host "  Type 'quit' to exit" -ForegroundColor Gray
    Write-Host ""
}

function Ask-ForDeletion($item) {
    Write-Host "`nDo you want to DELETE this item?" -ForegroundColor Yellow
    Write-Host "  Path: $($item.Path)" -ForegroundColor White
    Write-Host "  Size: $($item.SizeGB) GB" -ForegroundColor White
    $response = Read-Host "Type 'yes' to confirm deletion, anything else to skip"
    if ($response -eq 'yes') {
        return $true
    }
    return $false
}

function Safe-Delete($path) {
    if (Test-Path $path) {
        try {
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            Write-Host "  Deleted: $path" -ForegroundColor Green
            return $true
        } catch {
            Write-Host "  ERROR deleting: $path - $($_.Exception.Message)" -ForegroundColor Red
            return $false
        }
    } else {
        Write-Host "  Path does not exist: $path" -ForegroundColor Gray
        return $false
    }
}

# Main scanning
Write-Host "=== Interactive C: Drive Scanner ===" -ForegroundColor Green
Write-Host "This tool will scan your C: drive and help you safely clean up space." -ForegroundColor Gray
Write-Host "You will be asked before any deletion occurs." -ForegroundColor Gray
Write-Host ""

# Scan user profile areas
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
    @{ Path="C:\$Recycle.Bin"; Title="Recycle Bin" }
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

# Show summary
$totalSize = ($scanResults | Measure-Object -Property SizeGB -Sum).Sum
Write-Host "`n=== SCANNING COMPLETE ===" -ForegroundColor Green
Write-Host "Total cleanable space found: $([math]::Round($totalSize, 2)) GB" -ForegroundColor Yellow
Write-Host ""

# Interactive cleanup loop
foreach ($item in $scanResults) {
    Write-Host "`n--- $($item.Title) ---" -ForegroundColor Cyan
    Write-Host "Path: $($item.Path)" -ForegroundColor DarkGray
    Write-Host "Size: $($item.SizeGB) GB" -ForegroundColor White
    
    $response = Read-Host "Do you want to delete this? (yes/no/details)"
    
    switch ($response.ToLower()) {
        "yes" {
            if (Safe-Delete $item.Path) {
                Write-Host "Space freed: $($item.SizeGB) GB" -ForegroundColor Green
            }
        }
        "details" {
            Write-Host "`nContents of $($item.Path):" -ForegroundColor Gray
            Get-ChildItem $item.Path -Force -ErrorAction SilentlyContinue | 
                Select-Object -First 10 Name, @{N='SizeMB';E={[math]::Round($_.Length/1MB,2)}} |
                Format-Table -AutoSize
            $confirm = Read-Host "Delete this folder? (yes/no)"
            if ($confirm -eq "yes") {
                Safe-Delete $item.Path
            }
        }
        default {
            Write-Host "Skipped." -ForegroundColor Gray
        }
    }
}

Write-Host "`n=== SCAN COMPLETE ===" -ForegroundColor Green
Write-Host "You can run this script again anytime." -ForegroundColor Gray
Write-Host "Remember to also check Docker images/containers and Windows Disk Cleanup." -ForegroundColor Gray