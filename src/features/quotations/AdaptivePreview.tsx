import type { AdaptiveOutput } from '../../infrastructure/excel/adaptiveQuotation'

export function AdaptivePreview({output}: {output: AdaptiveOutput}) {
  return <section aria-label="Quotation preview" className="overflow-x-auto rounded-button border border-line bg-white p-4">
    <h2 className="mb-3 font-semibold">Quotation preview</h2>
    {output.warning && <p role="status">{output.warning}</p>}
    <table aria-label="Excel quotation layout" className="w-full min-w-[36rem] table-fixed border-collapse text-sm">
      <colgroup>{output.widths.map((width,i)=><col key={i} style={{width:100*width/output.widths.reduce((a,b)=>a+b,0)+'%'}}/>)}</colgroup>
      <tbody>{output.rows.map((row,r)=><tr key={r}>{row.map((cell,c)=><td key={c} colSpan={cell.span}
        className="relative whitespace-pre-wrap break-words px-1 py-1.5 align-middle"
        style={{fontWeight:cell.bold?700:undefined,fontFamily:cell.font,fontSize:cell.size && cell.size+'pt',textAlign:cell.align,color:cell.color,backgroundColor:cell.fill,border:cell.box?`1px solid ${cell.boxColor ?? '#9ca3af'}`:undefined,
          borderBottom:cell.double?'3px double #1f2937':cell.border?'1px solid #9ca3af':undefined,
          height:r===0 && output.logo ? Math.min(64, output.logoSize?.height ?? 64) + 12 : undefined}}>
        {r===0 && c===0 && output.logo && <img src={output.logo} alt="Business logo" width={output.logoSize?.width} height={output.logoSize?.height} className="absolute top-1/2 left-1 max-h-16 max-w-[30%] -translate-y-1/2 object-contain"/>}{cell.text}
      </td>)}</tr>)}</tbody>
    </table>
  </section>
}

