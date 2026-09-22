# Safe deletion of approved items - with logging
$ErrorActionPreference = 'SilentlyContinue'
$user = "C:\Users\Asus TUF F15"
$totalFreed = 0

function Delete-Item($path, $title) {
    if (Test-Path $path) {
        $size = (Get-ChildItem -Path $path -Recurse -File -Force -ErrorAction SilentlyContinue |
                 Measure-Object -Property Length -Sum).Sum
        $sizeGB = [math]::Round($size / 1GB, 2)
        Write-Host "`nDeleting: $title ($sizeGB GB)" -ForegroundColor Yellow
        Write-Host "Path: $path" -ForegroundColor DarkGray
        try {
            Remove-Item -Path $path -Recurse -Force -ErrorAction Stop
            Write-Host "  SUCCESS - Deleted" -ForegroundColor Green
            $script:totalFreed += $sizeGB
        } catch {
            Write-Host "  FAILED - $($_.Exception.Message)" -ForegroundColor Red
        }
    } else {
        Write-Host "`nSkipped: $title (path not found)" -ForegroundColor Gray
    }
}

Write-Host "=== SAFE DELETION OF APPROVED ITEMS ===" -ForegroundColor Green
Write-Host "Starting cleanup..." -ForegroundColor Gray

# 1. Windows Temp
Delete-Item "C:\Windows\Temp" "Windows Temp"

# 2. User Temp Files
Delete-Item "$user\AppData\Local\Temp" "User Temp Files"

# 3. npm Cache
Delete-Item "$user\AppData\Local\npm-cache" "npm Cache"

# 4. Chrome Cache
Delete-Item "$user\AppData\Local\Google\Chrome\User Data\Default\Cache" "Chrome Cache"

# 5. Chrome Code Cache
Delete-Item "$user\AppData\Local\Google\Chrome\User Data\Default\Code Cache" "Chrome Code Cache"

# 6. Hermes folder (user approved)
Delete-Item "$user\AppData\Local\hermes" "Hermes AI Agent"

# 7. .cache folder (user approved)
Delete-Item "$user\.cache" ".cache folder"

Write-Host "`n=== CLEANUP COMPLETE ===" -ForegroundColor Green
Write-Host "Total space freed: $([math]::Round($totalFreed, 2)) GB" -ForegroundColor Yellow

# Show new free space
$drive = Get-PSDrive C
$freeGB = [math]::Round($drive.Free / 1GB, 2)
$usedGB = [math]::Round($drive.Used / 1GB, 2)
Write-Host "`nNew C: drive status:" -ForegroundColor Cyan
Write-Host "  Used: $usedGB GB" -ForegroundColor White
Write-Host "  Free: $freeGB GB" -ForegroundColor Green