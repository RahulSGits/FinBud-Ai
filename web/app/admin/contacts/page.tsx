import { redirect } from 'next/navigation';
import { ContactStatus, Role, UserStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { visibleCampaigns, visibleContacts, visibleUsers } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { ContactsManager, type ContactRow } from '@/components/contacts/contacts-manager';

export const dynamic = 'force-dynamic';

const PAGE_SIZE = 500;
/** Enough for the detail panel without pulling every call for 500 contacts. */
const CALLS_PER_CONTACT = 5;

const STATUS_ORDER: ContactStatus[] = [
  ContactStatus.pending,
  ContactStatus.calling,
  ContactStatus.retry,
  ContactStatus.completed,
  ContactStatus.exhausted,
  ContactStatus.do_not_call,
];

/** Prisma returns a Json union; only a plain object is of any use to the UI. */
function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  return value as Record<string, unknown>;
}

export default async function AdminContactsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== Role.admin) redirect('/dashboard');

  const [contacts, counts, employees, campaigns] = await Promise.all([
    db.contact.findMany({
      where: visibleContacts(user),
      orderBy: { createdAt: 'desc' },
      take: PAGE_SIZE,
      include: {
        assignedTo: { select: { id: true, name: true } },
        campaign: { select: { id: true, name: true } },
        _count: { select: { calls: true } },
        calls: {
          orderBy: { startedAt: 'desc' },
          take: CALLS_PER_CONTACT,
          select: {
            id: true, status: true, leadStatus: true,
            durationSec: true, summary: true, startedAt: true,
          },
        },
      },
    }),
    db.contact.groupBy({ by: ['status'], where: visibleContacts(user), _count: true }),
    db.user.findMany({
      where: { ...visibleUsers(user), role: Role.employee, status: { not: UserStatus.disabled } },
      select: { id: true, name: true },
      orderBy: { name: 'asc' },
    }),
    db.campaign.findMany({
      where: visibleCampaigns(user),
      select: { id: true, name: true },
      orderBy: { createdAt: 'desc' },
    }),
  ]);

  const rows: ContactRow[] = contacts.map((c) => ({
    id: c.id,
    name: c.name,
    phone: c.phone,
    email: c.email,
    company: c.company,
    loanType: c.loanType,
    loanAmount: c.loanAmount,
    status: c.status,
    tags: c.tags,
    attempts: c.attempts,
    assignedToId: c.assignedToId,
    assignedToName: c.assignedTo?.name ?? null,
    campaignId: c.campaignId,
    campaignName: c.campaign?.name ?? null,
    callCount: c._count.calls,
    lastAttemptAt: c.lastAttemptAt?.toISOString() ?? null,
    nextAttemptAt: c.nextAttemptAt?.toISOString() ?? null,
    createdAt: c.createdAt.toISOString(),
    customFields: asRecord(c.customFields),
    calls: c.calls.map((call) => ({
      id: call.id,
      status: call.status,
      leadStatus: call.leadStatus,
      durationSec: call.durationSec,
      summary: call.summary,
      startedAt: call.startedAt.toISOString(),
    })),
  }));

  const byStatus = new Map(counts.map((c) => [c.status, c._count]));
  const total = counts.reduce((n, c) => n + c._count, 0);

  const breakdown = STATUS_ORDER
    .filter((s) => (byStatus.get(s) ?? 0) > 0)
    .map((s) => `${byStatus.get(s)} ${s.replace(/_/g, ' ')}`)
    .join(' · ');

  const subtitle =
    total === 0
      ? 'No contacts yet'
      : [
          `${total} contact${total === 1 ? '' : 's'}`,
          breakdown,
          total > PAGE_SIZE ? `showing the newest ${PAGE_SIZE}` : '',
        ]
          .filter(Boolean)
          .join(' · ');

  return (
    <>
      <PageHeader title="Contacts" subtitle={subtitle} />
      <div className="px-6 pb-10 space-y-6">
        <ContactsManager contacts={rows} employees={employees} campaigns={campaigns} />
      </div>
    </>
  );
}
