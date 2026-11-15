$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR 'Microsoft.NET\Framework64\v4.0.30319\csc.exe'
if (-not (Test-Path -LiteralPath $compiler)) {
    throw 'The .NET Framework C# compiler is required.'
}

$targets = @(
    @{ Source = 'window-bounds.cs'; Output = 'window-bounds.exe'; Extra = @() },
    @{ Source = 'raw-mouse.cs'; Output = 'raw-mouse-wheel.exe'; Extra = @('/r:System.Windows.Forms.dll') },
    @{ Source = 'desktop-overlay.cs'; Output = 'league-desktop-hud.exe'; Extra = @('/r:System.Windows.Forms.dll', '/r:System.Drawing.dll', '/r:System.Web.Extensions.dll') }
)
foreach ($target in $targets) {
    $sourcePath = Join-Path $projectRoot ('native\' + $target.Source)
    $outputPath = Join-Path $projectRoot $target.Output
    $references = $target.Extra
    & $compiler /nologo /target:exe @references "/out:$outputPath" $sourcePath
    if ($LASTEXITCODE -ne 0) { throw ('Build failed: ' + $target.Source) }
}

foreach ($name in @('game-settings', 'valorant-agent')) {
    $destination = Join-Path $projectRoot ($name + '.json')
    if (-not (Test-Path -LiteralPath $destination)) {
        Copy-Item -LiteralPath (Join-Path $projectRoot ($name + '.example.json')) -Destination $destination
    }
}
Write-Host 'Native helpers built.'
