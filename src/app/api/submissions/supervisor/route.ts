/**
 * POST /api/submissions/supervisor
 * Submit a supervisor evaluation for an employee.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/session';
import { canSubmitSupervisor } from '@/lib/auth/authorization';
import { computeScoresForEmployee, SupervisorSubmissionPayload } from '@/lib/scoring';

// =============================================================================
// VALIDATION
// =============================================================================

const supervisorRatings = [
    'Outstanding',
    'Exceeds Expectations',
    'Meets Expectations',
    'Needs Improvement',
    'Unsatisfactory',
] as const;

const submissionSchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
    employeeId: z.string().min(1, 'Employee ID is required'),
    ratings: z.object({
        attitude: z.enum(supervisorRatings),
        reliability: z.enum(supervisorRatings),
        proactivity: z.enum(supervisorRatings),
        flexibility: z.enum(supervisorRatings),
        individual_interaction: z.enum(supervisorRatings),
    }),
});

// =============================================================================
// ROUTE HANDLER
// =============================================================================

export async function POST(request: NextRequest) {
    try {
        const session = await requireSession();

        if (!canSubmitSupervisor(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { month, employeeId, ratings } = submissionSchema.parse(body);

        const result = await withTransaction(async (client) => {
            // Verify employee exists in roster
            const rosterResult = await client.query<{ area: string }>(
                'SELECT area FROM roster_monthly WHERE month = $1 AND employee_id = $2 AND is_active = true',
                [month, employeeId]
            );

            if (rosterResult.rows.length === 0) {
                throw new Error('Employee not found in roster for this month');
            }

            const area = rosterResult.rows[0].area;

            // Verify user is assigned as evaluator for this employee
            const assignmentResult = await client.query<{ evaluator_email: string; status: string }>(
                'SELECT evaluator_email, status FROM supervisor_assignments WHERE month = $1 AND employee_id = $2',
                [month, employeeId]
            );

            if (assignmentResult.rows.length === 0) {
                throw new Error('No supervisor assignment exists for this employee');
            }

            const assignment = assignmentResult.rows[0];

            if (assignment.evaluator_email.toLowerCase() !== session.email.toLowerCase()) {
                throw new Error('You are not assigned to evaluate this employee');
            }

            if (assignment.status === 'completed') {
                throw new Error('Evaluation already submitted for this employee');
            }

            // Build payload
            const payload: SupervisorSubmissionPayload = {
                attitude: ratings.attitude,
                reliability: ratings.reliability,
                proactivity: ratings.proactivity,
                flexibility: ratings.flexibility,
                individual_interaction: ratings.individual_interaction,
            };

            // Insert submission (unique constraint prevents duplicates)
            await client.query(
                `INSERT INTO submissions_raw (month, employee_id, area, role, submitted_by_email, payload_json)
         VALUES ($1, $2, $3, 'supervisor', $4, $5)`,
                [month, employeeId, area, session.email, JSON.stringify(payload)]
            );

            // Update assignment status
            await client.query(
                `UPDATE supervisor_assignments SET status = 'completed' WHERE month = $1 AND employee_id = $2`,
                [month, employeeId]
            );

            return { area };
        });

        // Compute scores (outside transaction as it's a separate concern)
        const scores = await computeScoresForEmployee(month, employeeId, result.area);

        return NextResponse.json({
            success: true,
            month,
            employeeId,
            supervisorScore: scores.supervisorScore,
            finalScore: scores.finalScore,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error) {
            if (error.message === 'Unauthorized') {
                return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
            }

            // Handle unique constraint violation (duplicate submission)
            if (error.message.includes('unique constraint') || error.message.includes('duplicate')) {
                return NextResponse.json(
                    { error: 'Supervisor evaluation already submitted for this employee' },
                    { status: 409 }
                );
            }

            return NextResponse.json({ error: error.message }, { status: 400 });
        }

        console.error('Supervisor submission error:', error);
        return NextResponse.json({ error: 'Failed to submit evaluation' }, { status: 500 });
    }
}
