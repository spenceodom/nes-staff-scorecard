# NES Staff Scorecard v1
Technical implementation spec for agents

## Goal
Build a Cloud Run–hosted web app that:
- Authenticates NES leadership via Google OAuth and house managers via magic-link
- Stores roster + users + assignments + submissions in a database
- Computes and persists score outputs with rubric versioning
- Provides area-scoped dashboards and evaluator queues
- Enforces strict uniqueness: one submission per employee per month per role

Pilot: South Valley + Price.

## Hard constraints
- No edits after submit (v1)
- No duplicate submissions:
  - unique key: (month, employee_id, role)
- Final score exists only when all 3 roles submitted
- House managers cannot browse all staff; they only see assigned DSPs for month
- Admin assigns Supervisor evaluators monthly; “initialize from prior month” supported
- Area scoping:
  - Directors/admins/recruiters see only their area
  - Spencer sees all areas (super-admin)

## Recommended stack
- Next.js (App Router) + TypeScript
- Cloud Run deployment
- Postgres (recommended) for constraints/transactions
  - If BigQuery is used, enforce uniqueness in application code very carefully (avoid duplicates on concurrent submits)

Auth
- Google OAuth for Workspace (restrict to allowed domains)
- Magic link for Gmail users (email OTP link)

## Data model
Use `month` as a string: `YYYY-MM` (e.g., `2026-01`) to keep grouping simple.

### Tables (Postgres)
#### roster_monthly
- month TEXT NOT NULL
- employee_id TEXT NOT NULL
- employee_name TEXT NOT NULL
- position TEXT NOT NULL
- location TEXT NOT NULL
- area TEXT NOT NULL
- work_email TEXT NULL
- is_active BOOLEAN NOT NULL DEFAULT true
PRIMARY KEY (month, employee_id)

#### users
- id UUID PK
- email TEXT UNIQUE NOT NULL
- auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google','magiclink'))
- is_active BOOLEAN NOT NULL DEFAULT true
- created_at TIMESTAMP NOT NULL DEFAULT now()

#### user_roles
- user_id UUID FK users(id)
- role TEXT NOT NULL CHECK (role IN ('super_admin','exec','director','admin','recruiter','house_manager'))
- area TEXT NULL  -- null means global (super_admin/exec)
PRIMARY KEY (user_id, role, area)

Notes:
- House managers typically have (role='house_manager', area='<their area>') if known.
- Directors/admins/recruiters are area-scoped.

#### supervisor_assignments
- month TEXT NOT NULL
- employee_id TEXT NOT NULL
- area TEXT NOT NULL
- evaluator_email TEXT NOT NULL  -- Gmail or Workspace email
- status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned','completed'))
- assigned_by_email TEXT NOT NULL
- assigned_at TIMESTAMP NOT NULL DEFAULT now()
PRIMARY KEY (month, employee_id)
INDEX (month, evaluator_email)

Rules:
- Each DSP gets at most one supervisor evaluator per month.
- On supervisor submission, set status='completed'.

#### submissions_raw
- id UUID PK
- month TEXT NOT NULL
- employee_id TEXT NOT NULL
- area TEXT NOT NULL
- role TEXT NOT NULL CHECK (role IN ('admin','supervisor','recruiter'))
- submitted_by_email TEXT NOT NULL
- submitted_at TIMESTAMP NOT NULL DEFAULT now()
- payload_json JSONB NOT NULL
UNIQUE (month, employee_id, role)

#### scores_computed
- month TEXT NOT NULL
- employee_id TEXT NOT NULL
- area TEXT NOT NULL
- rubric_version TEXT NOT NULL
- admin_score INTEGER NULL
- supervisor_score INTEGER NULL
- recruiter_score INTEGER NULL
- final_score INTEGER NULL
- deductions_json JSONB NOT NULL
- computed_at TIMESTAMP NOT NULL DEFAULT now()
PRIMARY KEY (month, employee_id)

Rules:
- Update this row whenever any of the three submissions arrives.
- final_score = null unless all three category scores present.

#### rubric_versions
- rubric_version TEXT PK  -- e.g., '2026.01'
- effective_month TEXT NOT NULL
- rubric_json JSONB NOT NULL
- published_by_email TEXT NOT NULL
- published_at TIMESTAMP NOT NULL DEFAULT now()

## Rubric representation
Store rubric as JSON. Do not hardcode points in code except mapping lookups.

Minimum rubric content:
- weights: { admin: 0.4, supervisor: 0.4, recruiter: 0.2 }
- supervisor_rating_map:
  - Outstanding: 0
  - Exceeds Expectations: 3
  - Meets Expectations: 8
  - Needs Improvement: 13
  - Unsatisfactory: 20
- recruiter rules:
  - overdue_training_penalty_per = 15
  - eda_penalty: {1: 40, "2+": 80}
  - retraining_penalty: {1: 5, "2+": 10}
- admin rules:
  - include explicit mappings per count thresholds as defined in slides/rubric doc

All computed deductions should be stored as:
- by_category: { admin: [...], supervisor: [...], recruiter: [...] }
- each entry: { metric, value, deduction_points, rule_id }

## Authorization
### Role gates
- super_admin: full access
- exec: multi-area dashboards (optional v1)
- director/admin/recruiter: area-scoped access
- house_manager: only supervisor queue + supervisor submit for assigned DSPs

### Enforcements
- Dashboard queries must filter by user area unless global.
- Supervisor submit:
  - must match an existing supervisor_assignments(month, employee_id)
  - assignment evaluator_email must equal logged-in email
  - reject if duplicate (UNIQUE constraint)

## Endpoints
### Auth
- /api/auth/google/callback
- /api/auth/magiclink/request
- /api/auth/magiclink/verify

### Roster
- POST /api/admin/roster/upload (CSV)
  - creates/updates roster_monthly for selected month
  - optional: provision users from work_email

### Assignments
- POST /api/admin/assignments/initialize
  - input: target_month, source_month
  - behavior: create assignments for target_month where missing, copying evaluator_email from source_month when available
- PATCH /api/admin/assignments/bulk
  - input: month, rows[{employee_id, evaluator_email}]
  - upsert; audit assigned_by_email
- GET /api/me/queue/supervisor?month=YYYY-MM
  - returns DSP list assigned to the logged-in evaluator_email

### Submissions
- POST /api/submissions/admin
- POST /api/submissions/supervisor
- POST /api/submissions/recruiter
All:
- validate role permissions
- validate employee exists in roster_monthly(month)
- insert submissions_raw (fails on duplicates)
- recompute scores_computed for that employee/month
- return receipt

### Dashboard
- GET /api/dashboard/area?month=YYYY-MM
  - completion rates
  - category averages
  - overall average (complete only)
  - staff list with missing roles

## UI pages
- /login
- /me/supervisor-queue (house managers + admins doing supervisor role)
- /submit/supervisor/:month/:employee_id
- /submit/admin/:month/:employee_id (or admin queue page)
- /submit/recruiter/:month/:employee_id
- /admin/roster
- /admin/assignments
- /dashboard (area-scoped)

## Acceptance criteria
### Data integrity
- Duplicate submit for same (month, employee_id, role) is blocked with clear error
- House manager cannot view DSPs not assigned to them for the month
- Final score remains null until all 3 submissions exist
- Category scores appear as soon as their submissions exist

### Assignment initialization
- Initialize from prior month does not overwrite existing assignments for target month
- New DSPs in current roster become Unassigned

### Auditability
- Every submission stores submitted_by_email + timestamp + full payload_json
- Every computed score stores deductions_json + rubric_version used

## Testing checklist
- Auth: Google vs magic link
- Area scoping: director/admin cannot access other area staff
- Assignment: HM sees only assigned DSPs
- Duplicate prevention: second submit rejected
- Partial scoring: category averages update, overall waits for completeness
- Rubric changes: new month uses new rubric_version; prior months unchanged

## Non-goals
- Editing submissions
- Automated HM→DSP mapping
- External API integrations (Therap/Paylocity APIs)
- Notifications/reminders

End of spec.
