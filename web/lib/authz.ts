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

export function isAdmin(user: SessionUser): boolean {
  return user.role === Role.admin;
}

/** Throwing guard for handlers that have already resolved a user. */
export function assertAdmin(user: SessionUser): void {
  if (!isAdmin(user)) throw new AuthError('Forbidden', 403);
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
  if (isAdmin(user)) return {};
  return { OR: [{ isActive: true }, { createdById: user.id }] };
}

/** Agents an employee may edit or delete: only ones they authored. */
export function editableAgents(user: SessionUser): Prisma.AgentWhereInput {
  if (isAdmin(user)) return {};
  return { createdById: user.id };
}

export function visibleCampaigns(user: SessionUser): Prisma.CampaignWhereInput {
  if (isAdmin(user)) return {};
  return { createdById: user.id };
}

export function visibleContacts(user: SessionUser): Prisma.ContactWhereInput {
  if (isAdmin(user)) return {};
  return { assignedToId: user.id };
}

/**
 * Calls an employee may see: those on a lead assigned to them, plus any they
 * personally started — a call they placed before the lead was reassigned is
 * still their own record.
 */
export function visibleCalls(user: SessionUser): Prisma.CallWhereInput {
  if (isAdmin(user)) return {};
  return { OR: [{ contact: { assignedToId: user.id } }, { startedById: user.id }] };
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
  if (isAdmin(user)) return;
  if (ownerId !== user.id) {
    throw new AuthError(`You can only change ${what} you created.`, 403);
  }
}

/** Map an AuthError (or anything else) onto a JSON response body + status. */
export function errorResponse(e: unknown): { body: { error: string }; status: number } {
  if (e instanceof AuthError) return { body: { error: e.message }, status: e.status };
  const message = e instanceof Error ? e.message : 'Server error';
  return { body: { error: message }, status: 500 };
}
