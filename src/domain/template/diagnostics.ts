export type Diagnostic = {
  severity: 'error' | 'warning' | 'info'
  code: string
  message: string
  worksheet?: string
  cell?: string
}

export const hasErrors = (diagnostics: Diagnostic[]) => diagnostics.some(({ severity }) => severity === 'error')
