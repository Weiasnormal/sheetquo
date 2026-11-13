/** Marketing example only. Never inserted into the user's workspace. */
export const SAMPLE = {
  customer: 'Ventura Motors', number: 'DEMO-001',
  message: 'Customer: Ventura Motors\n2 pcs Brake Pad — 1,200 each\n1 pc Oil Filter — 350\nLabor: 500\nDiscount: 100',
  items: [
    { name: 'Brake Pad', quantity: 2, price: 1200 },
    { name: 'Oil Filter', quantity: 1, price: 350 },
    { name: 'Labor', quantity: 1, price: 500 },
  ],
  discount: 100,
}
export const subtotal = SAMPLE.items.reduce((sum, item) => sum + item.quantity * item.price, 0)
export const total = subtotal - SAMPLE.discount
export const amount = (value: number) => value.toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
export const STAGES = [
  { title: 'Paste a request', description: 'Start with a customer’s message. Your own Excel template sets the layout.' },
  { title: 'Review the details', description: 'Check the customer, quantities, prices and adjustments. You decide what goes into the quote.' },
  { title: 'Make it Excel', description: 'Generate an editable workbook. Open it in Excel to check, print or save as PDF.' },
]
