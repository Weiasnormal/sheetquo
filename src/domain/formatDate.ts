export function formatDate(iso: string): string {
  return new Intl.DateTimeFormat('en-PH', { dateStyle: 'medium' }).format(new Date(iso))
}
