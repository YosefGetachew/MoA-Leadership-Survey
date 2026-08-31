# MoA Leadership Assessment Survey

This application uses the Ministry of Agriculture's final leadership questionnaire (Vf1), preceded by evaluator information. Respondents identify their own role as Senior Leadership, Middle Leadership, Lower Leadership, or Expert, then assess all three leadership levels. Every statement is rated from 1–5 or N/A. Sex, age and work experience are required. Name, email, phone/contact, organization and job title are not collected.

## Architecture

- `frontend/` — React 19 + TypeScript + Vite
- `backend/` — Node.js + Express REST API
- PostgreSQL — dedicated leadership assessment responses and staff accounts

## Quick start with PostgreSQL

1. Start the locally installed PostgreSQL Windows service and create a database named `moa_reform_feedback`.
2. Create config: `Copy-Item backend/.env.example backend/.env`, then enter the local PostgreSQL username and password.
3. In `backend/`, run `npm install`, `npm run db:migrate`, then `npm run dev`.
4. In `frontend/`, run `npm install`, then `npm run dev`.

Open `http://localhost:3000`. The API runs on `http://127.0.0.1:5001`, and Vite proxies `/api` during development.

Change `MINISTRY_ADMIN_PASSWORD` and `MINISTRY_ADMIN_SESSION` before using the system outside local development.

## Questionnaire coverage

Every respondent completes evaluator information, then 69 statements in order: 23 Senior Leadership statements, 28 Middle Leadership statements, and 18 Lower Leadership statements. The seven overall reform questions have been removed from the active survey. Expert is a respondent category, not a fourth assessment section: the source questionnaire provides only three leadership sections. The form uses 16 pages, section-local question numbering (Senior 1–23, Middle 1–28, Lower 1–18), and the existing English/Amharic rating matrix and page-level Clear choices control.

No assessed position, sector or institution is requested. Sex must be Male or Female; age must be a whole number from 18 to 100; total work experience must be whole years from 0 up to age. Both year fields preserve the typed value, including decimals, and show a warning for non-whole-number entries; they never strip decimal points or silently round. A valid whole number is required to continue. Respondents round up any extra months to the next year: 45 years and 5 months becomes 46; 10 years and 3 months of work experience becomes 11. Exactly whole years stay unchanged, and no work experience is entered as 0. These fields, the respondent category and all 69 ratings are required for one complete submission; N/A is valid. Respondent classifications include explanations, with Team Leads and Desk Heads under Lower Leadership.

The protected administration page provides response counts, average scores, N/A rate, item analysis, respondent categories, sex, age, work experience, and CSV export. A full submission contributes once to each leadership-level count and once to the overall submission count. Earlier single-level responses remain available through a separate version selection. Name, contact and optional work details are excluded from the current admin results and CSV.

The admin-only CSV contains 77 columns: response ID, survey version, assessed levels, evaluator leadership level, sex, age, work experience, submission time (UTC), and 69 ratings grouped as Senior 1–23, Middle 1–28 and Lower 1–18 with stable question codes. Ratings export as numeric 1–5 or N/A; missing answers and demographics from earlier submissions stay blank, not inferred. Registry, assessed-position/institution and overall-reform columns are omitted without deleting historical database records. Downloads use UTF-8 with a BOM for Excel compatibility.

## Results analysis

The results page defaults to the current questionnaire version. Version and evaluator-category filters apply to all analysis panels and recent submissions; the From/Through date controls have been removed. Earlier versions are never pooled with the current version; historical reform questions are excluded from leadership metrics. CSV still exports all retained versions, independently of the dashboard filters.

- Leadership comparison: six-category rating distributions, favorable (4–5), neutral (3), unfavorable (1–2), N/A, median and sample standard deviation. Headline/item means weight valid ratings equally. Leadership-level comparison means first average within each qualifying submission, then weight submissions equally.
- Question analysis: lowest/highest five statements with at least five valid ratings; all 69 items remain searchable and sortable by score, code or N/A rate. Small samples are flagged. Rankings are relative, not performance targets or significance tests.
- Demographic comparisons: evaluator category, sex, age bands (18–29, 30–39, 40–49, 50–59, 60–100) and experience bands (0–5, 6–10, 11–20, 21+). Section scores need at least half the section's questions rated 1–5 (12 Senior, 14 Middle, 9 Lower). Group means are withheld below five qualifying submissions. The composite averages the three section means equally within each submission before averaging submissions; all three sections must qualify.
- Correlations: descriptive Pearson correlations between paired section means, requiring at least ten qualifying pairs and nonzero variation in both scores. They are not causal effects or determinant factors, and no significance tests are claimed.
- Quality: actual question completeness (including N/A), missing/invalid ratings, all-N/A submissions, missing/invalid demographics and uniform-rating flags (at least ten identical valid ratings). Flags never remove data automatically. N/A is excluded from means, never treated as zero or six; missing answers remain distinct from N/A.

The questionnaire allows one response per browser per survey period for ordinary evaluators and viewers. Signed-in administrators see **Start another evaluation** after completing a response. The restart API verifies the admin role, an open/current period and an existing completed attempt, then issues a separate HttpOnly admin-attempt cookie; it never clears the ordinary respondent cookie. Each attempt still has database duplicate protection. Previous responses remain saved and count in the results. Signing out does not grant public repeat privileges through an admin-attempt cookie.

A respondent cookie is issued before starting and is required for submission. This anonymous mechanism does not identify a person across devices, private-browsing sessions or cleared cookies, and shared browsers can block a different person. Strict one-response-per-person enforcement requires authenticated identities or unique invitation codes. Earlier responses are retained and are not deduplicated. Response/non-response rates cannot be calculated without unique eligible/invited staff and response tracking. Means assume equal spacing on an ordinal scale; associations and small score gaps must not be treated as causal, representative or statistically significant. The display thresholds are safeguards, not guarantees of reliability. The page includes definitions and limitations alongside the relevant measures. Results remain staff-authenticated; the API returns aggregates and the existing bounded recent-submission metadata, not full response JSON or obsolete registry fields.

## Admin-controlled collection periods

In the admin page, use **Survey availability** above the results:

1. Choose **Open now** or **Schedule for later**. Enter a closing date/time and, for a schedule, a future opening date/time. Each date control supports **Ethiopian (E.C.)** or **Gregorian (G.C.)** entry, with Ethiopian dates selected initially. Use hour, minute and AM/PM controls in Ethiopia time (UTC+3), not the traditional six-hour-shifted Ethiopian clock. Optional 1-, 3- and 7-day shortcuts set the closing time.
2. Select **Review & open survey** or **Review schedule**, check the readable date summary, then confirm. You can go back to edit without changing availability.
3. Collection opens at the start and automatically closes at the end. While open, the panel shows the actual dates and a **Close survey** action instead of disabled setup fields. A scheduled window offers **Cancel scheduled survey**. Both require confirmation and preserve saved responses. Close or cancel an enabled window before creating a replacement.
4. When closed, visitors see “There is no survey at this time” and the most recent actual survey period's start, end and duration. A cancelled future window is not shown as a completed survey. Before any tracked period has run, no historical duration is invented from old responses. Scheduled upcoming dates are also displayed.

Public messages and section-completion screens are available in English and Amharic. After Senior, evaluators see a completion screen before continuing to Middle; after Middle, they continue to Lower; after Lower, they review or submit the full assessment. These screens do not submit partial results. Existing questions, numbering and answers remain unchanged.

Availability is stored in PostgreSQL (`survey_control` and `survey_periods`) and persists through backend restarts. Only admin-role users can change it; viewers cannot. Concurrent admin edits are rejected if the control revision changed. Submission acceptance locks the control row and checks the period at insertion time, so a form left open cannot bypass closure. New responses carry a `survey_period_id`; existing responses remain unchanged. Browser submission checks and drafts are period-specific, so a new period does not reuse an earlier assessment. Old unscoped drafts are not imported into a new period.

Availability dates show Ethiopian first and Gregorian underneath, with 12-hour AM/PM times. Calendar conversion uses the runtime's Unicode Ethiopic calendar, including Pagume and leap-day validation; Ethiopian entry supports years 1900–2200 E.C. Both calendar choices save the same UTC instants, so switching calendars does not shift collection times. Confirmation, history and the public closed-survey screen use both calendars. Deploy the frontend and backend together for the administrator repeat option; no additional database migration is required for this change.

Every active survey page, including the introduction, evaluator details and section transitions, displays the collection opening and closing dates in both calendars and a live days/hours/minutes countdown. The notice supports English and Amharic and uses the API server clock as its time reference. This is the shared collection deadline, not an individual time allowance; it does not extend when an evaluator starts or navigates to another page. Existing server-side closure checks still control submission acceptance.

The notice is collapsed into a compact notification by default: survey status and remaining time stay visible. Select **View dates** to expand the Ethiopian/Gregorian opening and closing dates, or **Hide dates** to collapse them again.

The public form checks status every 15 seconds, on window focus and at schedule boundaries. The API enforces closure immediately regardless of browser polling. Status checks that fail show an availability warning, not an open questionnaire. Admin results use the selected questionnaire version and evaluator category without date controls; CSV continues to include all retained submissions.

## Updating an existing installation

Deploy the frontend and backend together for survey version `leadership-demographics-v4`; older frontend payloads without the current period ID cannot submit to the new API. Back up PostgreSQL first. Normal backend startup runs the additive schema upgrade (nullable demographics, prior all-levels changes, collection-period tables and the response-period link) without deleting earlier submissions. Include `backend/survey-window-schema.sql` with the backend files. On first upgrade, collection defaults to OFF: sign in as an admin and enable the first collection window. Later restarts preserve the configured window and never reopen an expired or manually closed survey. Do not run the initial database setup solely for this upgrade; it also refreshes seeded configuration/accounts.

Older questionnaire browser drafts are not imported into this revised questionnaire. New drafts save all three sections locally, with evaluator demographics but without name/contact/work-information fields. Existing historical database name/contact values are retained, not erased. Build and copy the frontend, restart the survey backend, and refresh the browser after deployment. This change needs no FTMS or IIS binding changes.

## Tests

Run `npm test` in both `backend/` and `frontend/`, then `npm run build` in `frontend/`. API tests use an in-memory database double and never submit to PostgreSQL.

Optional PostgreSQL verification: run `node test/postgres-window-check.cjs` from `backend/`. It verifies the additive period schema and actual submission-gate SQL inside a temporary schema in one rolled-back transaction; it does not change existing survey records.

## Production

Run `npm run build` in `frontend/`, deploy `frontend/build` as static files, and run `backend/server.js` behind a reverse proxy. Use TLS, a long random session secret, a dedicated PostgreSQL role, database backups, and an explicit `ALLOWED_ORIGINS` value.

See [DEPLOYMENT.md](DEPLOYMENT.md) for Git push instructions and the complete Windows Server, IIS, PM2, and PostgreSQL deployment procedure.

## Final Word wording verification

English questions and leadership descriptions follow `Revised Likert Scale Survey Tool file_Vf1.docx`; Amharic follows `Amharic Version lIkert Scale Instruments.docx`. The role picker and section headings share their descriptions. Original spelling, punctuation, repetitions and internal spacing are preserved, including apparent source typos. Only leading/trailing table whitespace and printed Amharic number prefixes are removed; the UI supplies the numbers. The Senior title is retained as requested (the English source calls this High-Level Leadership). Expert remains a respondent category added by request, not a section or definition supplied by these documents.

The source-fidelity tests check all 138 language-specific statements and all six descriptions against the extracted Word snapshot in `frontend/tests/fixtures/final-word-questionnaire.json`. They also check that each section restarts at 1.
