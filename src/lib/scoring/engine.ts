/**
 * Scoring engine for NES Staff Scorecard.
 * Computes category scores and final weighted score from submissions.
 */

import { query } from '../db/client';
import {
    RubricV1,
    SupervisorSubmissionPayload,
    AdminSubmissionPayload,
    RecruiterSubmissionPayload,
    DeductionsBreakdown,
    Deduction,
    findDeductionForCount,
    findTieredPenalty,
    DEFAULT_RUBRIC_V1,
} from './rubric';

// =============================================================================
// TYPES
// =============================================================================

interface RubricVersionRow {
    rubric_version: string;
    rubric_json: RubricV1;
}

interface SubmissionRow {
    role: 'admin' | 'supervisor' | 'recruiter';
    payload_json: AdminSubmissionPayload | SupervisorSubmissionPayload | RecruiterSubmissionPayload;
}

interface ComputedScore {
    adminScore: number | null;
    supervisorScore: number | null;
    recruiterScore: number | null;
    finalScore: number | null;
    deductions: DeductionsBreakdown;
    rubricVersion: string;
}

// =============================================================================
// RUBRIC SELECTION
// =============================================================================

/**
 * Get the rubric for a given month.
 * Uses the latest rubric where effective_month <= target_month.
 */
export async function getRubricForMonth(month: string): Promise<{ version: string; rubric: RubricV1 }> {
    const result = await query<RubricVersionRow>(
        `SELECT rubric_version, rubric_json 
     FROM rubric_versions 
     WHERE effective_month <= $1 
     ORDER BY effective_month DESC 
     LIMIT 1`,
        [month]
    );

    if (result.rows.length === 0) {
        // Fallback to default rubric if none found
        return { version: 'default', rubric: DEFAULT_RUBRIC_V1 };
    }

    return {
        version: result.rows[0].rubric_version,
        rubric: result.rows[0].rubric_json,
    };
}

// =============================================================================
// CATEGORY SCORE CALCULATIONS
// =============================================================================

/**
 * Calculate supervisor score from submission payload.
 * Starts at 100, deducts based on ratings.
 */
export function calculateSupervisorScore(
    payload: SupervisorSubmissionPayload,
    rubric: RubricV1
): { score: number; deductions: Deduction[] } {
    const deductions: Deduction[] = [];
    let totalDeduction = 0;

    const metrics = ['attitude', 'reliability', 'proactivity', 'flexibility', 'individual_interaction'] as const;

    for (const metric of metrics) {
        const rating = payload[metric];
        const deductionPoints = rubric.supervisor_rating_map[rating] ?? 0;

        if (deductionPoints > 0) {
            deductions.push({
                metric,
                value: rating,
                deduction_points: deductionPoints,
                rule_id: `supervisor_rating_${metric}`,
            });
            totalDeduction += deductionPoints;
        }
    }

    return {
        score: Math.max(0, 100 - totalDeduction),
        deductions,
    };
}

/**
 * Calculate admin score from submission payload.
 * Starts at 100, deducts per-metric based on error counts.
 */
export function calculateAdminScore(
    payload: AdminSubmissionPayload,
    rubric: RubricV1
): { score: number; deductions: Deduction[] } {
    const deductions: Deduction[] = [];
    let totalDeduction = 0;

    const metricMap: Record<string, number> = {
        isp_goal_errors: payload.isp_goal_errors,
        isp_behavior_errors: payload.isp_behavior_errors,
        mar_errors: payload.mar_errors,
        attendance_tardies_callouts: payload.attendance_tardies_callouts,
        attendance_ncns: payload.attendance_ncns,
    };

    for (const [metric, count] of Object.entries(metricMap)) {
        const buckets = rubric.admin_rules.metrics[metric];
        if (!buckets) continue;

        const deductionPoints = findDeductionForCount(count, buckets);

        if (deductionPoints > 0) {
            deductions.push({
                metric,
                value: count,
                deduction_points: deductionPoints,
                rule_id: `admin_${metric}_bucket`,
            });
            totalDeduction += deductionPoints;
        }
    }

    return {
        score: Math.max(0, 100 - totalDeduction),
        deductions,
    };
}

/**
 * Calculate recruiter score from submission payload.
 * Starts at 100, deducts based on trainings, EDAs, and retrainings.
 */
export function calculateRecruiterScore(
    payload: RecruiterSubmissionPayload,
    rubric: RubricV1
): { score: number; deductions: Deduction[] } {
    const deductions: Deduction[] = [];
    let totalDeduction = 0;

    // Overdue trainings: -15 per training
    if (payload.overdue_trainings > 0) {
        const deductionPoints = payload.overdue_trainings * rubric.recruiter_rules.overdue_training_penalty_per;
        deductions.push({
            metric: 'overdue_trainings',
            value: payload.overdue_trainings,
            deduction_points: deductionPoints,
            rule_id: 'recruiter_overdue_trainings',
        });
        totalDeduction += deductionPoints;
    }

    // EDAs in past 6 months: tiered penalty
    if (payload.edas_past_6_months > 0) {
        const deductionPoints = findTieredPenalty(payload.edas_past_6_months, rubric.recruiter_rules.eda_penalty);
        deductions.push({
            metric: 'edas_past_6_months',
            value: payload.edas_past_6_months,
            deduction_points: deductionPoints,
            rule_id: 'recruiter_eda_penalty',
        });
        totalDeduction += deductionPoints;
    }

    // Retrainings this month: tiered penalty
    if (payload.retrainings > 0) {
        const deductionPoints = findTieredPenalty(payload.retrainings, rubric.recruiter_rules.retraining_penalty);
        deductions.push({
            metric: 'retrainings',
            value: payload.retrainings,
            deduction_points: deductionPoints,
            rule_id: 'recruiter_retraining_penalty',
        });
        totalDeduction += deductionPoints;
    }

    return {
        score: Math.max(0, 100 - totalDeduction),
        deductions,
    };
}

// =============================================================================
// MAIN SCORING FUNCTION
// =============================================================================

/**
 * Compute all scores for an employee/month based on existing submissions.
 * Updates the scores_computed table.
 */
export async function computeScoresForEmployee(
    month: string,
    employeeId: string,
    area: string
): Promise<ComputedScore> {
    // Get rubric for this month
    const { version: rubricVersion, rubric } = await getRubricForMonth(month);

    // Get all submissions for this employee/month
    const submissionsResult = await query<SubmissionRow>(
        `SELECT role, payload_json FROM submissions_raw WHERE month = $1 AND employee_id = $2`,
        [month, employeeId]
    );

    const deductions: DeductionsBreakdown = {
        admin: [],
        supervisor: [],
        recruiter: [],
    };

    let adminScore: number | null = null;
    let supervisorScore: number | null = null;
    let recruiterScore: number | null = null;

    // Calculate scores for each submission
    for (const submission of submissionsResult.rows) {
        switch (submission.role) {
            case 'admin': {
                const result = calculateAdminScore(submission.payload_json as AdminSubmissionPayload, rubric);
                adminScore = result.score;
                deductions.admin = result.deductions;
                break;
            }
            case 'supervisor': {
                const result = calculateSupervisorScore(submission.payload_json as SupervisorSubmissionPayload, rubric);
                supervisorScore = result.score;
                deductions.supervisor = result.deductions;
                break;
            }
            case 'recruiter': {
                const result = calculateRecruiterScore(submission.payload_json as RecruiterSubmissionPayload, rubric);
                recruiterScore = result.score;
                deductions.recruiter = result.deductions;
                break;
            }
        }
    }

    // Calculate final score only if all three categories are present
    let finalScore: number | null = null;
    if (adminScore !== null && supervisorScore !== null && recruiterScore !== null) {
        finalScore = Math.round(
            adminScore * rubric.weights.admin +
            supervisorScore * rubric.weights.supervisor +
            recruiterScore * rubric.weights.recruiter
        );
    }

    // Upsert scores_computed
    await query(
        `INSERT INTO scores_computed (month, employee_id, area, rubric_version, admin_score, supervisor_score, recruiter_score, final_score, deductions_json, computed_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, NOW())
     ON CONFLICT (month, employee_id) 
     DO UPDATE SET 
       rubric_version = EXCLUDED.rubric_version,
       admin_score = EXCLUDED.admin_score,
       supervisor_score = EXCLUDED.supervisor_score,
       recruiter_score = EXCLUDED.recruiter_score,
       final_score = EXCLUDED.final_score,
       deductions_json = EXCLUDED.deductions_json,
       computed_at = NOW()`,
        [month, employeeId, area, rubricVersion, adminScore, supervisorScore, recruiterScore, finalScore, JSON.stringify(deductions)]
    );

    return {
        adminScore,
        supervisorScore,
        recruiterScore,
        finalScore,
        deductions,
        rubricVersion,
    };
}
