# NES Staff Scorecard v1
Agent build brief for Antigravity

## Executive summary
NES is implementing a standardized monthly staff scorecard for Direct Support Professionals (DSPs) and related frontline roles. The goal is to replace inconsistent, ad-hoc performance evaluation with a repeatable system that:
- Produces a defensible score per staff member per month
- Separates perspectives across three evaluator roles (Admin, Supervisor, Recruiter)
- Enables area leadership to track performance trends and follow up consistently
- Supports a clean dashboard for KPIs and coaching workflows

The current Google Sheets + Google Forms implementation worked for prototyping but is bloated and hard to maintain. Version 1 moves to an app-first, database-first design (Cloud Run) with simple workflows and strict data integrity.

Pilot areas: **South Valley** and **Price**.

## Why we’re doing this
### Problems today
- Performance assessment varies widely by area and evaluator.
- Tracking is manual, spreadsheet-heavy, and fragile (silent formula issues, inconsistent dropdowns, hard to audit).
- Leadership cannot reliably compare performance across time or find “what changed” drivers for a staff member’s score.

### Outcomes we want
- A monthly score that can be trusted and explained quickly.
- Clear drilldowns: “why did this person’s score drop?”
- Completion tracking: which evaluations are missing and who owns them.
- A platform flexible enough to evolve KPIs later (beyond the initial rubric).

## Core scorecard model
The scorecard is a weighted blend of three category scores. Each category starts at 100 and gets deductions based on the rubric.

**Weights**
- Admin: 40%
- Supervisor: 40%
- Recruiter (Staffing Manager): 20%

**Final score**
`Final = AdminScore * 0.4 + SupervisorScore * 0.4 + RecruiterScore * 0.2`

The current rubric and example scoring are defined in the scorecard slides. :contentReference[oaicite:0]{index=0}

## Rubric and deductions (from slides)
Each categorical score starts at **100**. Deductions apply per category. :contentReference[oaicite:1]{index=1}

### Supervisor qualitative ratings
For each attribute rated (Attitude, Reliability, Proactivity, Flexibility, Interaction with Individuals), deductions are:

- Outstanding: -0
- Exceeds Expectations: -3
- Meets Expectations: -8
- Needs Improvement: -13
- Unsatisfactory: -20 :contentReference[oaicite:2]{index=2}

### Admin objective errors
Admin category includes metrics like ISP/MAR/Attendance and a qualitative “Interaction with Individuals” rating.

Slides include:
- Admin errors bucket logic:
  - 1–2 errors: -5
  - 3–5 errors: -10
  - 6+ errors: -20 :contentReference[oaicite:3]{index=3}

The slides also show specific examples (these are representative and should be implemented exactly as the rubric definition in v1):
- 2 ISP Goal Errors: -5
- 4 ISP Behavior Errors: -10
- 1 MAR Error: -5
- 3 Attendance Errors: -10 :contentReference[oaicite:4]{index=4}

### Recruiter (Staffing Manager) objective deductions
- Overdue trainings: -15 **per overdue training**
- EDAs in past 6 months:
  - 1 EDA: -40
  - 2+ EDAs: -80
- Retrainings (this month):
  - 1 retraining: -5
  - 2+ retrainings: -10 :contentReference[oaicite:5]{index=5}

### Notes on rubric implementation
- Store the rubric as a versioned JSON object.
- Every computed score must record the rubric version used.
- Persist both raw submissions and computed scores with deductions breakdown for auditability.

## What data is collected
Historically, each area had 3 Google Forms (Admin, Supervisor, Recruiter). We are moving to custom in-app forms, but the fields remain.

### Admin submission fields (monthly, per staff)
- Staff (selected from dropdown; should be `Name — EmployeeID`)
- Supervisor name (legacy; likely removable in-app)
- Evaluation period (month)
- ISP Goals: number of errors
- ISP Behavior: number of errors
- MAR: number of errors
- Attendance Issues: Tardies & Same-Day Call Outs (count)
- Attendance Issues: No Call No Shows (count)
- Individual Interaction rating (qualitative)

### Supervisor submission fields (monthly, per staff)
- DSP
- Supervisor evaluator (logged in; do not ask them to pick themselves)
- Evaluation period (month)
- Ratings for:
  - Attitude
  - Reliability
  - Proactivity (Initiative)
  - Flexibility
  - Individual Interaction

### Recruiter submission fields (monthly, per staff)
- DSP
- Recruiter evaluator (logged in)
- Evaluation period (month)
- Number of overdue trainings
- Number of retrainings
- Number of EDAs in the past 6 months

## Critical workflow requirements for v1
### Integrity rules
- No edits after submit (v1).
- No duplicates:
  - One submission per `(employee_id, month, role, area)`.
- Partial completion allowed:
  - Category scores exist when that category’s submission exists.
  - Final blended score exists only when all three submissions exist.

### Supervisor evaluation assignments (key v1 design)
Paylocity does not track reporting lines reliably, and “floaters” exist. Therefore, supervisor evaluations cannot be automatically scoped based on org hierarchy.

Instead: **Admin assigns supervisor evaluators each month**.

- House managers (usually Gmail accounts) evaluate DSPs they supervised most that month.
- If evaluating a House Manager, an admin fills the Supervisor scorecard.

**House manager view**
- They cannot see “all staff.”
- They see only the DSPs assigned to them for the selected month.
- There is no staff dropdown for house managers; they launch an evaluation from their assigned list.

**Admin view**
- Admin sees all DSPs in their area for the month and can assign a supervisor evaluator.
- Admin sees a running count/list of unassigned DSPs.

**Carry forward month-to-month**
- Admin can initialize a new month by copying prior month assignments:
  - For every active DSP in current roster:
    - Copy prior evaluator if it exists
    - Otherwise set to unassigned
  - Never overwrite existing assignments for the target month unless admin explicitly changes them.

## Authentication and access control
### Two login methods
1. **Google Workspace users** (directors/admin/recruiters): Google OAuth restricted to NES domain.
2. **House managers** (no Workspace license; Gmail “work emails” like `firstlast.nes@gmail.com`): magic-link email authentication.

### Access principles
- Directors/admins should only see their area.
- System owner (Spencer) and eventually exec team can see all areas.
- House managers:
  - Only see their assigned evaluation queue (month-based).
  - Only submit supervisor evaluations for assigned DSPs.

## Roster and identity
Roster comes from a monthly Paylocity export. Minimum required columns:
- employee_id
- employee_name
- position_description
- location_description
- work_email (if available; strongly recommended for provisioning users)

A location→area mapping is used to assign staff to an area (pilot: Salt Lake → South Valley; Price → Price).

Employee selection in forms should use a deterministic label:
- `EmployeeName — EmployeeID`

## Proposed technical architecture (v1)
### Runtime
- Next.js (Node.js) app deployed to Cloud Run.

### Database
- Prefer a relational DB (Postgres via managed service) for constraints + transactional integrity.
- BigQuery is excellent for analytics, but enforcing uniqueness and assignment workflows is simpler in Postgres.
- If BigQuery is mandated, you must implement uniqueness enforcement at the application layer and be careful with concurrency.

### Data layers
Always store two layers:
1. Raw submissions (immutable)
2. Computed scores (derived, with rubric version and deductions breakdown)

### Suggested tables (logical)
- `roster_monthly`
  - month, employee_id, employee_name, position, location, area, work_email, employment_status
- `users`
  - user_id, email, auth_provider, role(s), area(s), is_active
- `supervisor_assignments`
  - month, employee_id, evaluator_email, area, assigned_by_email, assigned_at, status
- `submissions_raw`
  - submission_id, month, employee_id, role, submitted_by_email, submitted_at, payload_json
- `scores_computed`
  - month, employee_id, admin_score, supervisor_score, recruiter_score, final_score (nullable),
    deductions_json, rubric_version, computed_at
- `rubric_versions`
  - rubric_version, effective_month, rubric_json, published_by_email, published_at

## UI requirements (v1)
### House manager
- “My Evaluations” page
  - Month selector
  - List of assigned DSPs
  - Status: not started / completed
- Evaluation form (Supervisor)
  - Ratings only; submit
  - Confirmation receipt

### Admin/director
- Dashboard (area-scoped)
  - Completion rates by role
  - Overall score (complete only)
  - Category averages (partial allowed)
  - Staff table with category scores + missing roles
- Supervisor Assignments page (admin role)
  - Month selector
  - Initialize from prior month
  - Table of DSPs with assigned evaluator dropdown
  - Filters: Unassigned, Completed
  - Bulk assign action

### Recruiter and Admin evaluation forms
- Similar pattern: list/queue + form + submit
- Submissions are one-and-done

## Non-goals for v1
- Editing submissions
- Multi-submission per month per role
- Automated org hierarchy mapping from Paylocity
- Notifications/reminders (nice later)
- Complex HRIS/Therap integrations (Therap API not available)

## Roadmap ideas (post-v1)
- Add admin “void submission” capability with audit trail (instead of editing).
- Add reminders / nudges for incomplete evaluations.
- Expand KPI surface area (attendance, Therap-derived errors if ever integrated, retention predictors).
- Add coaching notes workflow tied to score changes.
- Add exec multi-area views.

## Implementation notes for agents
- Enforce uniqueness at the DB level wherever possible.
- Treat rubric as configuration (JSON), not hardcoded branching logic.
- Every computed score must include a deductions breakdown that explains the score.
- Always scope access by:
  - user role
  - area
  - (for house managers) assignment membership for that month.

## Open questions to resolve early
- Exact month representation (YYYY-MM string vs date).
- Exact list of positions and whether they vary by area.
- Whether “House Manager” themselves are scored as DSPs in some contexts (they appear in the DSP position list).
- Which roles are allowed to administer assignments in each area (admin team composition varies).

End of brief.
