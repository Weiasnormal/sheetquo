import type { ChapterId } from './catalog'
import type { WiwoEvent } from './events'

export type LessonStep = {
  id: string; target: string[]; title: string; body: string; missing: string
  event?: WiwoEvent
  ready?: string
  acknowledge?: string
}
const step = (id: string, target: string | string[], title: string, body: string, extra: Partial<LessonStep> = {}): LessonStep => ({
  id, target: Array.isArray(target) ? target : [target], title, body,
  missing: 'This control is not visible in the current state. Open the relevant panel, or skip this explanation and return when you need it.', ...extra,
})

export const LESSONS: Record<ChapterId, LessonStep[]> = {
  welcome: [
    step('toggle', 'wiwo-toggle', 'Meet Wiwo', 'I point out the next step while you stay in control. Click the cursor again, use Close, or press Escape to cancel. You can replay any chapter from Help.'),
    step('setup', 'setup', 'Start from your setup checklist', 'A quotation needs a business and an active template. Follow the first unfinished task here. If these are already ready, you can go straight to New quotation.'),
    step('business-context', ['business-switcher', 'mobile-menu'], 'Check which business you are using', 'Each business has separate templates and quotations. On a phone, open the menu to find the business switcher. Switching changes the workspace, not the details on another business’s records.'),
    step('navigation', ['navigation', 'mobile-menu'], 'Choose the task you need', 'New quotation starts a request. History finds saved work. Templates manages Excel layouts. Settings contains backups and offline status; Help contains every Wiwo chapter.'),
    step('local-data', 'setup', 'Your work lives in this browser', 'A different browser, device, address or port has separate storage. Keep backups. Wiwo progress is shared by people using this browser profile; resetting Wiwo does not remove quotations.', { acknowledge: 'Got it' }),
  ],
  business: [
    step('profile', ['business-form', 'business-list'], 'Create or open a business', 'Use Add business for a new profile, or open an existing profile to edit it. Use verified current details, rather than copying historical information from an old workbook.', { missing: 'Open Businesses to add or edit a profile.' }),
    step('identity', ['business-identity', 'business-list'], 'Name and contact details', 'The display name helps you find the business. Check its legal name, address, phone numbers and tax text. Only mapped fields are inserted into the workbook; a static template heading stays as designed.'),
    step('currency-logo', ['business-branding', 'business-form', 'business-list'], 'Currency, logo and preview', 'Choose the currency and check the profile preview. Upload a supported logo if needed. The profile preview is not proof that a template contains a dynamic logo or matching currency format.'),
    step('save-business', ['business-save', 'business-list'], 'Save the profile', 'Save your changes. Validation errors stay beside the affected fields. Wiwo continues only after Sheetquo confirms a successful save.', { event: 'business-saved', missing: 'Open a business editor, then use Save business. You can skip this action if you only wanted an explanation.' }),
    step('switch-archive', ['business-switcher', 'business-list', 'mobile-menu'], 'Switch, archive or restore deliberately', 'Use the switcher for daily work. Archiving hides a business from active use; restoring makes it available again. Read confirmation dialogs before acting. You do not need to archive anything for this lesson.'),
  ],
  import: [
    step('file', ['import-file', 'import-review'], 'Choose your Excel workbook', 'Choose an .xlsx workbook with a quotation layout. Your original is kept unchanged. Macros, passwords and unsupported constructs are flagged; importing an archive does not automatically choose the right quotation.'),
    step('worksheet', 'import-sheet', 'Choose the right worksheet', 'Read the worksheet names, hidden/empty indicators and compatibility notes. A historical workbook can contain several businesses or quotations. Select the intended sheet yourself.', { missing: 'Choose a readable workbook first to see its worksheets.' }),
    step('area', 'import-area', 'Keep one quotation area', 'Choose the quotation block, first/last rows and last column. Include blank styled signature rows and the whole footer. Leave out unrelated quotations and private cost columns. Check the preview before saving.'),
    step('import-save', 'import-save', 'Name and save the clean copy', 'Use a recognizable template name. A duplicate-file notice is information, not permission to overwrite another template. Save the clean area when the diagnostic list allows it.', { event: 'template-imported', missing: 'Select a worksheet and valid quotation area to reveal Save template.' }),
  ],
  fields: [
    step('grid', 'mapping-grid', 'Connect a field to a cell', 'Select a field on the right, then click its destination in the grid or type its A1 address. For a merged area, use the top-left anchor. The preview is approximate; Excel is authoritative.'),
    step('required', 'mapping-fields', 'Map the required fields', 'Customer name, quotation date and grand total are required. Add business, vehicle, quotation number and signature fields as needed. A field cannot share a destination with another mapping or sit inside the repeating items.'),
    step('suggestions', ['mapping-suggestions', 'mapping-fields'], 'Treat suggestions as a starting point', 'Suggested mappings are based on labels. Check them yourself before applying or testing. Your layout may differ from another business’s workbook; Wiwo never assumes fixed WCCE coordinates.'),
    step('static', 'mapping-fields', 'Keep static headings intentionally', 'Business details baked into your template may stay static. Map them only if you want Sheetquo to replace them. Terms and notes need mappings to print; otherwise they remain saved in the quotation only.'),
    step('leftovers', 'mapping-leftovers', 'Remove historical values', 'Review leftover customer names, prices and old quote details. Select only cells that should be emptied. Keep intentional labels and artwork. This changes the generated copy, not your original upload.'),
    step('mapping-ready', 'mapping-check', 'Resolve the mapping checks', 'Fix the listed errors and wait for All changes saved. If saving fails, keep this page open and use Retry saving mapping. The test action saves pending changes before opening the next screen.', { ready: 'mapping-ready' }),
  ],
  table: [
    step('rows', 'mapping-table', 'Identify the repeating area', 'Set the table header, first item row and first row after the items. The last of these is the footer anchor. Sheetquo inserts or removes item rows and moves the footer with them.'),
    step('prototype', 'mapping-prototype', 'Choose the prototype style row', 'The prototype supplies styles and supported reusable rules for every item. It must be inside the item area and may differ from the first item row. Leave it blank to use the first item row.'),
    step('columns', 'mapping-columns', 'Match each item column', 'Choose description, quantity, unit price and line amount columns. Add part number, unit and item number where your layout provides them. Two fields cannot use the same item column.'),
    step('minimum', 'mapping-table', 'Keep spare rows only when needed', 'Minimum displayed rows preserve useful blank styled space on short quotations. Item rows are rewritten, so do not place fixed customer or total fields there. Cross-boundary merges must be corrected in the template.'),
    step('table-ready', 'mapping-check', 'Check the table before testing', 'Resolve row, column and mapping conflicts. A valid saved mapping can be tested with short and long quotations. Do not activate a layout just because the grid looks correct.', { ready: 'mapping-ready' }),
  ],
  output: [
    step('formats', 'output-formats', 'Choose money and date formats', 'Keep template formats or apply the business currency to every amount. Empty/General formats use the business currency. Date options are template, ISO, short and long. Review currency mismatch warnings.'),
    step('heights', 'output-heights', 'Keep descriptions readable', 'Descriptions wrap. Optional item height limits use points, from 1 to 409. Text that cannot fit blocks generation instead of being silently clipped. Shorten or split long descriptions, or adjust the template.'),
    step('slots', 'adjustment-mapping', 'Reserve footer rows for adjustments', 'Map one existing footer slot per enabled adjustment. Label and amount are required; base and rate are optional. Use distinct anchors outside the item table. Unused slots are cleared.'),
    step('totals', 'adjustment-mapping', 'Let the total include every adjustment', 'Enabled adjustments fill slots in order. With slots, turn off Keep the template’s own formula for discount and grand total. A legacy discount field supports just one discount. Extra slots require an Excel redesign, not extra item rows.'),
    step('paper', 'print-settings', 'Set the paper and printable columns', 'Choose A4 or Letter, orientation, printable columns and pages wide. Height stays unlimited. Wide layouts may shrink the text; check Excel Print Preview before using the result.'),
    step('margins', 'print-settings', 'Keep headings and the footer readable', 'Set all margins in inches, repeat the table heading, and optionally center horizontally. Keep totals and signatures together reserves space where possible. A footer taller than a page still needs redesign.'),
    step('output-save', 'mapping-check', 'Save, then test the output', 'Wait for the saved status and fix blocking mapping errors. Test 3, 15 and 30 items before activating these settings. Print Preview on your own Excel/printer remains the final check.', { ready: 'mapping-ready' }),
  ],
  test: [
    step('samples', 'template-test', 'Test short and long quotations', 'Run test creates 3-, 15- and 30-item samples using synthetic customer/item data and your business heading. Samples include long descriptions, FREE, labor and mapped adjustments.'),
    step('run-test', 'test-run', 'Run the test', 'Generation checks mappings, formulas and supported layout features. A failing run needs correction; compatible with warnings still needs your review.', { event: 'template-tested', ready: 'test-passed' }),
    step('inspect', 'template-test', 'Inspect the actual Excel files', 'Download the samples. Open each in Excel, check for repair prompts, change a quantity and inspect the recalculated total. Check wrapping, page breaks, repeated headings and signatures in Print Preview.', { acknowledge: 'I understand the Excel checks' }),
    step('activate', 'template-activate', 'Activate only after reviewing', 'Make this version active opens a separate confirmation. New quotations use it; existing quotations keep their saved version. A published mapping is locked. Start a new version to make changes.', { event: 'template-activated', ready: 'template-active', missing: 'Run a successful test before activation becomes available.' }),
  ],
  templates: [
    step('list', ['template-list', 'template-versions'], 'Choose the right layout', 'Each template belongs to the current business. Active layouts can create quotations. Drafts need mapping and testing. Archived layouts can be restored intentionally.'),
    step('new-version', 'template-versions', 'Change a mapping through a new version', 'Use New version or Start version to copy the current workbook and mapping into an editable draft. Tested/active versions stay unchanged. Finish an existing draft before starting another.'),
    step('redesign', 'template-versions', 'Upload a redesigned workbook', 'A redesigned upload belongs to the same template but becomes a new draft. Matching cell signatures keep mappings; changed cells are flagged or unmapped. Review every retained mapping, then test and activate.'),
    step('duplicate', 'template-versions', 'Make an independent template copy', 'Duplicate template creates a separately named draft with its own workbook copies and mapping. It needs testing and activation. Duplicating does not change the source template.'),
    step('default', 'template-default', 'Default and last-used templates', 'The default is per business. New quotations remember your last chosen active template. Setting a default resets that remembered choice; unavailable layouts fall back to an active one.', { missing: 'Open Templates after at least one template is active to set a default.' }),
    step('archive', ['template-archive', 'template-list'], 'Archive without changing saved downloads', 'Archiving removes the layout from active choices. Read the confirmation and use Restore when needed. Files already downloaded to Excel are separate and are not deleted by this action.'),
  ],
  start: [
    step('choose', ['quote-start', 'paste'], 'Check the business and layout', 'Start with the intended business and active template version. When several layouts are ready, choose one here. If setup is incomplete, follow the business/template prompt first.'),
    step('paste', 'paste', 'Paste a customer request', 'Paste plain text including the customer, date, items and prices where available. Extraction is rule-based and runs locally. It does not invent missing prices or decide what ambiguous text means.'),
    step('manual', 'paste', 'Typing is also supported', 'Use Type the items instead to start manually. A quotation number is entered by you; there is no shared counter across devices. Pasted source text stays with the draft for review.'),
    step('extract', 'quote-create', 'Open the review', 'Choose Extract details or Type the items instead. A successful action saves a draft and opens Review. Re-extracting an existing quotation asks for confirmation before replacing reviewed details.', { event: 'quote-created', missing: 'Finish business/template setup before creating a quotation.' }),
  ],
  items: [
    step('source', ['source-lines', 'items'], 'Review what the parser understood', 'Read source-line warnings. Decide whether a price is each or a line total, choose alternatives, and decide whether unread or omitted lines should become items. The parser’s guess is not approval.'),
    step('fields', 'items', 'Check the included items', 'Verify description, part number, quantity, unit, unit price and item type. Add missing items, reorder them, or exclude/remove a line. A blank price is unresolved, not zero.'),
    step('free-labor', 'items', 'FREE and labor have different meanings', 'FREE keeps the item with a numeric zero amount. Labor uses its own item type and may print in a mapped labor cell. Parts/services and labor provide different percentage bases.'),
    step('summary', 'quote-summary', 'Use the summary to find problems', 'Totals recalculate from included items and enabled adjustments. Select an issue to reach its field. Fix blocking errors before generation; warnings still deserve review.'),
    step('review-ready', 'quote-summary', 'Finish a valid saved review', 'Check the customer, date, quantities and prices as well as parser choices. Wait for All changes saved. Wiwo will enable Continue only when the review has no blocking issues and the draft is saved.', { ready: 'quote-ready' }),
  ],
  adjustments: [
    step('kind', 'adjustments', 'Choose an adjustment intentionally', 'Discounts and deductions subtract. Fees and taxes add. Add only the adjustments that belong on this quotation; Sheetquo does not determine tax policy or automatically apply 2307 deductions.'),
    step('value', 'adjustments', 'Choose an amount or percentage', 'Give the adjustment a clear label. Enter a fixed amount in the business currency or a percentage rate. Check the plus/minus sign and calculated amount shown beside it.'),
    step('base', 'adjustments', 'Check the percentage base', 'All items includes every billable line. Parts and services excludes labor. Labor uses labor lines only. An amount I type requires a manual base. Each percentage uses its original base; adjustments do not compound.'),
    step('enabled', 'adjustments', 'Only enabled adjustments count', 'The On checkbox decides whether an adjustment affects the total and occupies a footer slot. Disabled rows remain saved. Remove an unwanted adjustment using its own remove button.'),
    step('capacity', 'quote-summary', 'Match the template capacity', 'Multiple adjustments require mapped footer slots. Enabled rows fill slots in their current order. If there are too few, make a new template version with enough slots, or disable an adjustment only if that is correct for the quotation.'),
    step('adjustment-review', 'quote-summary', 'Review and save the result', 'Confirm the labels, bases, enabled state, currency and grand total. Fix blocking problems and wait for the saved status before continuing.', { ready: 'quote-ready' }),
  ],
  details: [
    step('customer', 'quote-customer', 'Identify the customer and quotation', 'Check the customer name, address, TIN, date and quotation number. A real customer name and valid date are required. The quotation number is manually assigned.'),
    step('vehicle', 'quote-vehicle', 'Check the vehicle information', 'Review vehicle, engine, plate and chassis values. Confirm uncertain details with the customer. Do not copy identifiers from a historical template just because they are already visible there.'),
    step('terms', 'quote-closing', 'Add notes, terms and signatures', 'Enter the terms and notes that belong on this quotation, along with prepared/checked/received names. These values are saved locally; they print only when the chosen template maps them.'),
    step('unmapped', 'quote-closing', 'Notice fields that will not print', 'A field marked saved but not printed has no destination in this template version. If it must appear in Excel, update the mapping through a new version, test it and deliberately select that version.'),
    step('details-save', 'quote-save', 'Wait for your changes to save', 'All changes saved confirms persistence. A failed save keeps your edits on this page; retry before leaving. A backup contains saved data and cannot recover unsaved edits in another tab.', { ready: 'quote-saved' }),
  ],
  generate: [
    step('check', 'generate', 'Check the final summary', 'Confirm business, template version, customer, filename and total. Blocking issues must be fixed in Review. Sheetquo fills a new copy; your template and original upload remain unchanged.'),
    step('download', 'generate-button', 'Generate the Excel file', 'Generate Excel saves pending edits, creates the workbook and starts a browser download. Wiwo observes successful generation; it cannot prove the file finished saving to your disk.', { event: 'quote-generated' }),
    step('recalculate', 'generate', 'Verify it in Excel', 'Open the downloaded workbook. Check the total, then change one quantity and verify recalculation. FREE should remain numeric zero. A repair prompt or incorrect total needs investigation before sending.', { acknowledge: 'I understand the workbook checks' }),
    step('print', 'generate', 'Print or save PDF from Excel', 'Inspect paper size, repeated table headings, wrapped descriptions, signatures and page breaks in Print Preview. Use Excel to print or export PDF. Test a real printer as well as the preview.'),
    step('online', 'generate', 'Excel Online needs a separate check', 'If you use Excel Online, upload a suitable sample to your own account and compare editing and printing there. Wiwo cannot access Excel or your cloud account. Regenerate after making later changes in Sheetquo.', { acknowledge: 'Finish chapter' }),
  ],
  history: [
    step('recent', ['recent-quotes', 'history', 'quote-save'], 'Find saved quotations', 'The dashboard shows five recent quotations. Quotation history lists all saved quotations for the current business. Saved records remain in this browser unless you export them in a backup.'),
    step('search', ['history-search', 'history'], 'Search and filter', 'Search by customer, quotation number, vehicle, plate or date. Filter drafts or quotations with an Excel generation recorded. Use the next/previous page controls when there are more than 25 matches.'),
    step('reopen', ['history', 'quote-save'], 'Reopen a draft', 'Select a saved quotation to review or generate it again. A quotation retains its original template version even when a newer version becomes active. Changing its layout is your choice.'),
    step('copy-delete', ['quote-actions', 'history'], 'Duplicate or delete deliberately', 'Duplicate creates a new draft. Delete asks for confirmation and removes the saved draft, not files already downloaded. You do not need to delete a real quotation to complete this lesson.'),
  ],
  backup: [
    step('export', 'backup-export', 'Keep a portable backup', 'Export includes businesses, logos, original/clean workbooks, mappings and versions. Include quotation drafts only when you want their customer details and pasted messages in the archive. Template originals can also contain private history.'),
    step('export-action', 'backup-export-button', 'Start the backup download', 'Choose Export backup. Store the ZIP somewhere safe and check the browser download finished. Backups are not encrypted. Wiwo only confirms that the export was requested successfully.', { event: 'backup-exported' }),
    step('restore-preview', 'backup-restore', 'Inspect a backup before restoring', 'Close other Sheetquo tabs and choose a trusted backup. Read the preview and any integrity/format errors. Nothing is restored just because you selected a file. Formats 1–4 are supported by this build.'),
    step('choices', ['backup-mode', 'backup-restore'], 'Choose how conflicts are handled', 'Add missing businesses skips an entire matching business. Separate copies gives incoming records fresh IDs/names. Replacement removes current local records before restoring and requires an explicit confirmation.'),
    step('replace', 'backup-restore', 'Keep replacement under your control', 'Export current work before replacing it. A failed restore transaction rolls back. You can cancel the preview without changing records. This lesson never requires restoring over your real data.'),
    step('transfer', 'backup-restore', 'Move the setup yourself', 'Transfer the ZIP to the other device/browser and restore it there. Verify templates and a test quotation before relying on it. Wiwo progress is separate and is not included in business backups.', { acknowledge: 'I understand the restore choices' }),
  ],
  offline: [
    step('ready', 'offline', 'Wait for offline readiness', 'The production app caches its own assets after a connected load. The development server does not offer this guarantee. Wait for Ready for offline use before depending on offline access.', { ready: 'offline-ready' }),
    step('local', 'offline', 'Work offline with saved data', 'After readiness, saved templates, parsing, generation and backups work without an application backend. A first visit cannot work offline. Browser data and the app cache are separate.'),
    step('install', 'offline', 'Installation is optional', 'Use your browser’s Install app or Add to Home Screen option if it is available. This opens the same app; it does not create automatic backup or synchronization. Wiwo cannot point inside browser menus.'),
    step('update', 'offline', 'Finish work before an update', 'Wait for edits to save, then close all Sheetquo tabs and installed windows. Reopen to use the waiting update. The app does not force a reload while you are editing.'),
    step('storage', ['storage', 'offline'], 'Protect the local records', 'Different browsers, profiles, devices and addresses/ports have separate storage. Clearing site data removes records. Ask the browser to keep data when supported, but still export backups. Avoid private windows for permanent work.'),
  ],
  recovery: [
    step('save', ['save-failed', 'quote-save', 'mapping-check', 'recovery', 'storage'], 'Keep unsaved work open', 'If a draft or mapping save fails, do not close the page. Read the error, free storage if needed, and use Retry saving. Wiwo cannot save the missing data for you or bypass the leave warning.'),
    step('validation', ['mapping-check', 'quote-summary', 'import-review', 'recovery'], 'Fix the named problem', 'Follow the diagnostic to the affected field or mapping. Missing prices are not FREE; merged mappings use top-left anchors. Shorten/split text or enlarge its mapped area when it exceeds Excel height limits.'),
    step('missing', ['recovery', 'template-list', 'history', 'business-switcher'], 'Check the business and browser', 'A missing template or quotation may belong to another business or browser profile. Switch to its owner when offered, restore an archived record deliberately, or restore a trusted backup. Do not clear site data as a troubleshooting shortcut.'),
    step('generation', ['generate', 'import-review', 'recovery'], 'Read import and generation errors', 'Use a valid unencrypted XLSX and supported layout. Unsupported formulas/features or archive limits need correction. If generation fails, resolve its diagnostic and retry; do not send an old or incomplete output.'),
    step('interrupted', 'wiwo-toggle', 'Resume Wiwo when you are ready', 'A dialog or unexpected navigation can pause guidance. Finish or cancel that operation, then reopen Wiwo for the current screen. Close and Escape always cancel the tutorial. Reset learning in Settings if another person starts using this browser.'),
  ],
}
