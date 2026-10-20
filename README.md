# Voip Portal

React + Node.js/Express + PostgreSQL workspace for Balitech’s manual VoIP reporting.

## Start locally

Node.js 20.19+ (or 22.12+) and PostgreSQL are required.

1. Copy `.env.example` to `.env` if `.env` does not already exist.
2. Set your PostgreSQL credentials. The existing database name is **Voip_portal** (case sensitive).
3. Run `npm install`, then `npm run dev`.
4. Open http://127.0.0.1:5173 and create your administrator account.

The backend adds its own `voip` schema inside the existing database. It does not replace any existing tables. The database itself must already exist. Credentials stay in `.env`, which is excluded from Git.

## Daily workflow

- Create a report with a start date, shift times and selected dialers.
- The default night shift is 6:30 PM–4:30 AM, in US Eastern (America/New_York), with 20 half-hour slots. EST/EDT adjusts automatically. Existing Asia/Karachi reports display converted Eastern dates and time slots without changing their original saved data.
- Enter **interval spend in USD**, not a cumulative meter reading. Enter `0` for confirmed zero spend; leave unreported intervals blank.
- Row totals, campaign totals and running totals update immediately as you type. Click **Save changes** to persist them and refresh the overview and audit log.
- Changing or clearing a value is recorded in the audit trail.
- **Download report** exports the full saved sheet with interval columns and totals, regardless of table filters. Save drafts before downloading.
- Use **Add dialer row** in a daily report or campaign group to attach an existing dialer or create a new one. Existing amounts and unsaved drafts stay in place. The change is transactional and recorded in the audit log.
- The date picker supports Today, Yesterday, This Week, Last Week, This Month, Last Month and Custom Range (up to 366 days). Weeks start on Monday and dates use US Eastern. Reports are grouped by the Eastern shift start date, including overnight shifts. Activity timestamps and CSV report slots also use Eastern time.
- Campaign KPI cards show spend, share of total spend and dialer counts for the selected date range.
- Edit campaigns and dialers from the directory. Delete hides them from new reports; **Show deleted** allows restoration. Existing report snapshots remain intact.
- Use the pencil beside a report row to rename it, clear its entries or remove it from that report. Removed rows can be restored with their saved values. Other rows' unsaved edits are preserved.
- Overview aggregates every report in the selected range. **Download range** exports all interval records from those reports, including unreported cells. Daily reports lets you select an individual report inside the same range.
- Multiple reports may have the same date (different teams or shifts).
- If someone else saves the report first, the server rejects a stale save. Copy any pending edits you need, reload, and re-enter them.

Initial campaign and named dialer structure follows the reference Google Sheet. Blank rows and duplicate placeholder “ACA” rows are omitted. Original financial values are **not imported**: source totals, dates, and final time-slot labels are inconsistent. The portal separates totals from the 20 actual intervals and calculates all totals from saved entries.

This is a manual reporting portal. It does not fetch dialer APIs or synchronize Google Sheets.

## Vendor reporting

- **Vendors** is a separate directory with add, edit, delete and restore. The seven initial vendor names match the reference vendor sheet; source amounts are not imported.
- **Vendor reports** uses ten hourly columns, 6 PM–4 AM in America/New_York, grouped by the shift's Eastern start date. It is separate from the dialer half-hour reports.
- Create a report with selected vendors, enter interval spend and save. Row totals, hourly totals and cumulative totals update as you type. Zero is recorded; blank is unreported.
- Date presets and custom ranges filter reports. Download a single report or all vendor reports in the selected range as CSV.
- Save drafts before adding, renaming, clearing, removing or restoring report rows. Removed rows retain their saved amounts for restoration. Vendor directory changes do not rewrite historical report names.
- Overview includes a distinct vendor spend section and vendor cards. Vendor amounts are never added to the dialer total, avoiding double counting the same operations.
- Saves and row changes use optimistic versions, database transactions and a report activity history. The additive migration creates `voip.vendors`, `voip.vendor_reports` and `voip.vendor_audit`; original dialer reports are retained.

## Commands

```text
npm run dev      React on 5173; API on 3001
npm run build    Production frontend
npm start        Serve frontend + API on 3001 after a build
npm test         Unit tests and isolated PostgreSQL integration tests
npm run format  Format source files
npm run format:check  Check source formatting
```

Integration tests create and remove a uniquely named `voip_portal_test_<pid>` database. The configured user needs permission to create databases. They never populate or clear your real reports.

## Project structure

```text
src/
  app/          Application state, navigation and page composition
  pages/        Login, overview, daily report, dialer directory, activity
  components/   Date picker, modals, KPI cards and reusable controls
  services/     API client
  utils/        Date presets, draft calculations, aggregation and CSV export
  styles/       Base styles and compact workspace theme
server/
  routes/       Authentication, catalog, reports and date-range endpoints
  validation/   Shared request schemas
  config/       Initial campaign and dialer definitions
  db.js         PostgreSQL connection and schema initialization
  app.js        Express middleware and route registration
shared/         Currency totals and shift calculations used by client/server
tests/          Unit and PostgreSQL integration coverage
```

## Security and hosting

Passwords use bcrypt. Sessions use random tokens stored as hashes in PostgreSQL and expire after 12 hours. Cookies are HttpOnly and SameSite Strict. Writes check request headers and origins. Authentication is rate limited. SQL uses parameters; saves are transactional and version checked.

First-run setup creates a Super Admin. The role migration promotes the original (oldest) existing account to Super Admin once, without changing its password. Super Admin can access every module and create, edit, delete or restore Admin and Super Admin accounts under **Users**. Admin can access all operational modules but cannot manage users or read activity, including activity embedded in report responses. Permissions are checked on the server for every request.

User edits support name, email, role and an optional new password. Email, role or password changes revoke existing sessions. Deleting an account blocks login and ends sessions while preserving report history; **Show deleted** provides restoration. Super Admins cannot delete or demote their own account. Updates use version checks to prevent overwriting concurrent edits. The topbar profile card shows account details, access and reporting timezone, with a sign-out action.

Daily and vendor reports belong to their creator. Every account (including Super Admin) sees only its own reports, dashboard totals and exports, and can only edit its own report rows and entries. Existing reports retain their original creator; no data is copied into new accounts. Campaign, dialer and vendor directories remain shared reference lists. Super Admin retains the workspace activity log for oversight and user management.

The supplied Go Connectivo logo appears on the login page and sidebar. Date filters initially select **Today**, calculated in America/New_York, and follow Eastern midnight when no unsaved entries are present. Existing report time slots continue to display in Eastern time. Admin provisioning credentials are stored under ignored `private/`; this folder is never served as a web asset.

Finish first-run setup before exposing the server to other users. The app is bound to `127.0.0.1` by default. This release does not provide email invitations, password-reset email or live dialer integrations.

For hosting, use HTTPS, set `NODE_ENV=production`, configure `APP_ORIGIN` to your exact HTTPS URL, and set `HOST` for your deployment. Production cookies require HTTPS. Restrict access to PostgreSQL and back up the `Voip_portal` database. Google Fonts are optional; local sans-serif fallbacks render if the network is unavailable.
