/**
 * Rubric types and utilities for NES Staff Scorecard.
 * The rubric is stored as versioned JSON in the database.
 */

// =============================================================================
// TYPE DEFINITIONS
// =============================================================================

export interface ErrorBucket {
    min: number;
    max: number;
    deduction: number;
}

export interface AdminRules {
    metrics: {
        [metric: string]: ErrorBucket[];
    };
}

export interface RecruiterRules {
    overdue_training_penalty_per: number;
    eda_penalty: Record<string, number>;
    retraining_penalty: Record<string, number>;
}

export interface RubricV1 {
    weights: {
        admin: number;
        supervisor: number;
        recruiter: number;
    };
    supervisor_rating_map: Record<string, number>;
    supervisor_metrics: string[];
    admin_rules: AdminRules;
    recruiter_rules: RecruiterRules;
}

// =============================================================================
// DEDUCTION TRACKING
// =============================================================================

export interface Deduction {
    metric: string;
    value: number | string;
    deduction_points: number;
    rule_id: string;
}

export interface DeductionsBreakdown {
    admin: Deduction[];
    supervisor: Deduction[];
    recruiter: Deduction[];
}

// =============================================================================
// SUBMISSION PAYLOADS
// =============================================================================

export interface SupervisorSubmissionPayload {
    attitude: string;
    reliability: string;
    proactivity: string;
    flexibility: string;
    individual_interaction: string;
}

export interface AdminSubmissionPayload {
    isp_goal_errors: number;
    isp_behavior_errors: number;
    mar_errors: number;
    attendance_tardies_callouts: number;
    attendance_ncns: number;
    individual_interaction?: string; // Optional qualitative rating
}

export interface RecruiterSubmissionPayload {
    overdue_trainings: number;
    retrainings: number;
    edas_past_6_months: number;
}

// =============================================================================
// DEFAULT RUBRIC (for reference/testing)
// =============================================================================

export const DEFAULT_RUBRIC_V1: RubricV1 = {
    weights: {
        admin: 0.4,
        supervisor: 0.4,
        recruiter: 0.2,
    },
    supervisor_rating_map: {
        'Outstanding': 0,
        'Exceeds Expectations': 3,
        'Meets Expectations': 8,
        'Needs Improvement': 13,
        'Unsatisfactory': 20,
    },
    supervisor_metrics: ['attitude', 'reliability', 'proactivity', 'flexibility', 'individual_interaction'],
    admin_rules: {
        metrics: {
            isp_goal_errors: [
                { min: 1, max: 2, deduction: 5 },
                { min: 3, max: 5, deduction: 10 },
                { min: 6, max: 999, deduction: 20 },
            ],
            isp_behavior_errors: [
                { min: 1, max: 2, deduction: 5 },
                { min: 3, max: 5, deduction: 10 },
                { min: 6, max: 999, deduction: 20 },
            ],
            mar_errors: [
                { min: 1, max: 2, deduction: 5 },
                { min: 3, max: 5, deduction: 10 },
                { min: 6, max: 999, deduction: 20 },
            ],
            attendance_tardies_callouts: [
                { min: 1, max: 2, deduction: 5 },
                { min: 3, max: 5, deduction: 10 },
                { min: 6, max: 999, deduction: 20 },
            ],
            attendance_ncns: [
                { min: 1, max: 2, deduction: 5 },
                { min: 3, max: 5, deduction: 10 },
                { min: 6, max: 999, deduction: 20 },
            ],
        },
    },
    recruiter_rules: {
        overdue_training_penalty_per: 15,
        eda_penalty: {
            '1': 40,
            '2+': 80,
        },
        retraining_penalty: {
            '1': 5,
            '2+': 10,
        },
    },
};

// =============================================================================
// UTILITY FUNCTIONS
// =============================================================================

/**
 * Find the deduction for a given error count using the bucket rules.
 */
export function findDeductionForCount(count: number, buckets: ErrorBucket[]): number {
    if (count === 0) return 0;

    for (const bucket of buckets) {
        if (count >= bucket.min && count <= bucket.max) {
            return bucket.deduction;
        }
    }

    // If count exceeds all buckets, use the last bucket's deduction
    if (buckets.length > 0 && count > buckets[buckets.length - 1].max) {
        return buckets[buckets.length - 1].deduction;
    }

    return 0;
}

/**
 * Find the penalty for a tiered value (like EDA or retraining).
 */
export function findTieredPenalty(count: number, tiers: Record<string, number>): number {
    if (count === 0) return 0;

    if (count === 1 && tiers['1'] !== undefined) {
        return tiers['1'];
    }

    if (count >= 2 && tiers['2+'] !== undefined) {
        return tiers['2+'];
    }

    return 0;
}
