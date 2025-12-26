/**
 * GET /api/dashboard
 * Get dashboard data for area directors/admins.
 */

import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { query } from '@/lib/db/client';
import { requireSession } from '@/lib/auth/session';
import { canViewDashboard, buildAreaFilter, canAccessArea } from '@/lib/auth/authorization';

const querySchema = z.object({
    month: z.string().regex(/^\d{4}-\d{2}$/, 'Month must be in YYYY-MM format'),
    area: z.string().optional(),
});

interface StaffRow {
    employee_id: string;
    employee_name: string;
    position: string;
    area: string;
    admin_score: number | null;
    supervisor_score: number | null;
    recruiter_score: number | null;
    final_score: number | null;
    has_admin: boolean;
    has_supervisor: boolean;
    has_recruiter: boolean;
}

export async function GET(request: NextRequest) {
    try {
        const session = await requireSession();

        if (!canViewDashboard(session)) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 403 });
        }

        const searchParams = request.nextUrl.searchParams;
        const { month, area } = querySchema.parse({
            month: searchParams.get('month'),
            area: searchParams.get('area'),
        });

        // Build area filter
        const areaFilter = buildAreaFilter(session, 'r.area');
        const params: string[] = [month];
        let whereClause = 'WHERE r.month = $1 AND r.is_active = true';

        if (areaFilter) {
            const areaParams = areaFilter.params.map((_, i) => `$${params.length + i + 1}`);
            whereClause += ` AND r.area IN (${areaParams.join(', ')})`;
            params.push(...areaFilter.params);
        }

        if (area) {
            if (!canAccessArea(session, area)) {
                return NextResponse.json({ error: 'Access denied to this area' }, { status: 403 });
            }
            params.push(area);
            whereClause += ` AND r.area = $${params.length}`;
        }

        // Get staff with scores and submission status
        const staffResult = await query<StaffRow>(
            `SELECT 
        r.employee_id,
        r.employee_name,
        r.position,
        r.area,
        sc.admin_score,
        sc.supervisor_score,
        sc.recruiter_score,
        sc.final_score,
        (SELECT COUNT(*) > 0 FROM submissions_raw sr WHERE sr.month = r.month AND sr.employee_id = r.employee_id AND sr.role = 'admin') as has_admin,
        (SELECT COUNT(*) > 0 FROM submissions_raw sr WHERE sr.month = r.month AND sr.employee_id = r.employee_id AND sr.role = 'supervisor') as has_supervisor,
        (SELECT COUNT(*) > 0 FROM submissions_raw sr WHERE sr.month = r.month AND sr.employee_id = r.employee_id AND sr.role = 'recruiter') as has_recruiter
      FROM roster_monthly r
      LEFT JOIN scores_computed sc ON r.month = sc.month AND r.employee_id = sc.employee_id
      ${whereClause}
      ORDER BY r.area, r.employee_name`,
            params
        );

        const staff = staffResult.rows;

        // Calculate completion rates
        const totalStaff = staff.length;
        const completedAdmin = staff.filter((s) => s.has_admin).length;
        const completedSupervisor = staff.filter((s) => s.has_supervisor).length;
        const completedRecruiter = staff.filter((s) => s.has_recruiter).length;
        const completedAll = staff.filter((s) => s.final_score !== null).length;

        // Calculate averages  
        const adminScores = staff.filter((s) => s.admin_score !== null).map((s) => s.admin_score!);
        const supervisorScores = staff.filter((s) => s.supervisor_score !== null).map((s) => s.supervisor_score!);
        const recruiterScores = staff.filter((s) => s.recruiter_score !== null).map((s) => s.recruiter_score!);
        const finalScores = staff.filter((s) => s.final_score !== null).map((s) => s.final_score!);

        const avg = (arr: number[]) => arr.length ? Math.round(arr.reduce((a, b) => a + b, 0) / arr.length) : null;

        // Group by area for area breakdown
        const areaBreakdown: Record<string, { total: number; completed: number; avgScore: number | null }> = {};
        for (const s of staff) {
            if (!areaBreakdown[s.area]) {
                areaBreakdown[s.area] = { total: 0, completed: 0, avgScore: null };
            }
            areaBreakdown[s.area].total++;
            if (s.final_score !== null) {
                areaBreakdown[s.area].completed++;
            }
        }

        // Calculate avg score per area
        for (const areaKey of Object.keys(areaBreakdown)) {
            const areaScores = staff
                .filter((s) => s.area === areaKey && s.final_score !== null)
                .map((s) => s.final_score!);
            areaBreakdown[areaKey].avgScore = avg(areaScores);
        }

        return NextResponse.json({
            month,
            summary: {
                totalStaff,
                completionRates: {
                    admin: { completed: completedAdmin, total: totalStaff, percentage: totalStaff ? Math.round((completedAdmin / totalStaff) * 100) : 0 },
                    supervisor: { completed: completedSupervisor, total: totalStaff, percentage: totalStaff ? Math.round((completedSupervisor / totalStaff) * 100) : 0 },
                    recruiter: { completed: completedRecruiter, total: totalStaff, percentage: totalStaff ? Math.round((completedRecruiter / totalStaff) * 100) : 0 },
                    all: { completed: completedAll, total: totalStaff, percentage: totalStaff ? Math.round((completedAll / totalStaff) * 100) : 0 },
                },
                averages: {
                    admin: avg(adminScores),
                    supervisor: avg(supervisorScores),
                    recruiter: avg(recruiterScores),
                    overall: avg(finalScores),
                },
            },
            areaBreakdown,
            staff: staff.map((s) => ({
                employeeId: s.employee_id,
                name: s.employee_name,
                position: s.position,
                area: s.area,
                scores: {
                    admin: s.admin_score,
                    supervisor: s.supervisor_score,
                    recruiter: s.recruiter_score,
                    final: s.final_score,
                },
                missing: [
                    !s.has_admin && 'admin',
                    !s.has_supervisor && 'supervisor',
                    !s.has_recruiter && 'recruiter',
                ].filter(Boolean),
            })),
        });
    } catch (error) {
        if (error instanceof z.ZodError) {
            return NextResponse.json({ error: error.issues[0].message }, { status: 400 });
        }

        if (error instanceof Error && error.message === 'Unauthorized') {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        console.error('Dashboard error:', error);
        return NextResponse.json({ error: 'Failed to load dashboard' }, { status: 500 });
    }
}
