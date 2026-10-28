# ==============================================================================
# One-Time Setup: Connect jraltd@outlook.com for Automatic Attachment Downloads
# ==============================================================================
$ErrorActionPreference = 'Stop'
$ClientId = "14d82eec-204b-4c2f-b7e8-296a70dab67e"
$TokenFilePath = "C:\Users\jralt\.cfm-outlook-token.dat"

$dcRes = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/consumers/oauth2/v2.0/devicecode" -Body @{
  client_id = $ClientId
  scope     = "offline_access https://graph.microsoft.com/Mail.Read"
}

Write-Host ""
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  CONNECT OUTLOOK FOR AUTOMATIC ATTACHMENT DOWNLOADS" -ForegroundColor Cyan
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host "  1. Open: https://www.microsoft.com/link" -ForegroundColor Yellow
Write-Host "  2. Enter code: $($dcRes.user_code)" -ForegroundColor Green
Write-Host "  3. Sign in with jraltd@outlook.com and click Accept." -ForegroundColor Yellow
Write-Host "==================================================================" -ForegroundColor Cyan
Write-Host ""

$interval = [Math]::Max([int]$dcRes.interval, 5)
$expiresAt = (Get-Date).AddSeconds([int]$dcRes.expires_in)

while ((Get-Date) -lt $expiresAt) {
  Start-Sleep -Seconds $interval
  try {
    $tokenRes = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/consumers/oauth2/v2.0/token" -Body @{
      grant_type  = "urn:ietf:params:oauth:grant-type:device_code"
      client_id   = $ClientId
      device_code = $dcRes.device_code
    } -ErrorAction Stop

    if ($tokenRes.refresh_token) {
      $sec = ConvertTo-SecureString $tokenRes.refresh_token -AsPlainText -Force
      ConvertFrom-SecureString $sec | Set-Content -Path $TokenFilePath -NoNewline
      Write-Host "SUCCESS! jraltd@outlook.com is now connected!" -ForegroundColor Green
      Write-Host "Running first automatic attachment check now..."
      & "e:\Software\cfm-Quote-Tool\sync-customers.ps1"
      exit 0
    }
  } catch {
    $errBody = $_.ErrorDetails.Message
    if ($errBody -and $errBody -notmatch 'authorization_pending') {
      Write-Host "Auth failed: $errBody" -ForegroundColor Red
      exit 1
    }
  }
}

Write-Host "Device code expired. Run connect-outlook.ps1 again to get a new code." -ForegroundColor Red
exit 1
