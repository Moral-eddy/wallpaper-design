param(
    [ValidateSet('install', 'uninstall')][string]$Action = 'install',
    [Parameter(Mandatory = $true)][string]$PythonPath,
    [string]$LegacyCommand = ''
)
$ErrorActionPreference = 'Stop'
# UTF-8 BOM supports Windows PowerShell 5.1.
$collectorRoot = (Resolve-Path -LiteralPath $PSScriptRoot).Path
$pythonExecutable = (Resolve-Path -LiteralPath $PythonPath).Path
$collectorHost = Join-Path $collectorRoot 'runtime-host.py'
$taskArguments = '-X utf8 "' + $collectorHost + '"'
$rootHasher = [Security.Cryptography.SHA256]::Create()
try { $rootHash = [BitConverter]::ToString($rootHasher.ComputeHash([Text.Encoding]::UTF8.GetBytes($collectorRoot.ToLowerInvariant()))).Replace('-', '').ToLowerInvariant() }
finally { $rootHasher.Dispose() }
$taskName = 'MornyeWallpaper-Telemetry-' + $rootHash.Substring(0, 16)
$userSid = [Security.Principal.WindowsIdentity]::GetCurrent().User.Value
$recordsRoot = Join-Path $collectorRoot 'records'
$backupRoot = Join-Path $recordsRoot ('telemetry-task-backups/' + (Get-Date -Format 'yyyyMMdd-HHmmss-ffff'))
New-Item -ItemType Directory -Path $backupRoot -Force | Out-Null
$utf8 = [Text.UTF8Encoding]::new($false)
$service = New-Object -ComObject 'Schedule.Service'
$service.Connect()
$taskFolder = $service.GetFolder('\')
$existing = $null
try { $existing = $taskFolder.GetTask($taskName) }
catch {
    $taskError = $_.Exception
    while ($null -ne $taskError.InnerException) { $taskError = $taskError.InnerException }
    if ($taskError.HResult -ne -2147024894) { throw }
}
if ($null -ne $existing) {
    $existingAction = $existing.Definition.Actions.Item(1)
    if ($existing.Definition.Actions.Count -ne 1 -or $existingAction.Arguments -cne $taskArguments -or $existing.Definition.Principal.UserId -ne $userSid) {
        throw '同名任务不属于当前采集器，未修改。'
    }
    [IO.File]::WriteAllText((Join-Path $backupRoot 'previous-task.xml'), $existing.Xml, $utf8)
}
$runKey = [Microsoft.Win32.Registry]::CurrentUser.OpenSubKey('Software\Microsoft\Windows\CurrentVersion\Run', $true)
$legacyValue = $null
try {
    if ($null -ne $runKey) { $legacyValue = $runKey.GetValue('MornyeWallpaperTelemetry', $null) }
    # Only migrate the exact legacy command supplied by startup.py for this root.
    if ($null -ne $legacyValue -and ($LegacyCommand -eq '' -or $legacyValue -cne $LegacyCommand)) {
        throw '旧登录启动项属于其他采集器安装，未修改。'
    }
    $before = [ordered]@{capturedAt=[DateTimeOffset]::Now.ToString('o');taskName=$taskName;legacyRunValue=$legacyValue;hadTask=($null -ne $existing)}
    [IO.File]::WriteAllText((Join-Path $backupRoot 'startup-before.json'), ($before | ConvertTo-Json -Depth 4), $utf8)
    $oldStartupPath = Join-Path $recordsRoot 'collector-startup.json'
    if (Test-Path -LiteralPath $oldStartupPath) { Copy-Item -LiteralPath $oldStartupPath -Destination (Join-Path $backupRoot 'collector-startup-before.json') }
    if ($Action -eq 'uninstall') {
        if ($null -ne $existing) { $existing.Stop(0); $taskFolder.DeleteTask($taskName, 0) }
        if ($null -ne $legacyValue) { $runKey.DeleteValue('MornyeWallpaperTelemetry', $false) }
        $state = [ordered]@{installed=$false;uninstalledAt=[DateTimeOffset]::Now.ToString('o');taskName=$taskName;backup=$backupRoot}
    }
    else {
        $definition = $service.NewTask(0)
        $definition.RegistrationInfo.Description = 'Mornye local telemetry: current-user collector host with independent restart. Root: ' + $collectorRoot
        $definition.Principal.UserId = $userSid
        $definition.Principal.LogonType = 3 # InteractiveToken; no password stored.
        $definition.Principal.RunLevel = 0 # LeastPrivilege; hardware admin task remains separate.
        $settings = $definition.Settings
        $settings.Enabled = $true
        $settings.Hidden = $false
        $settings.ExecutionTimeLimit = 'PT0S'
        $settings.MultipleInstances = 2 # IgnoreNew; never stop a running host to re-trigger it.
        $settings.DisallowStartIfOnBatteries = $false
        $settings.StopIfGoingOnBatteries = $false
        $settings.RunOnlyIfIdle = $false
        $settings.IdleSettings.StopOnIdleEnd = $false
        $settings.RunOnlyIfNetworkAvailable = $false
        $settings.StartWhenAvailable = $true
        $settings.AllowDemandStart = $true
        $settings.WakeToRun = $false
        $settings.RestartInterval = 'PT1M'
        $settings.RestartCount = 3
        $logon = $definition.Triggers.Create(9)
        $logon.UserId = $userSid
        $logon.Delay = 'PT15S'
        $logon.Enabled = $true
        $periodic = $definition.Triggers.Create(1)
        $periodic.StartBoundary = (Get-Date).AddMinutes(1).ToString('s')
        $periodic.Enabled = $true
        $periodic.Repetition.Interval = 'PT1M'
        # Omitted Duration means ongoing repetition. It never stops the host.
        $periodic.Repetition.StopAtDurationEnd = $false
        $execution = $definition.Actions.Create(0)
        $execution.Path = $pythonExecutable
        $execution.Arguments = $taskArguments
        $execution.WorkingDirectory = $collectorRoot
        $registered = $taskFolder.RegisterTaskDefinition($taskName, $definition, 6, $userSid, $null, 3)
        [IO.File]::WriteAllText((Join-Path $backupRoot 'installed-task.xml'), $registered.Xml, $utf8)
        # Registration completes before the old login entry is removed.
        if ($null -ne $legacyValue) { $runKey.DeleteValue('MornyeWallpaperTelemetry', $false) }
        $running = $registered.Run($null)
        $state = [ordered]@{installed=$true;installedAt=[DateTimeOffset]::Now.ToString('o');
            scope='current-user interactive Windows task';taskName=$taskName;
            executable=$pythonExecutable;arguments=$taskArguments;workingDirectory=$collectorRoot;
            logonDelaySeconds=15;repeatMinutes=1;multipleInstances='IgnoreNew';executionTimeLimit='PT0S';
            stopIfGoingOnBatteries=$false;restartIntervalMinutes=1;restartCount=3;
            legacyRunEntryMigrated=($null -ne $legacyValue);backup=$backupRoot;
            url='http://127.0.0.1:64582/configure.html';review='待用户人眼检验；未运行自动测试'}
    }
    $stateText = $state | ConvertTo-Json -Depth 6
    [IO.File]::WriteAllText((Join-Path $recordsRoot 'collector-startup.json'), $stateText, $utf8)
    $stateText
}
finally { if ($null -ne $runKey) { $runKey.Dispose() } }
