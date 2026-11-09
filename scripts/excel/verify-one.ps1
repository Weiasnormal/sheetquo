# Opens one generated workbook in a private, hidden Excel instance. Alerts stay on,
# so a repair prompt blocks this script and verify-samples.ps1 reports a timeout.
param(
  [string]$File, [string]$Sheet, [string]$GrandCell, [double]$Expected,
  [string]$EditCell, [double]$ExpectedAfter, [string]$PrintArea,
  [string]$PdfPath, [string]$PidFile, [string]$ResultFile,
  [int]$FooterStartRow = 0, [int]$RepeatHeaderRow = 0,
  [string]$ValidationCell = '', [string]$ConditionalCell = ''
)

$ErrorActionPreference = 'Stop'

Add-Type -Namespace Native -Name Window -MemberDefinition @'
[DllImport("user32.dll")] public static extern uint GetWindowThreadProcessId(System.IntPtr hWnd, out uint processId);
'@

$result = [ordered]@{ file = [IO.Path]::GetFileName($File); ok = $false; failures = @() }
$fail = { param($message) $result.failures += $message }
$excel = $null

try {
  $excel = New-Object -ComObject Excel.Application
  [uint32]$excelPid = 0
  [void][Native.Window]::GetWindowThreadProcessId([IntPtr]$excel.Hwnd, [ref]$excelPid)
  Set-Content -LiteralPath $PidFile -Value $excelPid

  $excel.Visible = $false
  $excel.DisplayAlerts = $true
  $workbook = $excel.Workbooks.Open($File, 0, $true)
  if ($workbook.Name -match 'Repaired') { & $fail 'Excel repaired the workbook' }
  if ($workbook.Worksheets.Count -ne 1) { & $fail "Expected 1 worksheet, found $($workbook.Worksheets.Count)" }

  $sheetObject = $workbook.Worksheets.Item($Sheet)
  $excel.CalculateFull()

  $grandTotal = [double]$sheetObject.Range($GrandCell).Value2
  $result.grandTotal = $grandTotal
  $result.expected = $Expected
  if ([Math]::Abs($grandTotal - $Expected) -ge 0.005) { & $fail "Grand total $grandTotal, expected $Expected" }

  $errorCount = 0
  try { $errorCount = $sheetObject.UsedRange.SpecialCells(-4123, 16).Count } catch { $errorCount = 0 }
  if ($errorCount -gt 0) { & $fail "$errorCount formula cells show errors" }

  # A correct value can still print as ####, so this reads what Excel displays.
  $clipped = @()
  foreach ($cell in $sheetObject.UsedRange.Cells) {
    if ($cell.Value2 -is [double] -and $cell.Text -match '^#+$') { $clipped += $cell.Address($false, $false) }
  }
  if ($clipped.Count -gt 0) { & $fail "Clipped to ####: $($clipped -join ', ')" }

  $injected = $sheetObject.Cells.Find('HYPERLINK')
  if ($null -ne $injected -and $injected.HasFormula) { & $fail "Pasted text became a formula at $($injected.Address())" }

  $pageSetup = $sheetObject.PageSetup
  $actualArea = $pageSetup.PrintArea -replace '\$', ''
  $result.printArea = $actualArea
  if ($actualArea -ne $PrintArea) { & $fail "Print area $actualArea, expected $PrintArea" }
  $result.printTitles = $pageSetup.PrintTitleRows
  $result.fitToPagesWide = $pageSetup.FitToPagesWide
  $result.orientation = $pageSetup.Orientation
  $result.paperSize = $pageSetup.PaperSize
  if ($ValidationCell) {
    try {
      $result.validationType = $sheetObject.Range($ValidationCell).Validation.Type
      if ($result.validationType -ne 3) { & $fail "Expected a dropdown at $ValidationCell" }
    } catch { & $fail "No working dropdown at $ValidationCell" }
  }
  if ($ConditionalCell) {
    $result.conditionalRuleCount = $sheetObject.Range($ConditionalCell).FormatConditions.Count
    if ($result.conditionalRuleCount -lt 1) { & $fail "No conditional formatting at $ConditionalCell" }
  }

  $workbook.ExportAsFixedFormat(0, $PdfPath)

  $result.pageBreakRows = @()
  foreach ($pageBreak in $sheetObject.HPageBreaks) {
    $breakRow = [int]$pageBreak.Location.Row
    $result.pageBreakRows += $breakRow
    if ($FooterStartRow -gt 0 -and $breakRow -gt $FooterStartRow) { & $fail "Footer split before row $breakRow (footer starts at $FooterStartRow)" }
  }
  if ($RepeatHeaderRow -gt 0 -and ($pageSetup.PrintTitleRows -replace '\$', '') -ne "${RepeatHeaderRow}:${RepeatHeaderRow}") { & $fail 'Table heading is not repeated' }
  if ($pageSetup.FitToPagesTall -ne $false -and $pageSetup.FitToPagesTall -ne 0) { & $fail 'Output is being shrunk to a fixed page count vertically' }

  $editCellObject = $sheetObject.Range($EditCell)
  $editCellObject.Value2 = [double]$editCellObject.Value2 + 1
  $excel.CalculateFull()
  $afterEdit = [double]$sheetObject.Range($GrandCell).Value2
  $result.afterEdit = $afterEdit
  if ([Math]::Abs($afterEdit - $ExpectedAfter) -ge 0.005) { & $fail "After edit $afterEdit, expected $ExpectedAfter" }

  $workbook.Close($false)
  $result.ok = $result.failures.Count -eq 0
}
catch {
  $result.failures += $_.Exception.Message
}
finally {
  if ($null -ne $excel) {
    $excel.DisplayAlerts = $false
    $excel.Quit()
    [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
  }
  $result | ConvertTo-Json -Depth 4 | Set-Content -LiteralPath $ResultFile -Encoding utf8
}
