# Re-saves the synthetic templates through Excel Desktop, so tests also cover files that
# Excel wrote rather than ExcelJS. The second file adds features ExcelJS may not keep.
# Run `npm test` first, since that writes the source templates to output/excel-spike/templates.

$ErrorActionPreference = 'Stop'

$root = Resolve-Path (Join-Path $PSScriptRoot '..\..')
$source = Join-Path $root 'output\excel-spike\templates'
$target = Join-Path $root 'src\test\fixtures\synthetic'

$xlOpenXmlWorkbook = 51
$xlCellValue = 1
$xlGreater = 5
$xlValidateList = 3

$excel = New-Object -ComObject Excel.Application
try {
  $excel.Visible = $false
  $excel.DisplayAlerts = $false

  $parts = $excel.Workbooks.Open((Join-Path $source 'parts-template.xlsx'))
  $parts.SaveAs((Join-Path $target 'parts-template.excel-authored.xlsx'), $xlOpenXmlWorkbook)
  $parts.Close($false)

  $service = $excel.Workbooks.Open((Join-Path $source 'service-template.xlsx'))
  $sheet = $service.Worksheets.Item('Estimate')

  $textBox = $sheet.Shapes.AddTextbox(1, 300, 4, 130, 22)
  $textBox.TextFrame2.TextRange.Text = 'Demo text box'

  $condition = $sheet.Range('I12').FormatConditions.Add($xlCellValue, $xlGreater, '=1000')
  $condition.Interior.Color = 13431551

  [void]$sheet.Range('F12').Validation.Add($xlValidateList, 1, 1, 'PC,SET,ASSY,SVC')
  [void]$service.Names.Add('GrandTotal', '=Estimate!$I$15')
  [void]$sheet.Range('H13').AddComment('Demo note')
  $sheet.PageSetup.CenterFooter = 'Page &P of &N'

  $service.SaveAs((Join-Path $target 'service-template.features.excel-authored.xlsx'), $xlOpenXmlWorkbook)
  $service.Close($false)
}
finally {
  $excel.Quit()
  [void][Runtime.InteropServices.Marshal]::ReleaseComObject($excel)
}
