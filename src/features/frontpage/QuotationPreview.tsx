import { SAMPLE, amount, subtotal, total } from './sample'

export function QuotationPreview({ blank = false }: { blank?: boolean }) {
  return <div className="front-document">
    <div className="front-document-heading"><span>Parts & service</span><span>DEMO-001</span></div>
    <h3>Quotation</h3>
    <p className="front-document-customer">{blank ? 'Your customer' : SAMPLE.customer}</p>
    <table aria-label="Example quotation">
      <thead><tr><th>Item</th><th>Qty</th><th>Amount</th></tr></thead>
      <tbody>{SAMPLE.items.map((item) => <tr key={item.name}><td>{blank ? 'Item description' : item.name}</td><td>{blank ? '—' : item.quantity}</td><td>{blank ? '—' : amount(item.quantity * item.price)}</td></tr>)}</tbody>
    </table>
    <dl><div><dt>Subtotal</dt><dd>{blank ? '—' : amount(subtotal)}</dd></div><div><dt>Discount</dt><dd>{blank ? '—' : `−${amount(SAMPLE.discount)}`}</dd></div><div className="front-document-total"><dt>Total</dt><dd>{blank ? '—' : `PHP ${amount(total)}`}</dd></div></dl>
    <p className="front-document-foot">Sample data · Your template sets the final layout</p>
  </div>
}
