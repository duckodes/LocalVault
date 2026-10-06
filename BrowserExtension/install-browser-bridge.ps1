$ErrorActionPreference = "Stop"

$hostSource = Join-Path $PSScriptRoot "Host\LocalVault.BrowserHost.exe"
if (-not (Test-Path -LiteralPath $hostSource -PathType Leaf)) {
    throw "Native host executable not found. Run build-release.cmd first."
}

$installDirectory = Join-Path $env:LOCALAPPDATA "LocalVault\BrowserBridge"
$hostPath = Join-Path $installDirectory "LocalVault.BrowserHost.exe"
New-Item -ItemType Directory -Path $installDirectory -Force | Out-Null
Copy-Item -LiteralPath $hostSource -Destination $hostPath -Force

$chromiumManifest = @{
    name = "com.localvault.passwords"
    description = "Local Password Vault native messaging bridge"
    path = $hostPath
    type = "stdio"
    allowed_origins = @("chrome-extension://jidoonkdkgheloijamjelhnlpoefcodo/")
} | ConvertTo-Json -Depth 4
$firefoxManifest = @{
    name = "com.localvault.passwords"
    description = "Local Password Vault native messaging bridge"
    path = $hostPath
    type = "stdio"
    allowed_extensions = @("password-vault@localvault.local")
} | ConvertTo-Json -Depth 4

$chromiumManifestPath = Join-Path $installDirectory "chromium-host.json"
$firefoxManifestPath = Join-Path $installDirectory "firefox-host.json"
[System.IO.File]::WriteAllText($chromiumManifestPath, $chromiumManifest, [System.Text.UTF8Encoding]::new($false))
[System.IO.File]::WriteAllText($firefoxManifestPath, $firefoxManifest, [System.Text.UTF8Encoding]::new($false))

$chromiumBrowsers = @(
    "Software\Google\Chrome\NativeMessagingHosts\com.localvault.passwords",
    "Software\Microsoft\Edge\NativeMessagingHosts\com.localvault.passwords",
    "Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.localvault.passwords"
)
foreach ($registryPath in $chromiumBrowsers) {
    New-Item -Path "HKCU:\$registryPath" -Force | Out-Null
    Set-Item -Path "HKCU:\$registryPath" -Value $chromiumManifestPath
}

$firefoxRegistryPath = "HKCU:\Software\Mozilla\NativeMessagingHosts\com.localvault.passwords"
New-Item -Path $firefoxRegistryPath -Force | Out-Null
Set-Item -Path $firefoxRegistryPath -Value $firefoxManifestPath

Write-Host ""
Write-Host "Native messaging bridge installed for Chrome, Edge, Brave, and Firefox."
Write-Host "Next, install the unpacked extension from:"
Write-Host "  Chromium: $(Join-Path $PSScriptRoot 'Chromium')"
Write-Host "  Firefox:  $(Join-Path $PSScriptRoot 'Firefox')"
Write-Host ""
Write-Host "Chrome/Edge/Brave: open the browser's extensions page, enable Developer mode, then choose Load unpacked."
Write-Host "Firefox: open about:debugging#/runtime/this-firefox and load the Firefox manifest as a temporary add-on."
Write-Host "Firefox temporary add-ons are removed when Firefox closes; permanent installation requires signing the add-on with Mozilla."
Write-Host "Automatic field suggestions require permission to read and change data on all HTTP/HTTPS websites."
