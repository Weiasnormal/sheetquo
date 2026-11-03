# Sheetquo

Local-first quotation automation built around Excel templates. Paste a request, review the details, and download a
real, editable `.xlsx` that keeps your own template's layout. Everything runs in the browser, with no backend.

**Status:** Phases 0–9 and the follow-up implementation audit are complete. See [completion review](docs/COMPLETION_REVIEW.md)
for verification and remaining owner acceptance. Excel Online and physical printer acceptance are still pending. Businesses can be saved,
switched, and backed up, and your own `.xlsx` templates can be imported, mapped, tested, and made active. Quotations
can be made by pasting a message or typing the items, reviewed line by line, saved as drafts, and downloaded as Excel.
Print settings include margins, centering, repeated headings, and estimated page breaks that keep the footer together.
Backups can be previewed and restored with conflict choices; customer drafts are opt-in. The production build saves
app assets for offline use and waits for all windows to close before activating updates.

## Requirements

- Node.js 24.15+ or 22.22.2+ (the test DOM dependencies require these versions). `.nvmrc` pins 24.15.0; the completion
  checks use this runtime. The globally installed Node was not changed.
- Excel Desktop on Windows, only for `excel:verify` and `excel:fixtures`

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Starts the development server |
| `npm run build` | Type-checks and builds the static site |
| `npm run preview` | Serves the built site |
| `npm run lint` | Runs ESLint |
| `npm run typecheck` | Runs the TypeScript compiler |
| `npm test` | Runs the tests and writes samples to `output/excel-spike/` |
| `npm run test:e2e` | Builds, then tests restore and offline use in temporary Chrome profiles on localhost |
| `npm run excel:verify` | Checks those samples in real Excel Desktop |
| `npm run excel:fixtures` | Rebuilds the Excel-saved test fixtures |

## Layout

- `src/app`: routes and app-level wiring.
- `src/components`: the layout, UI primitives, and form fields.
- `src/features`: pieces of a screen that belong to one feature.
- `src/domain`: business rules, with no React and no Excel library.
- `src/infrastructure/excel`: the workbook engine, behind `WorkbookAdapter`.
- `src/test/fixtures/synthetic`: synthetic templates and data. Real customer data never goes here.
- `tests/integration`: engine tests that generate and reopen workbooks.
- `scripts/excel`: PowerShell checks that drive Excel Desktop.
- `docs`: spec, brand guide, compatibility results, decisions, test plan, and handoff.

## Privacy

Quotation and template data stay in the browser. Keep private workbooks in `private/` or `reference-workbooks/`, which
Git ignores.

## Offline and backups

Run `npm run build` then `npm run preview`. Open Settings and wait for **Ready for offline use** before disconnecting.
Offline caching is disabled in the development server. Hosting needs HTTPS (localhost works for testing) and SPA
fallbacks to `index.html`. No deployment was performed. See [the user guide](docs/USER_GUIDE.md) for backup/restore,
installation and printing, and [dependency review](docs/DEPENDENCY_REVIEW.md) for known advisories.
