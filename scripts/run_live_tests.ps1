$ErrorActionPreference = "Stop"

$email = "live" + [guid]::NewGuid().ToString("N").Substring(0, 8) + "@example.com"
$password = "Pass12345"
$samplePath = "D:\the api tts host\khmer_voxcpm2_api_test.wav"

$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession
$signupBody = @{ email = $email; password = $password } | ConvertTo-Json
Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/auth/signup" -Method Post -Body $signupBody -ContentType "application/json" -WebSession $session | Out-Null

$before = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/me" -WebSession $session).Content
$cookie = $session.Cookies.GetCookies("http://localhost:3000")["kvx_session"].Value

$ttsReq = @{ text = "hello khmer dashboard test"; voice = "natural Khmer speech"; model = "voxcpm2" } | ConvertTo-Json
$ttsStatus = ""
$ttsBody = ""
try {
  $tts = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/generate" -Method Post -Body $ttsReq -ContentType "application/json" -WebSession $session -ErrorAction Stop
  $ttsStatus = $tts.StatusCode
  $ttsBody = $tts.Content
}
catch {
  $ttsStatus = $_.Exception.Response.StatusCode.value__
  if ($_.Exception.Response) {
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $ttsBody = $reader.ReadToEnd()
  }
}

$cloneTmp = Join-Path $env:TEMP ("clone_resp_" + [guid]::NewGuid().ToString("N") + ".txt")
$cloneStatus = curl.exe -sS -o "$cloneTmp" -w "%{http_code}" -X POST "http://localhost:3000/api/generate-clone" -H "Cookie: kvx_session=$cookie" -F "text=hello clone dashboard test" -F "voice=same speaker as the reference audio, natural Khmer speech" -F "model=voxcpm2" -F "sample=@$samplePath"
$cloneBody = Get-Content -Raw "$cloneTmp"
Remove-Item "$cloneTmp" -Force

$keyReq = @{ name = "Primary key" } | ConvertTo-Json
$keyResp = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/keys" -Method Post -Body $keyReq -ContentType "application/json" -WebSession $session
$rawKey = ($keyResp.Content | ConvertFrom-Json).rawKey

$apiReq = @{ input = "hello public api test"; voice = "natural Khmer speech"; model = "voxcpm2" } | ConvertTo-Json
$apiStatus = ""
$apiBody = ""
try {
  $api = Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/v1/audio/speech" -Method Post -Body $apiReq -ContentType "application/json" -Headers @{ Authorization = "Bearer $rawKey" } -ErrorAction Stop
  $apiStatus = $api.StatusCode
  $apiBody = "(audio bytes)"
}
catch {
  $apiStatus = $_.Exception.Response.StatusCode.value__
  if ($_.Exception.Response) {
    $reader2 = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $apiBody = $reader2.ReadToEnd()
  }
}

$after = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/api/me" -WebSession $session).Content
$historyHtml = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/app/dashboard/history" -WebSession $session).Content
$apiHtml = (Invoke-WebRequest -UseBasicParsing -Uri "http://localhost:3000/app/dashboard/api" -WebSession $session).Content

$historyUpdated = ($historyHtml -match "Recent Generations") -and (($historyHtml -match "failed") -or ($historyHtml -match "success"))
$apiLogsUpdated = ($apiHtml -match "Request Logs") -and (($apiHtml -match "failed") -or ($apiHtml -match "success"))

Write-Output "EMAIL=$email"
Write-Output "BEFORE=$before"
Write-Output "DASHBOARD_TTS_STATUS=$ttsStatus"
Write-Output "DASHBOARD_TTS_BODY=$ttsBody"
Write-Output "DASHBOARD_CLONE_STATUS=$cloneStatus"
Write-Output "DASHBOARD_CLONE_BODY=$cloneBody"
Write-Output "PUBLIC_API_STATUS=$apiStatus"
Write-Output "PUBLIC_API_BODY=$apiBody"
Write-Output "AFTER=$after"
Write-Output "HISTORY_UPDATED=$historyUpdated"
Write-Output "API_LOGS_UPDATED=$apiLogsUpdated"
