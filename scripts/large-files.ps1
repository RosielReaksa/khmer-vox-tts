Get-ChildItem -Path 'C:\' -File -Force -ErrorAction SilentlyContinue |
    Where-Object { $_.Length -gt 100MB } |
    Select-Object Name, @{N='SizeGB';E={[math]::Round($_.Length/1GB,2)}} |
    Sort-Object SizeGB -Descending |
    Format-Table -AutoSize