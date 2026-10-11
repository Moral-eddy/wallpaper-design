$ErrorActionPreference='Stop'
$sourceRoot=$PSScriptRoot
$buildPython=Join-Path $sourceRoot '.build-env/Scripts/python.exe'
$workerDigest=(Get-FileHash -LiteralPath (Join-Path $sourceRoot 'managed-awcc.ps1') -Algorithm SHA256).Hash.ToLowerInvariant()
[IO.File]::WriteAllText((Join-Path $sourceRoot 'worker_integrity.py'),("EXPECTED_WORKER_SHA256 = '"+$workerDigest+"'"+[char]10),[Text.UTF8Encoding]::new($false))
& $buildPython -m PyInstaller --onefile --windowed --noupx --name Mornye-Telemetry --paths $sourceRoot --add-data ((Join-Path $sourceRoot 'configure.html')+':.') --add-data ((Join-Path $sourceRoot 'managed-awcc.ps1')+':.') --distpath (Join-Path $sourceRoot 'dist') --workpath (Join-Path $sourceRoot 'build') --specpath (Join-Path $sourceRoot 'build') (Join-Path $sourceRoot 'launcher.py')
exit $LASTEXITCODE
