Add-Type -AssemblyName System.Drawing

$outputDir = Join-Path $PSScriptRoot "..\build"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::FromArgb(24, 36, 31))
$accent = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(139, 240, 193))
$ink = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(16, 35, 29))
$graphics.FillEllipse($accent, 22, 22, 212, 212)
$graphics.FillRectangle($ink, 72, 118, 112, 20)
$graphics.FillRectangle($ink, 118, 72, 20, 112)
$graphics.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $outputDir "notebook.ico"))
$icon.Save($stream)
$stream.Dispose(); $icon.Dispose(); $bitmap.Dispose()
