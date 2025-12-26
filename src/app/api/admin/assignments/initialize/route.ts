/**
 * POST /api/admin/assignments/initialize
 * Initialize assignments for a target month from a source month.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query, withTransaction } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/session';
import { canManageAssignments, buildAreaFilter } from '@/lib/auth/authorization';

const initializeSchema = z.object({
    targetMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Target month must be in YYYY-MM format'),
    sourceMonth: z.string().regex(/^\d{4}-\d{2}$/, 'Source month must be in YYYY-MM format'),
});

export async function POST(request: NextRequest) {
    try {
        const session = await requireSession();

        if (!canManageAssignments(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const body = await request.json();
        const { targetMonth, sourceMonth } = initializeSchema.parse(body);

        const areaFilter = buildAreaFilter(session, 'r.area');

        const result = await withTransaction(async (client) => {
            // Build the area filter clause
            let areaClause = '';
            const baseParams = [targetMonth, sourceMonth];
            if (areaFilter) {
                const areaParams = areaFilter.params.map((_, i) => `$${baseParams.length + i + 1}`);
                areaClause = `AND r.area IN (${areaParams.join(', ')})`;
            }

            const params = areaFilter ? [...baseParams, ...areaFilter.params] : baseParams;

            // Get all DSPs in target month roster that don't have assignments yet
            const dspsResult = await client.query<{
                employee_id: string;
                area: string;
                source_evaluator: string | null;
            }>(
                `SELECT 
          r.employee_id,
          r.area,
          sa.evaluator_email as source_evaluator
        FROM roster_monthly r
        LEFT JOIN supervisor_assignments sa_existing 
          ON r.employee_id = sa_existing.employee_id AND sa_existing.month = $1
        LEFT JOIN supervisor_assignments sa 
          ON r.employee_id = sa.employee_id AND sa.month = $2
        WHERE r.month = $1 
          AND r.is_active = true
          AND sa_existing.employee_id IS NULL
          ${areaClause}`,
                params
            );

            let copied = 0;
            let unassigned = 0;

            for (const dsp of dspsResult.rows) {
                if (dsp.source_evaluator) {
                    // Copy assignment from source month
                    await client.query(
                        `INSERT INTO supervisor_assignments (month, employee_id, area, evaluator_email, assigned_by_email, status)
             VALUES ($1, $2, $3, $4, $5, 'assigned')`,
                        [targetMonth, dsp.employee_id, dsp.area, dsp.source_evaluator, session.email]
                    );
                    copied++;
                } else {
                    // No source assignment - leave as unassigned
                    unassigned++;
                }
            }

            return {
                processed: dspsResult.rows.length,
                copiedFromSource: copied,
                leftUnassigned: unassigned,
            };
        });

        return NextResponse.json({
            success: true,
            targetMonth,
            sourceMonth,
            ...result,
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.error('Initialize assignments error:', error);
        return NextResponse.json({ error: 'Failed to initialize assignments' }, { status: 500 });
    }
}
