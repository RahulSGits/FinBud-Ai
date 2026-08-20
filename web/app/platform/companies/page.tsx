import { redirect } from 'next/navigation';
import { CompanyStatus } from '@prisma/client';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { isSuperAdmin } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { CompaniesManager, type CompanyRow } from '@/components/platform/companies-manager';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!isSuperAdmin(user)) redirect(user.role === 'admin' ? '/admin' : '/dashboard');

  // Grouped once per model, exactly as the API does it — a count per company
  // would turn this page into one query per tenant.
  const [companies, userRows, agentRows, contactRows, callRows, minuteRows] = await Promise.all([
    db.company.findMany({ orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
    db.user.groupBy({ by: ['companyId'], _count: true }),
    db.agent.groupBy({ by: ['companyId'], _count: true }),
    db.contact.groupBy({ by: ['companyId'], _count: true }),
    db.call.groupBy({ by: ['companyId'], _count: true }),
    db.call.groupBy({ by: ['companyId'], _sum: { durationSec: true } }),
  ]);

  const count = (rows: { companyId: string | null; _count: number }[]) =>
    new Map(rows.map((r) => [r.companyId, r._count]));
  const users = count(userRows);
  const agents = count(agentRows);
  const contacts = count(contactRows);
  const calls = count(callRows);
  const minutes = new Map(
    minuteRows.map((r) => [r.companyId, Math.ceil((r._sum.durationSec ?? 0) / 60)])
  );

  const rows: CompanyRow[] = companies.map((co) => ({
    id: co.id,
    name: co.name,
    slug: co.slug,
    status: co.status,
    plan: co.plan,
    contactEmail: co.contactEmail,
    createdAt: co.createdAt.toISOString(),
    usage: {
      users: users.get(co.id) ?? 0,
      agents: agents.get(co.id) ?? 0,
      contacts: contacts.get(co.id) ?? 0,
      calls: calls.get(co.id) ?? 0,
      callMinutes: minutes.get(co.id) ?? 0,
    },
    limits: {
      maxUsers: co.maxUsers,
      maxAgents: co.maxAgents,
      maxContacts: co.maxContacts,
      maxCallMinutes: co.maxCallMinutes,
    },
  }));

  const active = rows.filter((r) => r.status === CompanyStatus.active).length;

  return (
    <>
      <PageHeader
        title="Companies"
        subtitle={`${rows.length} on the platform · ${active} active`}
      />
      <div className="px-6 pb-10">
        <CompaniesManager companies={rows} />
      </div>
    </>
  );
}
