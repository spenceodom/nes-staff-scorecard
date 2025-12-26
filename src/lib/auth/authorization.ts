/**
 * Authorization helpers for role and area-based access control.
 */

import { UserSession } from './session';

// =============================================================================
// ROLE HIERARCHY
// =============================================================================

const GLOBAL_ROLES = ['super_admin', 'exec'];

// =============================================================================
// AUTHORIZATION CHECKS
// =============================================================================

/**
 * Check if user has a specific role (optionally scoped to an area).
 */
export function hasRole(session: UserSession, role: string, area?: string): boolean {
    return session.roles.some((r) => {
        if (r.role !== role) return false;
        if (r.area === 'global') return true; // Global role grants access to all areas
        if (area && r.area !== area) return false;
        return true;
    });
}

/**
 * Check if user has any of the specified roles.
 */
export function hasAnyRole(session: UserSession, roles: string[], area?: string): boolean {
    return roles.some((role) => hasRole(session, role, area));
}

/**
 * Check if user is a super admin (full access).
 */
export function isSuperAdmin(session: UserSession): boolean {
    return hasRole(session, 'super_admin');
}

/**
 * Check if user has global access (either via role or global area assignment).
 */
export function hasGlobalAccess(session: UserSession): boolean {
    // Check for hardcoded global roles
    const hasGlobalRole = GLOBAL_ROLES.some((role) =>
        session.roles.some((r) => r.role === role)
    );

    // Also check if ANY role is assigned to the 'global' area
    const hasGlobalAssignment = session.roles.some((r) => r.area === 'global');

    return hasGlobalRole || hasGlobalAssignment;
}

/**
 * Get all areas the user has access to.
 * Returns ['global'] for super_admin/exec, otherwise specific areas.
 */
export function getUserAreas(session: UserSession): string[] {
    if (hasGlobalAccess(session)) {
        return ['global'];
    }

    const areas = new Set<string>();
    for (const role of session.roles) {
        if (role.area !== 'global') {
            areas.add(role.area);
        }
    }

    return Array.from(areas);
}

/**
 * Check if user can access a specific area.
 */
export function canAccessArea(session: UserSession, area: string): boolean {
    if (hasGlobalAccess(session)) return true;
    return session.roles.some((r) => r.area === area);
}

/**
 * Build a SQL WHERE clause for area filtering.
 * Returns null if user has global access (no filtering needed).
 */
export function buildAreaFilter(
    session: UserSession,
    areaColumn: string = 'area'
): { clause: string; params: string[] } | null {
    if (hasGlobalAccess(session)) {
        return null; // No filtering needed
    }

    const areas = getUserAreas(session);
    if (areas.length === 0) {
        // User has no area access - return impossible condition
        return { clause: '1 = 0', params: [] };
    }

    const placeholders = areas.map((_, i) => `$${i + 1}`).join(', ');
    return {
        clause: `${areaColumn} IN (${placeholders})`,
        params: areas,
    };
}

// =============================================================================
// ROLE-SPECIFIC CHECKS
// =============================================================================

/**
 * Check if user can upload roster (admin+ roles).
 */
export function canUploadRoster(session: UserSession, area?: string): boolean {
    return hasAnyRole(session, ['super_admin', 'exec', 'director', 'admin'], area);
}

/**
 * Check if user can manage supervisor assignments.
 */
export function canManageAssignments(session: UserSession, area?: string): boolean {
    return hasAnyRole(session, ['super_admin', 'exec', 'director', 'admin'], area);
}

/**
 * Check if user can submit admin evaluations.
 */
export function canSubmitAdmin(session: UserSession, area?: string): boolean {
    return hasAnyRole(session, ['super_admin', 'director', 'admin'], area);
}

/**
 * Check if user can submit supervisor evaluations.
 */
export function canSubmitSupervisor(session: UserSession): boolean {
    // House managers and admins can submit supervisor evaluations
    // (must also be assigned to the specific employee)
    return hasAnyRole(session, ['super_admin', 'director', 'admin', 'house_manager']);
}

/**
 * Check if user can submit recruiter evaluations.
 */
export function canSubmitRecruiter(session: UserSession, area?: string): boolean {
    return hasAnyRole(session, ['super_admin', 'recruiter'], area);
}

/**
 * Check if user can view dashboard.
 */
export function canViewDashboard(session: UserSession, area?: string): boolean {
    return hasAnyRole(session, ['super_admin', 'exec', 'director', 'admin', 'recruiter'], area);
}
