param(
    [string]$WallpaperDirectory = (Join-Path $PSScriptRoot 'wallpaper'),
    [string]$SensorLog = (Join-Path $PSScriptRoot 'telemetry/sensor-input/HWiNFO.csv')
)
$ErrorActionPreference = 'Stop'
$telemetryRoot = Join-Path $PSScriptRoot 'telemetry'
$wallpaperRoot = (Resolve-Path -LiteralPath $WallpaperDirectory).Path
$sensorLogPath = [IO.Path]::GetFullPath($SensorLog)
$readAccessPath = Join-Path $telemetryRoot 'read-access.json'
$utf8 = New-Object Text.UTF8Encoding($false)
New-Item -ItemType Directory -Path (Join-Path $telemetryRoot 'records') -Force | Out-Null
New-Item -ItemType Directory -Path (Join-Path $telemetryRoot 'sensor-input') -Force | Out-Null
if (Test-Path -LiteralPath $readAccessPath) {
    $readKey = (Get-Content -LiteralPath $readAccessPath -Raw -Encoding UTF8 | ConvertFrom-Json).key
    if ([string]::IsNullOrWhiteSpace($readKey)) { throw 'Existing read-access.json has no key.' }
} else {
    $keyBytes = New-Object byte[] 32
    $rng = [Security.Cryptography.RandomNumberGenerator]::Create()
    try { $rng.GetBytes($keyBytes) } finally { $rng.Dispose() }
    $readKey = [Convert]::ToBase64String($keyBytes)
    [IO.File]::WriteAllText($readAccessPath, (@{key = $readKey} | ConvertTo-Json), $utf8)
}
$configuration = @{base = 'http://127.0.0.1:64582'; key = $readKey} | ConvertTo-Json -Compress
[IO.File]::WriteAllText((Join-Path $wallpaperRoot 'telemetry-config.local.js'), ('window.WALLPAPER_TELEMETRY = ' + $configuration + ';'), $utf8)
[IO.File]::WriteAllText((Join-Path $telemetryRoot 'local-machine.json'), (@{sensorLogPath = $sensorLogPath} | ConvertTo-Json), $utf8)
Write-Output 'Telemetry configuration created. Start telemetry/start-live.ps1, then reopen the wallpaper project.'
