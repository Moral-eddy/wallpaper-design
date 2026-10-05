param([string]$PythonPath = '')
$ErrorActionPreference = 'Stop'
if ([string]::IsNullOrWhiteSpace($PythonPath)) {
    $localPython = Join-Path $PSScriptRoot '.venv/Scripts/python.exe'
    $PythonPath = if (Test-Path -LiteralPath $localPython) { $localPython } else { (Get-Command python -ErrorAction Stop).Source }
}
& $PythonPath -X utf8 (Join-Path $PSScriptRoot 'serve.py') --port 64582
exit $LASTEXITCODE
