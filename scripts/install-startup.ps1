$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$nodePath = (Get-Command node -ErrorAction Stop).Source
if (-not (Test-Path -LiteralPath (Join-Path $projectRoot 'window-bounds.exe'))) {
    throw 'Run npm run setup before installing startup.'
}
$launcher = Join-Path $projectRoot 'run-helper.vbs'
$arguments = '//B //Nologo "' + $launcher + '" "' + $nodePath + '"'
$user = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name
$action = New-ScheduledTaskAction -Execute (Join-Path $env:WINDIR 'System32\wscript.exe') -Argument $arguments
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $user
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit ([TimeSpan]::Zero)
Register-ScheduledTask -TaskName 'KyleAxity Stream Overlays' -Action $action -Trigger $trigger -Principal $principal -Settings $settings -Description 'Local OBS keyboard, mouse and match overlays.' -Force | Out-Null
Start-ScheduledTask -TaskName 'KyleAxity Stream Overlays'
Write-Host 'Startup enabled. The helper runs independently at sign-in.'
