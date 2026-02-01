# SSDT Implementation Plan

This file is a reference for future implementation sessions. Each section is an independent task that can be tackled one at a time. Read this file first, then ask user to pick a task to work on.

---

## TASK 1: VirusTotal API Removal

### Why
VirusTotal API is being removed from the scanning pipeline. All references to VT must be removed from frontend, backend, database, and documentation.

### Critical Note
`virustotalRoutes.js` is NOT just a VT route file - it is the **entire scan orchestration engine**. It handles combined-analysis, active-scan polling, historical scan loading, PDF export, JSON export, and scan stopping for ALL scanners. **Do NOT delete this file. Do NOT rename this file. Do NOT change the `/api/vt` route prefix.** The filename and route prefix are legacy but changing them would require updating every frontend API call for zero benefit. Only remove VT-specific logic from within the file.

### Backend Changes

**`backend/services/virustotalService.js`** - DELETE entire file
- Contains: `scanFile()`, `scanUrl()`, `getAnalysis()`, `getFileReport()`
- VT API key usage, rate limiter, axios calls to `https://www.virustotal.com/api/v3`

**`backend/routes/virustotalRoutes.js`** - MAJOR REFACTOR (keep filename and `/api/vt` prefix as-is)
- Remove: `import` of virustotalService at top (line 5)
- Remove: `POST /file` endpoint (lines 56-128) - file upload to VT
- Remove: `POST /url` endpoint (lines 131-192) - URL submission to VT
- Remove: `GET /analysis/:id` endpoint (lines 195-241) - VT analysis retrieval
- Remove: In `GET /scan/:analysisId` historical loader - VT data return (lines 324-327: `response.vtData`)
- Remove: In `GET /active-scan` - `vtStats` extraction (line 440), `hasVtResult` flag (line 573), `vtStats` in response (line 583), `vtResult` in response (line 590)
- Remove: In `POST /combined-url-scan` - VT API calls (lines 628-646), comment on line 610
- Remove: In `GET /combined-analysis/:id` - VT polling (lines 721-747), `vtResult` passed to refineReport (line 1069), `vtStats` extraction (line 1143), `vtStats` in response (line 1292), `hasVtResult` (line 1282), `vtResult` in response (line 1299)
- Remove: `GET /file-report/:hash` endpoint entirely (lines 1443-1465) - pure VT endpoint
- Update: JSON export to exclude `virusTotal` section (line 1378)
- Keep: Combined-analysis orchestration (ZAP, WebCheck, Observatory, PageSpeed, urlscan, Gemini)
- Keep: Historical scan loading, PDF export, JSON export, scan stopping
- Keep: Route registration in server.js as `/api/vt` - do NOT change the prefix

**`backend/server.js`**
- Line 15: Remove `VT_API_KEY` from required env vars validation
- Line 67: Keep route registration as `/api/vt` - do NOT rename

**`backend/models/ScanResult.js`**
- Line 20-24: Remove `vtResult: Object` field from schema
- Note: Existing documents in MongoDB will still have this field; it just won't be used

**`backend/services/geminiService.js`**
- Lines 31-32: Update function docs to remove VT mention (vtReport param)
- Lines 63-67: Remove VT stats extraction (vtStats, vtTotalEngines, vtMaliciousCount, vtSuspiciousCount, vtCategories)
- Lines 117-122: Remove VT section from Gemini prompt (Total Engines, Malicious Detections, etc.)
- Line 176: Remove "Risk level based on VirusTotal results" from Gemini task instructions
- Lines 367-397: Remove VT extraction AND VT text block from `formatScanDataForPdf()` (vtStats at 367-373, overallRisk at 373, VIRUSTOTAL ANALYSIS text at 392-397)
- Lines 468-476: Remove "virustotal" section from PDF JSON template (id, title, items array)
- Line 463: Update `overallRisk` in executive summary - currently derived from VT malicious count, needs new derivation (e.g. from ZAP severity)
- Update: AI now synthesizes from 6 scanners instead of 7

**`backend/routes/zapAuthRoutes.js`** - REFACTOR (remove VT calls, keep everything else)
- Line 24: Remove import of `scanUrl, getAnalysis` from virustotalService
- Lines 240-258: Remove VT URL submission (`scanUrl(url)`) and initial vtResult storage (`vtAnalysisId`, error handling)
- Lines 286-295: Remove VT completion status check in polling loop (`getAnalysis()` call, vtResult update)
- Lines 302-303: Remove VT completion from fast-scan trigger logic (`vtDone`, `needsFastScans`)
- Line 470: Remove `vtResult` being passed to `refineReport()`
- Line 510: Remove `vtStats` extraction
- Line 632: Remove `hasVtResult` flag in response
- Line 642: Remove `vtStats` in response
- Line 650: Remove `vtResult` from response object
- Keep: All ZAP, WebCheck, Observatory, PageSpeed, urlscan, Gemini logic
- Keep: PDF export, JSON export, scan stopping

**`backend/services/pdfService.js`**
- Note: pdfService.js has NO hard-coded VT references. It renders sections generically from the JSON structure produced by geminiService.js. Removing VT from geminiService will automatically remove it from PDFs.
- No changes needed for this file (VT removal is handled entirely in geminiService.js)

**`backend/middleware/rateLimiter.js`**
- Line 113: Remove VT from rate limit comments
- Line 131: Remove "VirusTotal" from error messages

**`backend/.env.example`**
- Remove: `VT_API_KEY=your_virustotal_api_key_here`
- Note: Database name `virustotal-scanner` in MONGO_URI is legacy - do NOT rename (would lose existing data)

**`backend/package.json`**
- Line 2: Keep name as-is (do NOT rename)
- Line 4: Keep description as-is
- Line 12: Remove `"virustotal"` keyword (optional, cosmetic only)

### Frontend Changes

**`frontend/src/components/Hero.jsx`**
- Lines 84-87: Remove VT data extraction from historical scan (`hasVtResult`, `vtResult`, `vtStats`)
- Line 235: Remove `if (data.hasVtResult) progress = 30;` progress check
- Line 490: Remove `'Running VirusTotal scan...'` status message
- Line 591: Remove `'Running VirusTotal security scan...'` loading stage
- Lines 628-648: Remove VT data extraction (`vtStats`, `engines`, `categoryDescriptions`, `totalEngines`, `maliciousCount`, `suspiciousCount`, `maliciousPercentage`, `riskLevel`, `riskClass`)
- Lines 755-769: Remove VT Security score card (entire `<div className="score-card">` block)
- Lines 1412-1419: Remove "VirusTotal Security Details" summary section
- Lines 1449-1473: Remove "Detailed Engine Results" `<details>` table (VT engine breakdown)
- Note: Lines 174-181 are generic scan polling (`/api/vt/active-scan`), NOT VT-specific - do NOT remove
- Update: Score card count from 27 to ~24 (remove VT-related cards)

**`frontend/src/components/AuthenticatedScanPanel.jsx`**
- Line 825: Remove "Running VirusTotal..." progress message
- Lines 883-888: Remove VT data extraction and risk calculation
- Lines 937-943: Remove VT Security score card
- Lines 1460-1465: Remove "VirusTotal Security Details" section
- Lines 1488-1498: Remove Engine Results table

**`frontend/src/pages/ScanViewer.jsx`**
- No route changes needed - `/api/vt/scan/` prefix stays as-is

**`frontend/src/components/scanform.jsx`** (if exists)
- No route changes needed - `/api/vt/` prefix stays as-is

**`backend/services/zapService.js`** (comments only, cosmetic)
- Line 189: Comment references virustotalRoutes - update for accuracy
- Line 194: Comment says "called from virustotalRoutes.js" - update
- Line 428: Comment says "backward compatibility with virustotalRoutes" - update

### Documentation
- `CLAUDE.md` - Update scanner count from 7 to 6, remove VT references
- `README.md` - Remove VT from architecture, API docs, env vars
- `HOW_TO_RUN.md` - Remove VT_API_KEY references
- `IMPROVEMENTS_SUMMARY.md` - Remove VT references
- `NEW ZAP GUIDELINE/AI_INSTRUCTIONS.txt` - Remove VT references

### Migration Considerations
- Route prefix stays as `/api/vt` - do NOT rename anything
- Database name stays as `virustotal-scanner` - do NOT rename (would lose data)
- Database: Old scans still have `vtResult` field - harmless, ignore
- Score cards: Renumber/recount after VT removal
- AI prompt: Gemini needs updated instructions (6 scanners, no VT data)
- Both `virustotalRoutes.js` AND `zapAuthRoutes.js` have VT integration - both must be cleaned

---

## TASK 2: Multi-Tenant Account System

### Why
Each company gets 1-5 accounts depending on plan tier. Need company-level grouping.

### Current State
User model already has:
- `accountType`: enum `['free', 'pro']` (default: 'free')
- `proExpiresAt`: Date
- `isPro()` method
- `getAccountLimits()` method returning scan limits
- Prototype `upgrade-to-pro` and `downgrade-to-free` endpoints in profile.js

### New Model: Company

**Create: `backend/models/Company.js`**
```
Company {
  name: String (required),
  plan: String (enum: ['trial1', 'trial2', 'light', 'basic', 'pro']),
  billingCycle: String (enum: ['monthly', 'annual', 'one-time']),
  planStartDate: Date,
  planExpiresAt: Date,
  maxAccounts: Number,        // 1 for light/trial, 3 for basic, 5 for pro
  maxTargetsPerMonth: Number, // 3, 5, or 10
  maxScansPerTarget: Number,  // 1, 3, or 10
  severityAccess: [String],   // ['High'] for Light or ['High','Medium','Low','Informational'] for Basic/Pro (ZAP has no "Critical" level)
  isActive: Boolean,
  createdAt: Date,
  updatedAt: Date
}
```

### Changes to Existing User Model

**Modify: `backend/models/User.js`**
- Add: `companyId: ObjectId (ref: 'Company')`
- Add: `role: String (enum: ['admin', 'member'])` - company admin vs regular user
- Update: `accountType` to derive from company plan (or remove in favor of company.plan)
- Update: `getAccountLimits()` to read from Company model

### Backend Changes

**Modify: `backend/middleware/auth.js`**
- After JWT decode, also fetch user's Company to attach plan info to `req.user`
- Add: `req.company` with plan details for downstream route handlers

**Create: `backend/middleware/planLimits.js`**
- Middleware to check scan limits before allowing new scans
- Check: scans this month for target < `company.maxScansPerTarget`
- Check: unique targets this month < `company.maxTargetsPerMonth`
- Check: total accounts under company < `company.maxAccounts`

**Modify: `backend/routes/auth.js`**
- Registration: Optionally accept `companyId` or invite code
- Login: Return company plan info with JWT

**Create: `backend/routes/admin.js`**
- `GET /admin/company` - View company details and member list
- `POST /admin/company/invite` - Invite new member (if under maxAccounts)
- `DELETE /admin/company/member/:id` - Remove member
- `GET /admin/company/usage` - View scan usage stats

**Modify: `backend/routes/profile.js`**
- `GET /profile` - Include company info and plan details
- Remove or update prototype upgrade/downgrade endpoints

**Modify: `backend/server.js`**
- Register admin routes: `app.use('/api/admin', apiLimiter, require('./routes/admin'))` (follows pattern at lines 66-79)

### Frontend Changes

**Create: `frontend/src/pages/AdminPanel.jsx`**
- Company dashboard: member list, usage stats, plan info
- Invite member form
- Only visible to users with `role: 'admin'`

**Modify: `frontend/src/App.js`**
- Add route: `<Route path="/admin" element={<AdminPanel />} />` (follows pattern at lines 40-48)

**Modify: `frontend/src/pages/Profile.jsx`** (or wherever profile is rendered)
- Show company name, current plan, usage vs limits
- Show plan expiry date

---

## TASK 3: Severity-Level Gating

### Why
Light plan users only see High severity vulnerabilities. Basic/Pro see all levels.

### Important: ZAP Risk Levels
ZAP uses exactly 4 risk levels: `High`, `Medium`, `Low`, `Informational` (see zapService.js line 404).
There is **NO "Critical" level** in ZAP. The Company model's `severityAccess` field should use ZAP's actual levels.
- Light plan: `['High']` (only High-severity alerts shown)
- Basic/Pro: `['High', 'Medium', 'Low', 'Informational']` (all alerts shown)

### Important: WebCheck Has No Severity Levels
WebCheck returns scan results (SSL info, DNS records, headers, etc.) without severity/risk classification. WebCheck data is informational and should NOT be filtered by severity. All plans see full WebCheck results.

### Where Filtering Happens
Filter at the **backend API response level**, NOT the frontend. The scanners still run full scans.

### Backend Changes

**Create: `backend/middleware/severityFilter.js`**
```javascript
// Utility function (not Express middleware - called within route handlers)
function filterBySeverity(scanResult, allowedLevels) {
  // Filter ZAP alerts by risk level (alert.risk field)
  // Adjust riskCounts to only include allowed levels
  // Adjust totalAlerts count
  // AI report: Regenerate with only allowed-level data, or post-filter sections
  // PDF: Only include allowed-level vulnerability details
}
```

**Modify: `backend/routes/virustotalRoutes.js`**
- In `GET /combined-analysis/:id` response builder (~line 1299):
  - After building the response, filter `zapResult.alerts` by `alert.risk` against allowed levels
  - Adjust `riskCounts` to zero out disallowed levels
  - Adjust `totalAlerts` count
- In `GET /active-scan` response builder: same filtering
- In PDF generation endpoint: filter before generating
- In JSON export endpoint: filter before exporting

**Modify: `backend/routes/zapAuthRoutes.js`**
- Same filtering in status polling response
- Same filtering in PDF/JSON export

### What Gets Filtered (Light Plan)
- ZAP alerts: Remove Medium, Low, Informational alerts (keep only `risk: "High"`)
- ZAP riskCounts: Zero out Medium, Low, Informational counts
- AI report: Regenerate prompt with only High-severity data (or post-filter sections)
- PDF: Only include High vulnerability details
- Score cards: ZAP alert counts reflect filtered data

### What Does NOT Get Filtered
- WebCheck results (informational data, no severity levels)
- PageSpeed scores (performance metrics, not vulnerabilities)
- Mozilla Observatory grade (overall grade, not individual findings)
- urlscan.io (screenshot + basic info)

### Frontend Changes
- No frontend changes needed if filtering is done at API level
- Score cards will automatically show filtered counts
- ZapReportEnhanced will automatically show filtered alerts

---

## TASK 4: Scan Limit Enforcement

### Why
Each plan has limits: scans per target per month, max targets per month.

### Backend Changes

**Create: `backend/middleware/scanLimits.js`**
```javascript
// Before starting any scan:
// 1. Count unique targets this month for the company
// 2. Count scans for this specific target this month
// 3. Compare against company.maxTargetsPerMonth and company.maxScansPerTarget
// 4. Return 403 with clear error if limit exceeded
```

**Modify: `backend/routes/virustotalRoutes.js`**
- Add scanLimits middleware to `POST /combined-url-scan` endpoint (line ~611)

**Modify: `backend/routes/zapAuthRoutes.js`**
- Add scanLimits middleware to `POST /scan` endpoint (line ~184)

**Create: Usage tracking aggregation query**
```javascript
// MongoDB aggregation on ScanResult collection:
// Group by target, count scans per target this month
// Count distinct targets this month
// Compare against plan limits
```

### Frontend Changes

**Modify: `frontend/src/components/Hero.jsx`**
- Before scan: show remaining scans/targets for the month
- On limit exceeded (403): show upgrade prompt

**Modify: `frontend/src/components/AuthenticatedScanPanel.jsx`**
- Same limit display and upgrade prompt

---

## TASK 5: Trial Plan (One-Time Use)

### Why
Trial 1: 1 scan, High only (same filtering as Light plan). Trial 2: 2 scans, all levels.

### Backend Changes

**Modify: Company model**
- Add: `trialScansRemaining: Number` (1 or 2)
- Add: `trialUsed: Boolean` (to prevent re-purchase)

**Modify: `backend/middleware/scanLimits.js`**
- For trial plans: check `trialScansRemaining > 0`
- After scan completes: decrement `trialScansRemaining`
- When 0: block further scans, show "Trial expired" message

### Frontend Changes
- Show "X scans remaining" for trial users
- After trial exhausted: show plan comparison and upgrade CTA

---

## TASK 6: Usage Tracking Dashboard

### Questionable Value
Most of what this task provides is already covered by Task 4 (scan limit display before scanning). The "last 6 months" history claim is **broken by design** - `ScanResult` has a 7-day TTL (`createdAt` index with `expires: 604800` in ScanResult.js line 71), so scan data auto-deletes after 7 days. Historical usage beyond 7 days requires a separate `UsageLog` collection.

Consider: Skip this task entirely, or reduce scope to just a "current month usage" widget on the Profile page (which Task 4 already partially covers). Only implement if customers explicitly request a dedicated usage page.

### Backend Changes (if implementing)

**Create: `backend/models/UsageLog.js`** (needed because ScanResult has 7-day TTL)
- Log each scan start: `{ companyId, userId, target, scanType, createdAt }`
- No TTL - persists for billing/history purposes

**Create: `backend/routes/usage.js`**
- `GET /usage/summary` - Current month usage vs limits (queries UsageLog, not ScanResult)
- `GET /usage/history` - Monthly scan counts (last 6 months, from UsageLog)
- `GET /usage/targets` - List of scanned targets with scan counts

**Modify: `backend/server.js`**
- Register usage routes: `app.use('/api/usage', apiLimiter, require('./routes/usage'))` (follows pattern at lines 66-79)

### Frontend Changes (if implementing)

**Create: `frontend/src/pages/UsageDashboard.jsx`**
- Progress bars: scans used vs limit, targets used vs limit
- Monthly usage chart (pure CSS, no chart libraries)
- Target list with scan counts
- Plan info with upgrade CTA if approaching limits

**Modify: `frontend/src/App.js`**
- Add route: `<Route path="/usage" element={<UsageDashboard />} />` (follows pattern at lines 40-48)

---

## TASK 7: Admin Panel

### Why
Company admins need to manage members, view usage, manage settings.

### Backend Changes

**Create: `backend/middleware/adminAuth.js`**
- Check `req.user.role === 'admin'`

**Create: `backend/routes/admin.js`**
- CRUD for company members
- Usage stats per member
- Plan management (view, not change - that's billing)

**Modify: `backend/server.js`**
- Register admin routes: `app.use('/api/admin', apiLimiter, require('./routes/admin'))` (follows pattern at lines 66-79)

### Frontend Changes

**Create: `frontend/src/pages/AdminPanel.jsx`**
- Member list with invite/remove
- Per-member scan stats
- Company-wide usage overview

**Modify: `frontend/src/App.js`**
- Add route: `<Route path="/admin" element={<AdminPanel />} />` (follows pattern at lines 40-48)

---

## Implementation Order (Recommended)

1. **TASK 1: VirusTotal Removal** - Clean up the codebase first
2. **TASK 2: Multi-Tenant Accounts** - Foundation for everything else
3. **TASK 3: Severity Gating** - Highest-value differentiator between plans
4. **TASK 4: Scan Limits** - Enforce plan boundaries
5. **TASK 5: Trial Plans** - Enable sales pipeline
6. **TASK 6: Usage Dashboard** - Questionable value (see notes), consider skipping or reducing scope
7. **TASK 7: Admin Panel** - Company self-service

Tasks 3, 4, and 5 all depend on Task 2 (Company model). Task 1 is independent and can be done anytime.

---

## File Reference Quick Index

### Files that need changes for MOST tasks:
- `backend/models/User.js` - Add companyId, role
- `backend/models/ScanResult.js` - Remove vtResult (Task 1). Note: has 7-day TTL on createdAt
- `backend/middleware/auth.js` - Attach company/plan info
- `backend/routes/virustotalRoutes.js` - Scan orchestration (keep filename as-is)
- `backend/routes/zapAuthRoutes.js` - Auth scan orchestration
- `backend/services/geminiService.js` - AI prompt and PDF data formatting
- `backend/server.js` - Route registration (lines 66-79), env validation (line 15)
- `frontend/src/App.js` - Frontend route registration (lines 40-48)
- `frontend/src/components/Hero.jsx` - Normal scan UI
- `frontend/src/components/AuthenticatedScanPanel.jsx` - Auth scan UI
- `frontend/src/pages/ScanViewer.jsx` - Historical scan loading
- `CLAUDE.md` - Project documentation

### New files to create:
- `backend/models/Company.js` (Task 2)
- `backend/models/UsageLog.js` (Task 6 - needed because ScanResult has 7-day TTL)
- `backend/middleware/planLimits.js` (Task 4)
- `backend/middleware/severityFilter.js` (Task 3)
- `backend/middleware/adminAuth.js` (Task 7)
- `backend/routes/admin.js` (Tasks 2, 7)
- `backend/routes/usage.js` (Task 6)
- `frontend/src/pages/UsageDashboard.jsx` (Task 6)
- `frontend/src/pages/AdminPanel.jsx` (Tasks 2, 7)

### Files to DELETE:
- `backend/services/virustotalService.js` (Task 1)
