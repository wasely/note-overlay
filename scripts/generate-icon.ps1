Add-Type -AssemblyName System.Drawing

$outputDir = Join-Path $PSScriptRoot "..\build"
New-Item -ItemType Directory -Force -Path $outputDir | Out-Null
$bitmap = New-Object System.Drawing.Bitmap 256, 256
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$graphics.Clear([System.Drawing.Color]::Transparent)

function New-RoundedPath([float]$x, [float]$y, [float]$width, [float]$height, [float]$radius) {
  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $radius * 2
  $path.AddArc($x, $y, $diameter, $diameter, 180, 90)
  $path.AddArc($x + $width - $diameter, $y, $diameter, $diameter, 270, 90)
  $path.AddArc($x + $width - $diameter, $y + $height - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($x, $y + $height - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

$tile = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(245, 247, 243))
$cover = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(48, 96, 63))
$page = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(255, 253, 247))
$line = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(155, 177, 161), 9)
$line.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$line.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

$tilePath = New-RoundedPath 16 16 224 224 48
$bookPath = New-RoundedPath 54 38 148 180 18
$pagePath = New-RoundedPath 82 52 102 152 9
$graphics.FillPath($tile, $tilePath)
$graphics.FillPath($cover, $bookPath)
$graphics.FillPath($page, $pagePath)
$graphics.DrawLine($line, 101, 91, 164, 91)
$graphics.DrawLine($line, 101, 122, 164, 122)
$graphics.DrawLine($line, 101, 153, 150, 153)

$pngPath = Join-Path $outputDir "notebook.png"
$bitmap.Save($pngPath, [System.Drawing.Imaging.ImageFormat]::Png)
$graphics.Dispose()
$icon = [System.Drawing.Icon]::FromHandle($bitmap.GetHicon())
$stream = [System.IO.File]::Create((Join-Path $outputDir "notebook.ico"))
$icon.Save($stream)
$stream.Dispose(); $icon.Dispose(); $bitmap.Dispose()
$line.Dispose(); $tile.Dispose(); $cover.Dispose(); $page.Dispose()
$tilePath.Dispose(); $bookPath.Dispose(); $pagePath.Dispose()
