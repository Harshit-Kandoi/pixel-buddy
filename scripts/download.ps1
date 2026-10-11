# Pixel Buddy — download the latest Windows installer and verify its SHA-256 checksum.
# Usage (PowerShell):  irm https://raw.githubusercontent.com/Harshit-Kandoi/pixel-buddy/main/scripts/download.ps1 | iex
# Saves the installer to your Downloads folder. It does not run it.
& {
  $ErrorActionPreference = 'Stop'
  [Net.ServicePointManager]::SecurityProtocol = [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
  $repo = 'Harshit-Kandoi/pixel-buddy'
  $prefix = "https://github.com/$repo/releases/download/"
  $outDir = if ($env:PIXEL_BUDDY_OUT) { $env:PIXEL_BUDDY_OUT } else { Join-Path $env:USERPROFILE 'Downloads' }

  try {
    $release = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ 'User-Agent' = 'pixel-buddy-download' }
  } catch {
    Write-Host "No release is available yet. Check https://github.com/$repo/releases" -ForegroundColor Yellow
    return
  }

  $assets = @($release.assets | Where-Object { $_.state -eq 'uploaded' })
  $installer = @($assets | Where-Object { $_.name -match '^pixel-buddy-[\w.-]+-windows-x64\.exe$' })
  $sums = @($assets | Where-Object { $_.name -eq 'SHA256SUMS' })
  if ($installer.Count -ne 1 -or $sums.Count -ne 1) {
    Write-Host 'This release has no Windows installer or SHA256SUMS. Please check GitHub Releases.' -ForegroundColor Yellow
    return
  }
  $installer = $installer[0]; $sums = $sums[0]
  foreach ($url in @($installer.browser_download_url, $sums.browser_download_url)) {
    if (-not $url.StartsWith($prefix)) { throw 'Unexpected download URL in release.' }
  }

  $dest = Join-Path $outDir $installer.name
  if (Test-Path $dest) { Write-Host "Already downloaded: $dest" -ForegroundColor Green; return }

  $tmp = Join-Path ([IO.Path]::GetTempPath()) ("pixel-buddy-" + [Guid]::NewGuid())
  New-Item -ItemType Directory -Path $tmp | Out-Null
  try {
    Write-Host "Downloading $($installer.name) ($([math]::Round($installer.size / 1MB, 1)) MB)..."
    $ProgressPreference = 'SilentlyContinue' # the progress bar makes Invoke-WebRequest very slow on PowerShell 5
    Invoke-WebRequest $installer.browser_download_url -OutFile (Join-Path $tmp $installer.name) -UseBasicParsing
    Invoke-WebRequest $sums.browser_download_url -OutFile (Join-Path $tmp 'SHA256SUMS') -UseBasicParsing

    $expected = Get-Content (Join-Path $tmp 'SHA256SUMS') | ForEach-Object {
      $parts = -split $_
      if ($parts.Count -eq 2 -and $parts[1].TrimStart('*') -eq $installer.name) { $parts[0] }
    }
    $actual = (Get-FileHash (Join-Path $tmp $installer.name) -Algorithm SHA256).Hash
    if (@($expected).Count -ne 1 -or $actual -ne $expected.ToUpper()) {
      throw 'Checksum verification failed. The download was not saved.'
    }

    New-Item -ItemType Directory -Force -Path $outDir | Out-Null
    Move-Item (Join-Path $tmp $installer.name) $dest
    Write-Host "Verified and saved: $dest" -ForegroundColor Green
    Write-Host 'Double-click it to install. If SmartScreen appears, choose "More info" > "Run anyway".'
  } finally {
    Remove-Item $tmp -Recurse -Force -ErrorAction SilentlyContinue
  }
}
