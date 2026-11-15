import { useEffect } from 'react'
import { Link, ScrollRestoration } from 'react-router'
import { ArrowRight, ArrowUpRight, Check, MousePointer2, ShieldCheck } from 'lucide-react'
import { WorkflowScene } from '../../features/frontpage/WorkflowScene'
import { useWiwo } from '../../features/wiwo/context'
import { WiwoSlot } from '../../features/wiwo/WiwoToggle'
import '../../features/frontpage/frontpage.css'

export function FrontPage() {
  const wiwo = useWiwo()
  useEffect(() => { document.title = 'Sheetquo · From request to quotation' }, [])
  return <div className="front-page">
    <a className="front-skip" href="#front-main">Skip to content</a>
    <header className="front-header front-wrap">
      <Link to="/" aria-label="Sheetquo home"><img src="/brandassets/sheetquo-logo-primary.webp" alt="Sheetquo" width="172" height="40" /></Link>
      <nav aria-label="Front page"><a href="#how-it-works">How it works</a><a href="#meet-wiwo">Meet Wiwo</a><Link className="front-header-open" to="/dashboard">Open workspace <ArrowUpRight size={17} aria-hidden="true" /></Link></nav>
      <WiwoSlot className="front-header-wiwo" />
    </header>
    <main id="front-main" tabIndex={-1}>
      <section className="front-hero front-wrap" aria-labelledby="front-title">
        <div className="front-hero-copy">
          <h1 id="front-title">Your next quotation starts with <span>a message.</span></h1>
          <p>Turn customer requests into editable Excel quotations. Keep your template, check the details, and make it yours.</p>
          <Link to="/dashboard" className="front-primary">Open workspace <ArrowRight size={19} aria-hidden="true" /></Link>
          <div className="front-reassurance"><ShieldCheck size={17} aria-hidden="true" /><span>No account needed. Your data stays in this browser.</span></div>
        </div>
        <WorkflowScene />
      </section>
      <div className="front-facts front-wrap"><span>Your own Excel templates</span><span>Editable .xlsx output</span><span>Multiple businesses</span><span>Offline after setup</span></div>
      <section id="how-it-works" className="front-process front-wrap" aria-labelledby="process-title">
        <div className="front-process-intro"><h2 id="process-title">A familiar layout.<br />A simpler way to quote.</h2><p>You’ve already put thought into your quotation template. Sheetquo helps you use it for the next customer, and the next.</p><Link to="/templates">Bring your template <ArrowUpRight size={18} aria-hidden="true" /></Link></div>
        <ol className="front-process-list">
          <li><span className="front-step-number">1</span><div><h3>Set up your template once.</h3><p>Upload an Excel workbook. Choose the quotation area, connect fields to cells, then test and activate the layout.</p></div></li>
          <li><span className="front-step-number">2</span><div><h3>Give every request a proper review.</h3><p>Paste a message or type your items. Resolve uncertain prices, check quantities, and choose discounts, deductions, fees or taxes.</p></div></li>
          <li><span className="front-step-number">3</span><div><h3>Take it from here in Excel.</h3><p>Generate a new workbook while your original template stays intact. Check the result in Excel, then edit, print or export a PDF.</p></div></li>
        </ol>
      </section>
      <section id="meet-wiwo" className="front-wiwo" aria-labelledby="wiwo-front-title"><div className="front-wrap front-wiwo-inner">
        <div className="front-wiwo-art" aria-hidden="true"><MousePointer2 size={92} strokeWidth={1.25} /><span>Wiwo</span><div className="front-wiwo-note"><Check size={17} />One step at a time.</div></div>
        <div><h2 id="wiwo-front-title">A little guidance,<br />right where you need it.</h2><p>Meet Wiwo, your cursor guide. Learn the next step, replay a screen you’ve forgotten, or cancel whenever you’re ready to carry on.</p><button className="front-primary" type="button" onClick={() => wiwo?.start('welcome', true, true)}>Let Wiwo show me <ArrowRight size={18} aria-hidden="true" /></button><Link className="front-wiwo-link" to="/help">Explore all 17 chapters <ArrowUpRight size={16} aria-hidden="true" /></Link></div>
      </div></section>
      <section className="front-local front-wrap" aria-labelledby="local-title"><div><h2 id="local-title">Your work stays with you.</h2><p>Quotations, templates and business details are stored in this browser. No account or cloud upload is required. Once the app is ready for offline use, your work can continue without a connection.</p></div><div className="front-backup-note"><ShieldCheck size={25} aria-hidden="true" /><h3>Keep a copy of what matters.</h3><p>Different browsers and devices have separate storage. Export a backup regularly, and use it to move your workspace.</p><Link to="/settings">Backup and storage settings <ArrowUpRight size={16} aria-hidden="true" /></Link></div></section>
    </main>
    <footer className="front-footer front-wrap"><Link to="/" aria-label="Sheetquo home"><img src="/brandassets/sheetquo-logo-primary.webp" alt="Sheetquo" width="138" height="32" /></Link><p>Your template. Your next quotation.</p><Link to="/dashboard">Open workspace <ArrowRight size={16} aria-hidden="true" /></Link></footer>
    <ScrollRestoration />
  </div>
}
