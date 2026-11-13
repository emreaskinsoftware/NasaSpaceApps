# Renders every deck in deliverables/presentation with the locally installed PowerPoint (COM automation):
# exports a PDF next to each PPTX and one PNG per slide into thumbnails/<deck>/. Used by `pnpm slides:verify`.
param([string]$Dir = (Join-Path (Get-Location) 'deliverables\presentation'))
$ErrorActionPreference = 'Stop'
$ppt = New-Object -ComObject PowerPoint.Application
try {
  Get-ChildItem -Path $Dir -Filter *.pptx | ForEach-Object {
    $name = $_.BaseName
    $pres = $ppt.Presentations.Open($_.FullName, $true, $false, $false)  # read-only, no window
    try {
      $pdf = Join-Path $Dir "$name.pdf"
      $pres.SaveAs($pdf, 32)                                              # 32 = ppSaveAsPDF
      $thumbs = Join-Path $Dir "thumbnails\$name"
      New-Item -ItemType Directory -Force -Path $thumbs | Out-Null
      $i = 0
      foreach ($slide in $pres.Slides) { $i++; $slide.Export((Join-Path $thumbs ("slide-{0:D2}.png" -f $i)), 'PNG', 1600, 900) }
      Write-Output "$name : $i slides -> PDF + thumbnails"
    } finally { $pres.Close() }
  }
} finally { $ppt.Quit(); [System.Runtime.InteropServices.Marshal]::ReleaseComObject($ppt) | Out-Null }
