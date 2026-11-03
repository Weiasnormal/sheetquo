# Checks every sample from output/excel-spike/manifest.json in Excel Desktop.
# Run `npm test` first. This never saves the samples. -Output points at another sample folder.
param([int]$TimeoutSeconds = 90, [string]$Output = '')

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$output = if ($Output) { $Output } else { Join-Path $root 'output\excel-spike' }
$output = (Resolve-Path -LiteralPath $output).Path
$worker = Join-Path $PSScriptRoot 'verify-one.ps1'
$pdfDir = Join-Path $output 'pdf'
$stateDir = Join-Path $output 'state'
New-Item -ItemType Directory -Force -Path $pdfDir, $stateDir | Out-Null

$manifest = Get-Content -LiteralPath (Join-Path $output 'manifest.json') -Raw -Encoding utf8 | ConvertFrom-Json
$results = @()

foreach ($entry in $manifest) {
  $base = [IO.Path]::GetFileNameWithoutExtension($entry.file)
  $pidFile = Join-Path $stateDir "$base.pid"
  $resultFile = Join-Path $stateDir "$base.json"
  Remove-Item -LiteralPath $pidFile, $resultFile -ErrorAction SilentlyContinue

  $arguments = @(
    '-NoProfile', '-ExecutionPolicy', 'Bypass', '-File', "`"$worker`"",
    '-File', "`"$(Join-Path $output $entry.file)`"", '-Sheet', $entry.sheet,
    '-GrandCell', $entry.grandTotalCell, '-Expected', $entry.expectedGrandTotal,
    '-EditCell', $entry.editQuantityCell, '-ExpectedAfter', $entry.expectedAfterEdit,
    '-PrintArea', $entry.printArea, '-PdfPath', "`"$(Join-Path $pdfDir "$base.pdf")`"",
    '-PidFile', "`"$pidFile`"", '-ResultFile', "`"$resultFile`""
  )

  if ($entry.footerStartRow) { $arguments += @('-FooterStartRow', $entry.footerStartRow) }
  if ($entry.repeatHeaderRow) { $arguments += @('-RepeatHeaderRow', $entry.repeatHeaderRow) }
  if ($entry.validationCell) { $arguments += @('-ValidationCell', $entry.validationCell) }
  if ($entry.conditionalCell) { $arguments += @('-ConditionalCell', $entry.conditionalCell) }
  $process = Start-Process powershell.exe -ArgumentList $arguments -PassThru -WindowStyle Hidden
  if (-not $process.WaitForExit($TimeoutSeconds * 1000)) {
    # Only the Excel instance this run started is stopped, never one the user has open.
    if (Test-Path -LiteralPath $pidFile) {
      Stop-Process -Id ([int](Get-Content -LiteralPath $pidFile)) -Force -ErrorAction SilentlyContinue
    }
    Stop-Process -Id $process.Id -Force -ErrorAction SilentlyContinue
    $results += [pscustomobject]@{ file = $entry.file; ok = $false; failures = @("Timed out after $TimeoutSeconds seconds, which usually means a repair prompt") }
    continue
  }

  if (Test-Path -LiteralPath $resultFile) {
    $fileResult = Get-Content -LiteralPath $resultFile -Raw -Encoding utf8 | ConvertFrom-Json
    # Excel's Pages.Count disagreed with its own PDF, so pages are counted from the PDF.
    if (Test-Path -LiteralPath (Join-Path $pdfDir "$base.pdf")) {
      $pdfText = [IO.File]::ReadAllText((Join-Path $pdfDir "$base.pdf"), [Text.Encoding]::GetEncoding(28591))
      $pageTree = [regex]::Match($pdfText, '/Type\s*/Pages[^>]*?/Count\s+(\d+)')
      $fileResult | Add-Member -NotePropertyName pages -NotePropertyValue $pageTree.Groups[1].Value
    }
    $results += $fileResult
  } else {
    $results += [pscustomobject]@{ file = $entry.file; ok = $false; failures = @('The check ended without a result') }
  }
}

$results | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath (Join-Path $output 'excel-results.json') -Encoding utf8
$results | Format-Table file, ok, grandTotal, expected, afterEdit, pages, printArea -AutoSize | Out-String -Width 160
$results | Where-Object { -not $_.ok } | ForEach-Object { "FAILED $($_.file): $($_.failures -join '; ')" }
if ($results | Where-Object { -not $_.ok }) { exit 1 }
