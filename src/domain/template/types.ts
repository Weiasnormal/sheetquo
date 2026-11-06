export type SemanticKey =
  | 'business.name'
  | 'business.address'
  | 'business.phone'
  | 'business.taxText'
  | 'quote.number'
  | 'quote.date'
  | 'quote.notes'
  | 'quote.terms'
  | 'customer.name'
  | 'customer.address'
  | 'customer.tin'
  | 'vehicle.description'
  | 'vehicle.engine'
  | 'vehicle.plate'
  | 'vehicle.chassis'
  | 'totals.subtotal'
  | 'totals.labor'
  | 'totals.discount'
  | 'totals.grandTotal'
  | 'signatures.preparedBy'
  | 'signatures.receivedBy'
  | 'signatures.checkedBy'

export type CellMapping = {
  semanticKey: SemanticKey
  worksheet: string
  address: string
  source: 'business' | 'quotation' | 'calculated'
  required: boolean
  /** "preserve" keeps the template's own value or formula in the cell. */
  overwrite: 'replace' | 'preserve'
}

export type RepeatRegion = {
  worksheet: string
  headerRow: number
  firstDataRow: number
  prototypeRow: number
  footerAnchorRow: number
  minDisplayRows?: number
  maxItems?: number
  columns: {
    itemNumber?: string
    description: string
    partNumber?: string
    quantity: string
    unit?: string
    unitPrice: string
    lineAmount: string
  }
}

export type PrintProfile = {
  paper: 'A4' | 'Letter'
  orientation: 'landscape' | 'portrait'
  marginsInches: { top: number; bottom: number; left: number; right: number }
  fitToWidthPages: number
  repeatHeaderRow?: number
  headerMarginInches?: number
  footerMarginInches?: number
  horizontalCentered?: boolean
  keepFooterTogether?: boolean
  /** Print area columns, since rows are computed from the generated layout. */
  columns: { first: string; last: string }
}

export type TemplateDefinition = {
  worksheetName: string
  cellMappings: CellMapping[]
  itemRegion: RepeatRegion
  printProfile: PrintProfile
  /** Cells holding an old quotation's values, emptied in every generated copy. Their formatting stays. */
  clearCells?: string[]
  adjustmentRows?: AdjustmentRow[]
  output?: OutputProfile
}

/** Fixed, owner-selected footer rows. Each enabled adjustment gets its own visible label and amount. */
export type AdjustmentRow = { label: string; amount: string; base?: string; rate?: string }
export type OutputProfile = {
  moneyFormat: 'template' | 'business'
  dateFormat: 'template' | 'iso' | 'short' | 'long'
  minRowHeight?: number
  maxRowHeight?: number
}
