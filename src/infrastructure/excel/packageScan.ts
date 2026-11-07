import type JSZip from 'jszip'
import { readSafeXlsxZip } from './safeZip'
import type { Diagnostic } from './WorkbookAdapter'

const OLE_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0]

type PartRule = {
  pattern: RegExp
  severity: Diagnostic['severity']
  code: string
  message: string
}

const PART_RULES: PartRule[] = [
  {
    pattern: /^xl\/vbaProject\.bin$/,
    severity: 'error',
    code: 'MACROS_NOT_SUPPORTED',
    message: 'This workbook contains macros, which Sheetquo does not accept.',
  },
  {
    pattern: /^xl\/charts\//,
    severity: 'warning',
    code: 'CHARTS_DROPPED',
    message: 'Charts are removed from generated quotations.',
  },
  {
    pattern: /^xl\/pivotTables\//,
    severity: 'warning',
    code: 'PIVOTS_DROPPED',
    message: 'Pivot tables are removed from generated quotations.',
  },
  {
    pattern: /^xl\/externalLinks\//,
    severity: 'warning',
    code: 'EXTERNAL_LINKS',
    message: 'This workbook links to other files. Those links are not followed or kept.',
  },
  {
    pattern: /^xl\/ctrlProps\/|^xl\/activeX\//,
    severity: 'warning',
    code: 'FORM_CONTROLS_DROPPED',
    message: 'Form controls are removed from generated quotations.',
  },
  {
    pattern: /^xl\/slicers\/|^xl\/timelines\//,
    severity: 'warning',
    code: 'SLICERS_DROPPED',
    message: 'Slicers and timelines are removed from generated quotations.',
  },
]

/** Reads the OOXML package directly, since ExcelJS silently skips what it cannot model. */
export async function scanPackage(bytes: Uint8Array): Promise<Diagnostic[]> {
  if (OLE_SIGNATURE.every((byte, index) => bytes[index] === byte)) {
    return [
      {
        severity: 'error',
        code: 'ENCRYPTED_OR_LEGACY',
        message: 'This file is password protected or an older Excel format. Save it as an unprotected .xlsx.',
      },
    ]
  }

  let zip: JSZip
  try {
    zip = await readSafeXlsxZip(bytes)
  } catch {
    return [{ severity: 'error', code: 'NOT_XLSX', message: 'Could not safely read this workbook. Use an unencrypted .xlsx under 15 MB compressed, 128 MB expanded and 32 MB per ZIP entry.' }]
  }

  if (!zip.file('[Content_Types].xml') || !zip.file('xl/workbook.xml')) {
    return [{ severity: 'error', code: 'NOT_XLSX', message: 'Could not read this workbook. It is not a valid .xlsx file.' }]
  }

  const paths = Object.keys(zip.files)
  const diagnostics: Diagnostic[] = []

  for (const rule of PART_RULES) {
    if (paths.some((path) => rule.pattern.test(path))) {
      diagnostics.push({ severity: rule.severity, code: rule.code, message: rule.message })
    }
  }

  for (const path of paths.filter((name) => /^xl\/drawings\/drawing\d+\.xml$/.test(name))) {
    const xml = await zip.file(path)!.async('string')
    if (/<xdr:sp[\s>]/.test(xml)) {
      diagnostics.push({
        severity: 'warning',
        code: 'SHAPES_DROPPED',
        message: 'Text boxes and drawn shapes are removed from generated quotations. Pictures are kept.',
      })
      break
    }
  }

  const workbookXml = await zip.file('xl/workbook.xml')!.async('string')
  if (workbookXml.includes('<workbookProtection')) {
    diagnostics.push({
      severity: 'warning',
      code: 'WORKBOOK_PROTECTED',
      message: 'This workbook has a protected structure. Generated files may not keep that protection.',
    })
  }

  for (const path of paths.filter((name) => /^xl\/worksheets\/sheet\d+\.xml$/.test(name))) {
    const xml = await zip.file(path)!.async('string')
    if (xml.includes('<sheetProtection')) {
      diagnostics.push({
        severity: 'error',
        code: 'SHEET_PROTECTED',
        message: 'A worksheet is protected. Unprotect it in Excel, then upload it again.',
      })
      break
    }
  }

  return diagnostics
}
