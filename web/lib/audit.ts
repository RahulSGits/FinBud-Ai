// Recording who did what, to whose data.
//
// AuditLog has carried a companyId since tenancy landed, and almost nothing
// set it: twenty-nine of thirty writes recorded only the actor. The rows were
// not wrong so much as unusable — every company's history piled into the same
// untenanted heap, the RLS policy on the table could never show a company its
// own trail, and the platform audit view labelled all of it "Platform".
//
// The fix is not to remember the field thirty times. It is to make the actor
// the thing you pass, and derive the tenant from them here, so the next call
// site cannot forget what it never had to type.
import { Prisma } from '@prisma/client';

/**
 * Anyone who can act: a session user, or a User row, which carry the same two
 * fields. Deliberately structural rather than `SessionUser` — several writes
 * happen at moments when no session exists yet, such as accepting an invite.
 */
export interface AuditActor {
  id: string;
  companyId?: string | null;
}

export interface AuditEntry {
  action: string;
  entity: string;
  entityId?: string | null;
  meta?: Prisma.InputJsonValue;
  /**
   * The tenant, when it is not the actor's own.
   *
   * Needed by the webhook paths, which have no actor at all but do know which
   * company's call they are reporting on. Passing it explicitly is also how a
   * platform-owner action on a customer gets filed under that customer.
   */
  companyId?: string | null;
}

/**
 * Build the row for an audit write.
 *
 * Returns the `data` object rather than performing the write, so it composes
 * with `db` and with a transaction client alike — several of these writes must
 * land in the same transaction as the change they describe.
 */
export function auditData(
  actor: AuditActor | null,
  entry: AuditEntry
): Prisma.AuditLogUncheckedCreateInput {
  const data: Prisma.AuditLogUncheckedCreateInput = {
    action: entry.action,
    entity: entry.entity,
    entityId: entry.entityId ?? null,
    userId: actor?.id ?? null,
    // An explicit companyId wins, including an explicit null: a platform-owner
    // action genuinely belongs to no tenant, and `?? actor.companyId` would
    // quietly refile it.
    companyId: entry.companyId !== undefined ? entry.companyId : (actor?.companyId ?? null),
  };
  // Omitted rather than set to undefined — Prisma treats a present `meta` key
  // as a write, and JSON null is a different thing from no value.
  if (entry.meta !== undefined) data.meta = entry.meta;
  return data;
}
