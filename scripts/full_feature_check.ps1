$ErrorActionPreference = "Stop"

$baseUrl = "http://localhost:3000"
$samplePath = "D:\the api tts host\khmer_voxcpm2_api_test.wav"

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [string]$Name,
    [string]$Status,
    [string]$Detail
  )
  $results.Add([pscustomobject]@{
      name = $Name
      status = $Status
      detail = $Detail
    })
}

function Invoke-SafeWebRequest {
  param(
    [Parameter(Mandatory = $true)][string]$Uri,
    [ValidateSet("GET", "POST")][string]$Method = "GET",
    [string]$Body,
    [string]$ContentType,
    [hashtable]$Headers,
    [Microsoft.PowerShell.Commands.WebRequestSession]$WebSession,
    [switch]$Form,
    [hashtable]$FormBody
  )

  try {
    if ($Form) {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method $Method -Form $FormBody -WebSession $WebSession -Headers $Headers -TimeoutSec 900 -ErrorAction Stop
    }
    elseif ($Body -and $ContentType) {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method $Method -Body $Body -ContentType $ContentType -WebSession $WebSession -Headers $Headers -TimeoutSec 900 -ErrorAction Stop
    }
    else {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Uri -Method $Method -WebSession $WebSession -Headers $Headers -TimeoutSec 900 -ErrorAction Stop
    }

    return [pscustomobject]@{
      ok = $true
      status = [int]$response.StatusCode
      body = $response.Content
      raw = $response
    }
  }
  catch {
    $statusCode = -1
    $bodyText = ""
    if ($_.Exception.Response) {
      try {
        $statusCode = [int]$_.Exception.Response.StatusCode
      }
      catch {
        $statusCode = -1
      }
      try {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $bodyText = $reader.ReadToEnd()
        $reader.Close()
      }
      catch {
        $bodyText = ""
      }
    }
    return [pscustomobject]@{
      ok = $false
      status = $statusCode
      body = $bodyText
      raw = $null
    }
  }
}

# Basic public routes
$publicRoutes = @("/", "/app/signin", "/app/signup")
foreach ($route in $publicRoutes) {
  $resp = Invoke-SafeWebRequest -Uri ($baseUrl + $route)
  if ($resp.status -eq 200) {
    Add-Result "Route $route" "PASS" "HTTP 200"
  }
  else {
    Add-Result "Route $route" "FAIL" "HTTP $($resp.status)"
  }
}

# Auth flow
$email = "qa" + [guid]::NewGuid().ToString("N").Substring(0, 8) + "@example.com"
$password = "Pass12345"
$session = New-Object Microsoft.PowerShell.Commands.WebRequestSession

$signupPayload = @{ email = $email; password = $password } | ConvertTo-Json
$signup = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/auth/signup") -Method "POST" -Body $signupPayload -ContentType "application/json" -WebSession $session
if ($signup.status -eq 200) {
  Add-Result "Signup API" "PASS" "Account created ($email)"
}
else {
  Add-Result "Signup API" "FAIL" "HTTP $($signup.status) $($signup.body)"
}

$me = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/me") -Method "GET" -WebSession $session
if ($me.status -eq 200 -and $me.body -match '"tokenBalance"\s*:\s*100') {
  Add-Result "Session /api/me after signup" "PASS" "Authenticated with 100 tokens"
}
else {
  Add-Result "Session /api/me after signup" "FAIL" "HTTP $($me.status) $($me.body)"
}

$protectedRoutes = @(
  "/app/dashboard",
  "/app/dashboard/voice-cloning",
  "/app/dashboard/history",
  "/app/dashboard/api",
  "/app/dashboard/billing",
  "/app/dashboard/settings"
)
foreach ($route in $protectedRoutes) {
  $resp = Invoke-SafeWebRequest -Uri ($baseUrl + $route) -WebSession $session
  if ($resp.status -eq 200) {
    Add-Result "Protected route $route" "PASS" "HTTP 200"
  }
  else {
    Add-Result "Protected route $route" "FAIL" "HTTP $($resp.status)"
  }
}

$signout = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/auth/signout") -Method "POST" -WebSession $session
if ($signout.status -eq 200) {
  Add-Result "Signout API" "PASS" "HTTP 200"
}
else {
  Add-Result "Signout API" "FAIL" "HTTP $($signout.status)"
}

$meAfterSignout = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/me") -WebSession $session
if ($meAfterSignout.status -eq 401) {
  Add-Result "Session cleared after signout" "PASS" "HTTP 401"
}
else {
  Add-Result "Session cleared after signout" "FAIL" "HTTP $($meAfterSignout.status)"
}

$signinPayload = @{ email = $email; password = $password } | ConvertTo-Json
$signin = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/auth/signin") -Method "POST" -Body $signinPayload -ContentType "application/json" -WebSession $session
if ($signin.status -eq 200) {
  Add-Result "Signin API" "PASS" "HTTP 200"
}
else {
  Add-Result "Signin API" "FAIL" "HTTP $($signin.status) $($signin.body)"
}

$adminSession = $null
$adminEmail = $env:SMOKE_ADMIN_EMAIL
$adminPassword = $env:SMOKE_ADMIN_PASSWORD
if ($adminEmail -and $adminPassword) {
  $adminSession = New-Object Microsoft.PowerShell.Commands.WebRequestSession
  $adminSigninPayload = @{ email = $adminEmail; password = $adminPassword } | ConvertTo-Json
  $adminSignin = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/auth/signin") -Method "POST" -Body $adminSigninPayload -ContentType "application/json" -WebSession $adminSession
  if ($adminSignin.status -eq 200) {
    $adminMe = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/me") -Method "GET" -WebSession $adminSession
    if ($adminMe.status -eq 200 -and $adminMe.body -match '"isAdmin"\s*:\s*true') {
      Add-Result "Admin signin" "PASS" "Admin credentials accepted"
    }
    else {
      Add-Result "Admin signin" "FAIL" "Signed in account is not admin"
      $adminSession = $null
    }
  }
  else {
    Add-Result "Admin signin" "FAIL" "HTTP $($adminSignin.status) $($adminSignin.body)"
    $adminSession = $null
  }
}
else {
  Add-Result "Admin signin" "WARN" "Set SMOKE_ADMIN_EMAIL and SMOKE_ADMIN_PASSWORD to test admin approval"
}

# Payment order and admin approval flow
$paymentOrderPayload = @{ planId = "starter"; quantity = 2; userNote = "qa telegram ref" } | ConvertTo-Json
$paymentOrderResp = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/payments/orders") -Method "POST" -Body $paymentOrderPayload -ContentType "application/json" -WebSession $session
$paymentOrder = $null
if ($paymentOrderResp.status -eq 200) {
  try {
    $paymentOrder = ($paymentOrderResp.body | ConvertFrom-Json).order
  }
  catch {
    $paymentOrder = $null
  }
}

if ($paymentOrder -and $paymentOrder.status -eq "pending" -and $paymentOrder.tokens -eq 2000) {
  Add-Result "Create payment order" "PASS" "Pending order for 2,000 tokens"
}
else {
  Add-Result "Create payment order" "FAIL" "HTTP $($paymentOrderResp.status) $($paymentOrderResp.body)"
}

if ($adminSession) {
  $adminPayments = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/admin/payments?status=pending") -WebSession $adminSession
  if ($adminPayments.status -eq 200 -and $adminPayments.body -match "pending") {
    Add-Result "Admin list pending payments" "PASS" "Pending payments visible"
  }
  else {
    Add-Result "Admin list pending payments" "FAIL" "HTTP $($adminPayments.status) $($adminPayments.body)"
  }
}
else {
  Add-Result "Admin list pending payments" "WARN" "Skipped because admin credentials were not supplied"
}

if ($paymentOrder -and $adminSession) {
  $approvalPayload = @{ adminNote = "qa approved" } | ConvertTo-Json
  $approvePayment = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/admin/payments/$($paymentOrder.id)/approve") -Method "POST" -Body $approvalPayload -ContentType "application/json" -WebSession $adminSession
  if ($approvePayment.status -eq 200 -and $approvePayment.body -match "approved") {
    Add-Result "Admin approve payment" "PASS" "Order approved and tokens credited"
  }
  else {
    Add-Result "Admin approve payment" "FAIL" "HTTP $($approvePayment.status) $($approvePayment.body)"
  }

  $adminCookie = $adminSession.Cookies.GetCookies($baseUrl)["kvx_session"].Value
  $doubleStatus = curl.exe -sS -o NUL -w "%{http_code}" -X POST ($baseUrl + "/api/admin/payments/$($paymentOrder.id)/approve") -H ("Cookie: kvx_session=" + $adminCookie) -H "Content-Type: application/json" -d '{}'
  if ([int]$doubleStatus -eq 409) {
    Add-Result "Prevent double approval" "PASS" "Second approval blocked"
  }
  else {
    Add-Result "Prevent double approval" "FAIL" "HTTP $doubleStatus"
  }
}
elseif ($paymentOrder) {
  Add-Result "Admin approve payment" "WARN" "Skipped because admin credentials were not supplied"
  Add-Result "Prevent double approval" "WARN" "Skipped because admin credentials were not supplied"
}

if ($adminSession) {
  $adminPageResp = Invoke-SafeWebRequest -Uri ($baseUrl + "/app/admin/payments") -WebSession $adminSession
  if ($adminPageResp.status -eq 200 -and ($adminPageResp.body -match "Admin Payments" -or $adminPageResp.body -match "payment orders")) {
    Add-Result "Admin payments page" "PASS" "Page renders"
  }
  else {
    Add-Result "Admin payments page" "FAIL" "HTTP $($adminPageResp.status)"
  }
}
else {
  Add-Result "Admin payments page" "WARN" "Skipped because admin credentials were not supplied"
}

# API key management
$keysInitial = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/keys") -WebSession $session
if ($keysInitial.status -eq 200) {
  Add-Result "List API keys" "PASS" "HTTP 200"
}
else {
  Add-Result "List API keys" "FAIL" "HTTP $($keysInitial.status)"
}

$createKeyPayload = @{ name = "QA Key" } | ConvertTo-Json
$createdKeyResp = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/keys") -Method "POST" -Body $createKeyPayload -ContentType "application/json" -WebSession $session
$createdKey = $null
if ($createdKeyResp.status -eq 200) {
  try {
    $createdKey = $createdKeyResp.body | ConvertFrom-Json
  }
  catch {
    $createdKey = $null
  }
}

if ($createdKey -and $createdKey.rawKey -and $createdKey.key.id) {
  Add-Result "Create API key" "PASS" "Created key id=$($createdKey.key.id)"
}
else {
  Add-Result "Create API key" "FAIL" "HTTP $($createdKeyResp.status) $($createdKeyResp.body)"
}

if ($createdKey -and $createdKey.key.id) {
  $revokeResp = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/keys/$($createdKey.key.id)/revoke") -Method "POST" -WebSession $session
  if ($revokeResp.status -eq 200) {
    Add-Result "Revoke API key" "PASS" "HTTP 200"
  }
  else {
    Add-Result "Revoke API key" "FAIL" "HTTP $($revokeResp.status)"
  }
}

# Public API auth checks
$noAuthSpeechReq = @{ input = "test"; voice = "natural Khmer speech"; model = "voxcpm2" } | ConvertTo-Json
$speechNoAuth = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/v1/audio/speech") -Method "POST" -Body $noAuthSpeechReq -ContentType "application/json"
if ($speechNoAuth.status -eq 401) {
  Add-Result "Public speech API without token" "PASS" "HTTP 401"
}
else {
  Add-Result "Public speech API without token" "FAIL" "HTTP $($speechNoAuth.status)"
}

$speechInvalidKey = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/v1/audio/speech") -Method "POST" -Body $noAuthSpeechReq -ContentType "application/json" -Headers @{ Authorization = "Bearer invalid_test_key" }
if ($speechInvalidKey.status -eq 403) {
  Add-Result "Public speech API with invalid token" "PASS" "HTTP 403"
}
else {
  Add-Result "Public speech API with invalid token" "FAIL" "HTTP $($speechInvalidKey.status)"
}

# Real generation checks
$dashboardTtsReq = @{ text = "hello dashboard tts test"; voice = "natural Khmer speech"; model = "voxcpm2" } | ConvertTo-Json
$dashboardTtsResp = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/generate") -Method "POST" -Body $dashboardTtsReq -ContentType "application/json" -WebSession $session
if ($dashboardTtsResp.status -eq 200) {
  Add-Result "Dashboard TTS generate" "PASS" "Generation success"
}
elseif ($dashboardTtsResp.status -in @(502, 503)) {
  Add-Result "Dashboard TTS generate" "WARN" "Upstream unavailable/auth failed: HTTP $($dashboardTtsResp.status)"
}
else {
  Add-Result "Dashboard TTS generate" "FAIL" "HTTP $($dashboardTtsResp.status) $($dashboardTtsResp.body)"
}

if (Test-Path $samplePath) {
  $cookieValue = $session.Cookies.GetCookies($baseUrl)["kvx_session"].Value
  $tmpCloneBody = Join-Path $env:TEMP ("clone_check_" + [guid]::NewGuid().ToString("N") + ".txt")
  $cloneStatus = curl.exe -sS -o "$tmpCloneBody" -w "%{http_code}" -X POST ($baseUrl + "/api/generate-clone") -H ("Cookie: kvx_session=" + $cookieValue) -F "text=hello clone test" -F "voice=same speaker as the reference audio, natural Khmer speech" -F "model=voxcpm2" -F "voice_consent=true" -F ("sample=@" + $samplePath)
  $cloneBody = ""
  if (Test-Path $tmpCloneBody) {
    $cloneBody = Get-Content -Raw "$tmpCloneBody"
    Remove-Item "$tmpCloneBody" -Force
  }

  if ($cloneStatus -eq 200) {
    Add-Result "Dashboard clone generate" "PASS" "Clone generation success"
  }
  elseif ($cloneStatus -in @(502, 503)) {
    Add-Result "Dashboard clone generate" "WARN" "Upstream unavailable/auth failed: HTTP $cloneStatus"
  }
  else {
    Add-Result "Dashboard clone generate" "FAIL" "HTTP $cloneStatus $cloneBody"
  }
}
else {
  Add-Result "Dashboard clone generate" "WARN" "Sample audio not found at $samplePath"
}

# API key generation check (new key, not revoked)
$activeKeyPayload = @{ name = "QA Active Key" } | ConvertTo-Json
$activeKeyResp = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/keys") -Method "POST" -Body $activeKeyPayload -ContentType "application/json" -WebSession $session
$activeKey = $null
if ($activeKeyResp.status -eq 200) {
  try {
    $activeKey = $activeKeyResp.body | ConvertFrom-Json
  }
  catch {
    $activeKey = $null
  }
}

if ($activeKey -and $activeKey.rawKey) {
  $publicSpeechWithKey = Invoke-SafeWebRequest -Uri ($baseUrl + "/api/v1/audio/speech") -Method "POST" -Body $noAuthSpeechReq -ContentType "application/json" -Headers @{ Authorization = "Bearer $($activeKey.rawKey)" }
  if ($publicSpeechWithKey.status -eq 200) {
    Add-Result "Public speech API with valid token" "PASS" "Audio generated"
  }
  elseif ($publicSpeechWithKey.status -in @(502, 503)) {
    Add-Result "Public speech API with valid token" "WARN" "Upstream unavailable/auth failed: HTTP $($publicSpeechWithKey.status)"
  }
  else {
    Add-Result "Public speech API with valid token" "FAIL" "HTTP $($publicSpeechWithKey.status) $($publicSpeechWithKey.body)"
  }
}
else {
  Add-Result "Public speech API with valid token" "FAIL" "Could not create active API key"
}

# Logs and dashboard data checks
$historyPage = Invoke-SafeWebRequest -Uri ($baseUrl + "/app/dashboard/history") -WebSession $session
if ($historyPage.status -eq 200 -and ($historyPage.body -match "Recent Generations" -or $historyPage.body -match "Generation History")) {
  if ($historyPage.body -match "failed|success") {
    Add-Result "History records update" "PASS" "Generation rows found"
  }
  else {
    Add-Result "History records update" "WARN" "No generation rows yet"
  }
}
else {
  Add-Result "History records update" "FAIL" "History page unavailable"
}

$apiPage = Invoke-SafeWebRequest -Uri ($baseUrl + "/app/dashboard/api") -WebSession $session
if ($apiPage.status -eq 200 -and ($apiPage.body -match "Request Logs" -or $apiPage.body -match "API KEYS")) {
  if ($apiPage.body -match "failed|success|No API requests yet") {
    Add-Result "API request logs view" "PASS" "Request log section renders"
  }
  else {
    Add-Result "API request logs view" "WARN" "Unexpected log content"
  }
}
else {
  Add-Result "API request logs view" "FAIL" "API page unavailable"
}

# Summary
[int]$passCount = ($results | Where-Object { $_.status -eq "PASS" }).Count
[int]$warnCount = ($results | Where-Object { $_.status -eq "WARN" }).Count
[int]$failCount = ($results | Where-Object { $_.status -eq "FAIL" }).Count

Write-Output ""
Write-Output "=== FEATURE CHECK SUMMARY ==="
Write-Output "PASS: $passCount"
Write-Output "WARN: $warnCount"
Write-Output "FAIL: $failCount"
Write-Output ""

$results | ForEach-Object {
  Write-Output ("[{0}] {1} - {2}" -f $_.status, $_.name, $_.detail)
}
