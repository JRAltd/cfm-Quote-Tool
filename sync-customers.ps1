# ==============================================================================
# CFM Quote Tool - Automated NetSuite Customer Sync Script
# ==============================================================================
# 1. Connects to jraltd@outlook.com via Microsoft Graph (if connected via
#    connect-outlook.ps1) and automatically downloads new NetSuite .csv
#    attachments into OneDrive\CFM-Customer-Sync.
# 2. Also scans Downloads, OneDrive\Attachments, OneDrive\CFM-Customer-Sync,
#    and e:\Software\cfm-Quote-Tool for any NetSuite .csv files.
# 3. Merges new/updated customers into customers.js, archives the CSV, and
#    pushes updates to GitHub automatically.
# ==============================================================================

$ErrorActionPreference = 'Stop'
$RepoDir = "e:\Software\cfm-Quote-Tool"
$CustomersJsPath = Join-Path $RepoDir "customers.js"
$OneDriveSyncDir = "C:\Users\jralt\OneDrive\CFM-Customer-Sync"
$DownloadsDir = "C:\Users\jralt\Downloads"
$ProcessedDir = Join-Path $OneDriveSyncDir "Processed"
$TokenFilePath = "C:\Users\jralt\.cfm-outlook-token.dat"
$ProcessedMsgIdsPath = Join-Path $ProcessedDir "processed-message-ids.txt"
$ClientId = "14d82eec-204b-4c2f-b7e8-296a70dab67e" # Official Microsoft Graph CLI Client ID

if (-not (Test-Path $OneDriveSyncDir)) {
  New-Item -ItemType Directory -Path $OneDriveSyncDir -Force | Out-Null
}
if (-not (Test-Path $ProcessedDir)) {
  New-Item -ItemType Directory -Path $ProcessedDir -Force | Out-Null
}

# ------------------------------------------------------------------------------
# Step 0: Auto-download new NetSuite CSV attachments from jraltd@outlook.com
# ------------------------------------------------------------------------------
if (Test-Path $TokenFilePath) {
  try {
    $encToken = Get-Content -Raw $TokenFilePath
    $secString = ConvertTo-SecureString $encToken.Trim()
    $bstr = [System.Runtime.InteropServices.Marshal]::SecureStringToBSTR($secString)
    $refreshToken = [System.Runtime.InteropServices.Marshal]::PtrToStringAuto($bstr)
    [System.Runtime.InteropServices.Marshal]::ZeroFreeBSTR($bstr)

    $tokenRes = Invoke-RestMethod -Method Post -Uri "https://login.microsoftonline.com/consumers/oauth2/v2.0/token" -Body @{
      client_id     = $ClientId
      grant_type    = "refresh_token"
      refresh_token = $refreshToken
      scope         = "offline_access https://graph.microsoft.com/Mail.Read"
    }

    if ($tokenRes.refresh_token) {
      $newSec = ConvertTo-SecureString $tokenRes.refresh_token -AsPlainText -Force
      ConvertFrom-SecureString $newSec | Set-Content -Path $TokenFilePath -NoNewline
    }

    $accessToken = $tokenRes.access_token
    $headers = @{ Authorization = "Bearer $accessToken" }

    $processedIds = @{}
    if (Test-Path $ProcessedMsgIdsPath) {
      Get-Content $ProcessedMsgIdsPath | ForEach-Object { if ($_.Trim()) { $processedIds[$_.Trim()] = $true } }
    }

    $msgsRes = Invoke-RestMethod -Method Get -Uri "https://graph.microsoft.com/v1.0/me/messages?`$top=20&`$select=id,subject,hasAttachments,receivedDateTime&`$orderby=receivedDateTime desc" -Headers $headers
    foreach ($msg in $msgsRes.value) {
      if (-not $msg.hasAttachments) { continue }
      if ($processedIds.ContainsKey($msg.id)) { continue }

      $attRes = Invoke-RestMethod -Method Get -Uri "https://graph.microsoft.com/v1.0/me/messages/$($msg.id)/attachments" -Headers $headers
      $foundNetSuiteCsv = $false
      foreach ($att in $attRes.value) {
        if ($att.name -match '\.csv$' -and $att.contentBytes) {
          $bytes = [System.Convert]::FromBase64String($att.contentBytes)
          $textPreview = [System.Text.Encoding]::UTF8.GetString($bytes, 0, [Math]::Min($bytes.Length, 500))
          if ($textPreview -match 'cfm Current Customer List' -or $textPreview -match 'cfm Distributors') {
            $outPath = Join-Path $OneDriveSyncDir ("outlook-" + (Get-Date -Format "yyyyMMdd-HHmmss") + "-" + $att.name)
            [System.IO.File]::WriteAllBytes($outPath, $bytes)
            Write-Host "Auto-downloaded NetSuite CSV attachment from Outlook: $($att.name) (Subject: $($msg.subject))"
            $foundNetSuiteCsv = $true
          }
        }
      }
      # Record message ID so we don't re-download attachments from this email again
      Add-Content -Path $ProcessedMsgIdsPath -Value $msg.id
      $processedIds[$msg.id] = $true
    }
  } catch {
    Write-Host "Outlook auto-check warning: $($_.Exception.Message)"
  }
}

$csvFiles = New-Object System.Collections.Generic.List[System.IO.FileInfo]

# 1. Check OneDrive\CFM-Customer-Sync and RepoDir
Get-ChildItem -Path $OneDriveSyncDir -Filter "*.csv" -File -ErrorAction SilentlyContinue | ForEach-Object { $csvFiles.Add($_) }
Get-ChildItem -Path $RepoDir -Filter "*.csv" -File -ErrorAction SilentlyContinue | ForEach-Object { $csvFiles.Add($_) }

# 2. Check Downloads and OneDrive attachment folders ONLY for NetSuite "cfm Current Customer List" CSVs
$watchFolders = @(
  $DownloadsDir,
  (Join-Path "C:\Users\jralt\OneDrive" "Attachments"),
  (Join-Path "C:\Users\jralt\OneDrive" "Email attachments")
)
foreach ($folder in $watchFolders) {
  if (Test-Path $folder) {
    Get-ChildItem -Path $folder -Filter "*.csv" -File -ErrorAction SilentlyContinue | ForEach-Object {
      try {
        $head = (Get-Content -Path $_.FullName -TotalCount 6 -ErrorAction Stop) -join "`n"
        if ($head -match 'cfm Current Customer List' -or $head -match 'cfm Distributors') {
          $csvFiles.Add($_)
        }
      } catch {}
    }
  }
}

if ($csvFiles.Count -eq 0) {
  Write-Host "No new NetSuite .csv files found."
  exit 0
}

# Load existing customers.js
$custText = Get-Content -Raw $CustomersJsPath
$jsonStr = $custText -replace '^[\s\S]*?const CUSTOMERS=', '' -replace ';\s*$', ''
$existing = $jsonStr | ConvertFrom-Json

$byAcct = @{}
$list = New-Object System.Collections.Generic.List[object]
foreach ($c in $existing) {
  $arr = [string[]]@([string]$c[0], [string]$c[1], [string]$c[2], [string]$c[3], [string]$c[4], [string]$c[5], [string]$c[6])
  $list.Add($arr)
  if ($arr[6]) {
    $byAcct[$arr[6].ToUpper()] = $arr
  }
}

$totalAdded = 0
$totalUpdated = 0

foreach ($file in $csvFiles) {
  Write-Host "Processing $($file.FullName)..."
  $csvRows = Import-Csv $file.FullName -Header @('Col0','Col1','Col2','Col3','Col4','Col5','Col6','Col7')

  # Detect header row if custom columns (like Phone / Primary Contact) were added
  $colCustomer = 0
  $colRep = 1
  $colContact = -1
  $colPhone = -1
  $colEmail = -1

  foreach ($row in $csvRows | Select-Object -First 15) {
    $vals = @($row.Col0, $row.Col1, $row.Col2, $row.Col3, $row.Col4, $row.Col5, $row.Col6, $row.Col7) | ForEach-Object { ([string]$_).Trim().ToLower() }
    if ($vals -contains 'customer' -or $vals -contains 'name') {
      for ($i = 0; $i -lt $vals.Count; $i++) {
        if ($vals[$i] -eq 'customer' -or $vals[$i] -eq 'name') { $colCustomer = $i }
        elseif ($vals[$i] -match 'sales rep|^rep$') { $colRep = $i }
        elseif ($vals[$i] -match 'contact') { $colContact = $i }
        elseif ($vals[$i] -match 'phone') { $colPhone = $i }
        elseif ($vals[$i] -match 'email|e-mail') { $colEmail = $i }
      }
      break
    }
  }

  foreach ($row in $csvRows) {
    $cols = @($row.Col0, $row.Col1, $row.Col2, $row.Col3, $row.Col4, $row.Col5, $row.Col6, $row.Col7)
    $custCol = ([string]$cols[$colCustomer]).Trim()
    if (-not $custCol -or $custCol -match '^(Customer|Name|Total\s*-|Total$|cfm\s|(January|February|March|April|May|June|July|August|September|October|November|December)\s+\d+)') {
      continue
    }

    if ($custCol -match '^([A-Z0-9]+(?::\d+)?)\s+(.+)$') {
      $acct = $matches[1].Trim()
      $name = $matches[2].Trim()
      $rep = if ($colRep -ge 0) { ([string]$cols[$colRep]).Trim() } else { "" }
      $contact = if ($colContact -ge 0) { ([string]$cols[$colContact]).Trim() } else { "" }
      $phone = if ($colPhone -ge 0) { ([string]$cols[$colPhone]).Trim() } else { "" }
      $email = if ($colEmail -ge 0) { ([string]$cols[$colEmail]).Trim() } else { "" }

      $key = $acct.ToUpper()
      if ($byAcct.ContainsKey($key)) {
        $entry = $byAcct[$key]
        $changed = $false
        if ($name -and $entry[0] -ne $name) { $entry[0] = $name; $changed = $true }
        if ($contact -and $entry[1] -ne $contact) { $entry[1] = $contact; $changed = $true }
        if ($phone -and $entry[2] -ne $phone) { $entry[2] = $phone; $changed = $true }
        if ($email -and $entry[3] -ne $email) { $entry[3] = $email; $changed = $true }
        if ($rep -and $entry[4] -ne $rep) { $entry[4] = $rep; $changed = $true }
        if ($changed) { $totalUpdated++ }
      } else {
        $repVal = if ($rep) { $rep } else { "Inside Sales" }
        $newEntry = [string[]]@($name, $contact, $phone, $email, $repVal, "CUSTOMER-Active", $acct)
        $list.Add($newEntry)
        $byAcct[$key] = $newEntry
        $totalAdded++
      }
    }
  }

  # Move processed file to Archive
  $stamp = Get-Date -Format "yyyyMMdd-HHmmss"
  $destPath = Join-Path $ProcessedDir "$($file.BaseName)-$stamp$($file.Extension)"
  Move-Item -Path $file.FullName -Destination $destPath -Force
  Write-Host "Archived CSV to $destPath"
}

if ($totalAdded -gt 0 -or $totalUpdated -gt 0) {
  Add-Type -AssemblyName System.Web.Extensions
  $serializer = New-Object System.Web.Script.Serialization.JavaScriptSerializer
  $rowStrings = New-Object System.Collections.Generic.List[string]
  foreach ($item in ($list | Sort-Object { $_[0].ToLower() })) {
    $rowStrings.Add($serializer.Serialize([string[]]$item))
  }
  $jsonOut = "[" + ($rowStrings -join ",") + "]"
  $header = "// Auto-generated from Customers690.csv`n// Fields: [Name, Primary Contact, Phone, Email, Sales Rep, Status, Account Number]`nconst CUSTOMERS="
  $fullContent = $header + $jsonOut + ";`n"
  [System.IO.File]::WriteAllText($CustomersJsPath, $fullContent, [System.Text.UTF8Encoding]::new($false))
  Write-Host "Updated customers.js (+$totalAdded new, $totalUpdated updated, $($rowStrings.Count) total)."

  # Auto-commit and push customers.js to GitHub
  Push-Location $RepoDir
  try {
    git add customers.js
    git commit -m "Auto-sync NetSuite customer list (+$totalAdded new, $totalUpdated updated)"
    git push origin main
    Write-Host "Pushed updated customers.js to GitHub!"
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Customer list is already up to date (0 new, 0 updated)."
}
