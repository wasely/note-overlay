$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
$compiler = Join-Path $env:WINDIR "Microsoft.NET\Framework64\v4.0.30319\csc.exe"
if (-not (Test-Path -LiteralPath $compiler)) { throw "Windows C# compiler was not found." }

$dragOutput = Join-Path $root "build\clean-text-drag.exe"
$dragSource = Join-Path $root "build\CleanTextDrag.cs"
& $compiler /nologo /target:exe /optimize+ "/out:$dragOutput" /reference:System.Windows.Forms.dll $dragSource
if ($LASTEXITCODE -ne 0) { throw "Could not build clean text drag helper." }

$testOutput = Join-Path $root "scripts\clean-drag-test-host.exe"
$testSource = Join-Path $root "scripts\CleanDragTestHost.cs"
& $compiler /nologo /target:exe /optimize+ "/out:$testOutput" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll $testSource
if ($LASTEXITCODE -ne 0) { throw "Could not build clean drag test host." }
