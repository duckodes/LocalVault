$ErrorActionPreference = "Stop"

$registryPaths = @(
    "HKCU:\Software\Google\Chrome\NativeMessagingHosts\com.localvault.passwords",
    "HKCU:\Software\Microsoft\Edge\NativeMessagingHosts\com.localvault.passwords",
    "HKCU:\Software\BraveSoftware\Brave-Browser\NativeMessagingHosts\com.localvault.passwords",
    "HKCU:\Software\Mozilla\NativeMessagingHosts\com.localvault.passwords"
)
foreach ($registryPath in $registryPaths) {
    if (Test-Path -LiteralPath $registryPath) {
        Remove-Item -LiteralPath $registryPath -Recurse -Force
    }
}

$installDirectory = Join-Path $env:LOCALAPPDATA "LocalVault\BrowserBridge"
if (Test-Path -LiteralPath $installDirectory) {
    Remove-Item -LiteralPath $installDirectory -Recurse -Force
}

Write-Host "Native messaging bridge removed. Remove the extension separately from each browser."
