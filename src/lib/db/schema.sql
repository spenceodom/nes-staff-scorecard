-- NES Staff Scorecard Database Schema
-- Version: 1.0
-- Last Updated: 2025-12-26

-- =============================================================================
-- CORE TABLES
-- =============================================================================

-- Monthly roster imported from Paylocity
CREATE TABLE roster_monthly (
  month TEXT NOT NULL,                    -- Format: YYYY-MM
  employee_id TEXT NOT NULL,
  employee_name TEXT NOT NULL,
  position TEXT NOT NULL,
  location TEXT NOT NULL,
  area TEXT NOT NULL,
  work_email TEXT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (month, employee_id)
);

CREATE INDEX idx_roster_monthly_area ON roster_monthly(month, area);

-- =============================================================================
-- AUTHENTICATION & AUTHORIZATION
-- =============================================================================

-- System users (both Google OAuth and magic-link)
CREATE TABLE users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  name TEXT NULL,
  auth_provider TEXT NOT NULL CHECK (auth_provider IN ('google', 'magiclink')),
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  last_login_at TIMESTAMP NULL
);

-- User role assignments (area-scoped or global)
CREATE TABLE user_roles (
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('super_admin', 'exec', 'director', 'admin', 'recruiter', 'house_manager')),
  area TEXT NOT NULL DEFAULT 'global',
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, role, area)
);

-- Sessions for authenticated users
CREATE TABLE sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at TIMESTAMP NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_sessions_user ON sessions(user_id);
CREATE INDEX idx_sessions_expires ON sessions(expires_at);

-- Magic link tokens (single-use, short-lived)
CREATE TABLE magic_link_tokens (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  expires_at TIMESTAMP NOT NULL,
  used_at TIMESTAMP NULL,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_magic_link_tokens_token ON magic_link_tokens(token);

-- =============================================================================
-- SUPERVISOR ASSIGNMENTS
-- =============================================================================

-- Admin assigns supervisor evaluators each month
CREATE TABLE supervisor_assignments (
  month TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  area TEXT NOT NULL,
  evaluator_email TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'assigned' CHECK (status IN ('assigned', 'completed')),
  assigned_by_email TEXT NOT NULL,
  assigned_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (month, employee_id),
  FOREIGN KEY (month, employee_id) REFERENCES roster_monthly(month, employee_id) ON DELETE CASCADE
);

CREATE INDEX idx_supervisor_assignments_evaluator ON supervisor_assignments(month, evaluator_email);
CREATE INDEX idx_supervisor_assignments_area ON supervisor_assignments(month, area);

-- =============================================================================
-- SUBMISSIONS
-- =============================================================================

-- Raw submission data (immutable audit trail)
CREATE TABLE submissions_raw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  month TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  area TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('admin', 'supervisor', 'recruiter')),
  submitted_by_email TEXT NOT NULL,
  submitted_at TIMESTAMP NOT NULL DEFAULT now(),
  payload_json JSONB NOT NULL,
  UNIQUE (month, employee_id, role),
  FOREIGN KEY (month, employee_id) REFERENCES roster_monthly(month, employee_id) ON DELETE CASCADE
);

CREATE INDEX idx_submissions_raw_employee ON submissions_raw(month, employee_id);
CREATE INDEX idx_submissions_raw_area ON submissions_raw(month, area);

-- =============================================================================
-- SCORING
-- =============================================================================

-- Computed scores with deduction breakdown
CREATE TABLE scores_computed (
  month TEXT NOT NULL,
  employee_id TEXT NOT NULL,
  area TEXT NOT NULL,
  rubric_version TEXT NOT NULL,
  admin_score INTEGER NULL,
  supervisor_score INTEGER NULL,
  recruiter_score INTEGER NULL,
  final_score INTEGER NULL,                -- NULL until all 3 submissions exist
  deductions_json JSONB NOT NULL,
  computed_at TIMESTAMP NOT NULL DEFAULT now(),
  PRIMARY KEY (month, employee_id),
  FOREIGN KEY (month, employee_id) REFERENCES roster_monthly(month, employee_id) ON DELETE CASCADE
);

CREATE INDEX idx_scores_computed_area ON scores_computed(month, area);

-- Versioned rubric configurations
CREATE TABLE rubric_versions (
  rubric_version TEXT PRIMARY KEY,          -- e.g., '2026.01'
  effective_month TEXT NOT NULL,            -- First month this rubric applies
  rubric_json JSONB NOT NULL,
  published_by_email TEXT NOT NULL,
  published_at TIMESTAMP NOT NULL DEFAULT now()
);

CREATE INDEX idx_rubric_versions_effective ON rubric_versions(effective_month DESC);

-- =============================================================================
-- DEFAULT RUBRIC (v1)
-- =============================================================================

INSERT INTO rubric_versions (rubric_version, effective_month, rubric_json, published_by_email) VALUES (
  '2025.01',
  '2025-01',
  '{
    "weights": {
      "admin": 0.4,
      "supervisor": 0.4,
      "recruiter": 0.2
    },
    "supervisor_rating_map": {
      "Outstanding": 0,
      "Exceeds Expectations": 3,
      "Meets Expectations": 8,
      "Needs Improvement": 13,
      "Unsatisfactory": 20
    },
    "supervisor_metrics": ["attitude", "reliability", "proactivity", "flexibility", "individual_interaction"],
    "admin_rules": {
      "metrics": {
        "isp_goal_errors": [
          {"min": 1, "max": 2, "deduction": 5},
          {"min": 3, "max": 5, "deduction": 10},
          {"min": 6, "max": 999, "deduction": 20}
        ],
        "isp_behavior_errors": [
          {"min": 1, "max": 2, "deduction": 5},
          {"min": 3, "max": 5, "deduction": 10},
          {"min": 6, "max": 999, "deduction": 20}
        ],
        "mar_errors": [
          {"min": 1, "max": 2, "deduction": 5},
          {"min": 3, "max": 5, "deduction": 10},
          {"min": 6, "max": 999, "deduction": 20}
        ],
        "attendance_tardies_callouts": [
          {"min": 1, "max": 2, "deduction": 5},
          {"min": 3, "max": 5, "deduction": 10},
          {"min": 6, "max": 999, "deduction": 20}
        ],
        "attendance_ncns": [
          {"min": 1, "max": 2, "deduction": 5},
          {"min": 3, "max": 5, "deduction": 10},
          {"min": 6, "max": 999, "deduction": 20}
        ]
      }
    },
    "recruiter_rules": {
      "overdue_training_penalty_per": 15,
      "eda_penalty": {
        "1": 40,
        "2+": 80
      },
      "retraining_penalty": {
        "1": 5,
        "2+": 10
      }
    }
  }',
  'system@nes-scorecard.app'
);
