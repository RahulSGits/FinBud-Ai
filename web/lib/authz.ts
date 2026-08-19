// Who can see and change what.
//
// Employees are no longer read-only: they author their own AI agents and run
// their own campaigns. That makes "can this person touch this row?" a real
// question on almost every route, so the answer lives here rather than being
// re-derived (and drifting) in each handler.
//
// The model, in one table:
//
//   Resource   Employee                                  Admin
//   ────────────────────────────────────────────────────────────
//   Agent      authors their own; may *use* any active   all
//   Campaign   their own only                            all
//   Contact    those assigned to them                    all
//   Call       on their leads, or started by them        all
//   Knowledge  read                                      read + write
//   Team/Settings/Analytics  no                          yes
//
// The rule of thumb: an employee may *use* anything the company has published,
// but may only *change* what they created.
import { Prisma, Role } from '@prisma/client';
import { AuthError, type SessionUser } from './auth';

/** The platform owner. Belongs to no company and sees across all of them. */
export function isSuperAdmin(user: SessionUser): boolean {
  return user.role === Role.super_admin;
}

/**
 * Administrator of their own company.
 *
 * A super admin counts, so every screen an admin can reach the platform owner
 * can reach too — without a second branch in each handler that could disagree
 * with this one.
 */
export function isAdmin(user: SessionUser): boolean {
  return user.role === Role.admin || user.role === Role.super_admin;
}

/** Throwing guard for handlers that have already resolved a user. */
/**
 * May this caller use the company-administrator area?
 *
 * Admins, plus the platform owner — who needs to see a company's own screens to
 * support it. Every /admin page previously tested `role !== 'admin'` directly,
 * which bounced a super_admin to /dashboard; having no company they cannot use
 * that either, so the account was locked out of the whole application. One
 * predicate rather than fifteen copies of the comparison.
 */
export function canUseAdminArea(user: SessionUser): boolean {
  return user.role === Role.admin || isSuperAdmin(user);
}

export function assertAdmin(user: SessionUser): void {
  if (!isAdmin(user)) throw new AuthError('Forbidden', 403);
}

/** Platform-owner-only guard, for the Super Admin surface. */
export function assertSuperAdmin(user: SessionUser): void {
  if (!isSuperAdmin(user)) throw new AuthError('Forbidden', 403);
}

// ---------------------------------------------------------------------------
// Tenant isolation
//
// This is the part that must never be forgotten, so it is not left to memory:
// every scope below composes `tenant(user)`, and none of them returns `{}` any
// more. That distinction is the whole security boundary — before tenancy an
// admin's scope was `{}` meaning "the whole table", and the same `{}` under
// tenancy means "every company's rows".
//
// The failure mode is chosen deliberately. A company id that is missing yields
// a filter that matches NOTHING rather than everything, so a bug shows up as a
// user who cannot see their own data — loud, immediate, harmless — instead of
// one who can see somebody else's.
// ---------------------------------------------------------------------------

/**
 * The tenant clause for this user.
 *
 * Only a super admin gets `{}`. For anyone else the company comes from their
 * session row, never from the request, so a forged `companyId` in a payload or
 * query string cannot widen what they see.
 */
export function tenant(user: SessionUser): { companyId?: string } {
  if (isSuperAdmin(user)) return {};
  // An impossible id rather than `{}`: a user with no company must match no
  // rows. Returning an empty filter here would hand them the entire platform.
  return { companyId: user.companyId ?? '__no_company__' };
}

// ---------------------------------------------------------------------------
// Query scopes
//
// Each returns a Prisma `where` fragment. Admins get `{}` — an empty filter
// rather than a special case, so callers never branch on role themselves.
// ---------------------------------------------------------------------------

/**
 * Agents an employee may see: every active agent (they need to be able to pick
 * one to dial with) plus their own drafts, which nobody else should see yet.
 */
export function visibleAgents(user: SessionUser): Prisma.AgentWhereInput {
  if (isAdmin(user)) return tenant(user);
  return { ...tenant(user), OR: [{ isActive: true }, { createdById: user.id }] };
}

/** Agents an employee may edit or delete: only ones they authored. */
export function editableAgents(user: SessionUser): Prisma.AgentWhereInput {
  if (isAdmin(user)) return tenant(user);
  return { ...tenant(user), createdById: user.id };
}

export function visibleCampaigns(user: SessionUser): Prisma.CampaignWhereInput {
  if (isAdmin(user)) return tenant(user);
  return { ...tenant(user), createdById: user.id };
}

export function visibleContacts(user: SessionUser): Prisma.ContactWhereInput {
  if (isAdmin(user)) return tenant(user);
  return { ...tenant(user), assignedToId: user.id };
}

/**
 * Calls an employee may see: those on a lead assigned to them, plus any they
 * personally started — a call they placed before the lead was reassigned is
 * still their own record.
 */
/**
 * Colleagues the caller may see.
 *
 * Unlike the other scopes this is not narrowed further by role: everyone in a
 * company can see who else is in it, which is what a team page is for. The
 * tenant boundary is the whole of the restriction.
 */
export function visibleUsers(user: SessionUser): Prisma.UserWhereInput {
  return tenant(user);
}

/** Knowledge-base files the caller may read. Tenant boundary only. */
export function visibleDocuments(user: SessionUser): Prisma.DocumentWhereInput {
  return tenant(user);
}

export function visibleCalls(user: SessionUser): Prisma.CallWhereInput {
  if (isAdmin(user)) return tenant(user);
  return {
    ...tenant(user),
    OR: [{ contact: { assignedToId: user.id } }, { startedById: user.id }],
  };
}

// ---------------------------------------------------------------------------
// Ownership checks
// ---------------------------------------------------------------------------

/**
 * Confirm a row is within the user's reach before mutating it.
 *
 * Takes the row's owner id rather than the row, so it works for any model and
 * cannot be fooled by a payload the client supplied.
 */
export function assertOwner(
  user: SessionUser,
  ownerId: string | null | undefined,
  what: string
): void {
  // Company membership is checked by the caller's scoped read — this only
  // answers "may this person change something inside their own company".
  if (isAdmin(user)) return;
  if (ownerId !== user.id) {
    throw new AuthError(`You can only change ${what} you created.`, 403);
  }
}

/**
 * The caller's company, or a refusal.
 *
 * Every tenant-owned row requires a company, and a session's is nullable
 * because a super admin has none. Rather than each create coping with that
 * separately — and one of them eventually coping by writing a null — the
 * narrowing happens once, here.
 *
 * A super admin genuinely cannot create company-owned rows without choosing a
 * company first; the message says so instead of failing at the database.
 */
export function requireCompany(user: SessionUser): string {
  if (!user.companyId) {
    throw new AuthError(
      isSuperAdmin(user)
        ? 'Choose a company before creating anything inside one.'
        : 'Your account is not attached to a company.',
      400
    );
  }
  return user.companyId;
}

/** Map an AuthError (or anything else) onto a JSON response body + status. */
export function errorResponse(e: unknown): { body: { error: string }; status: number } {
  if (e instanceof AuthError) return { body: { error: e.message }, status: e.status };
  const message = e instanceof Error ? e.message : 'Server error';
  return { body: { error: message }, status: 500 };
}
