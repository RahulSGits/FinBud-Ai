import { redirect } from 'next/navigation';
import { getCurrentUser } from '@/lib/auth';
import { canUseAdminArea } from '@/lib/authz';
import { PageHeader } from '@/components/shell/page-header';
import { AgentBuilder } from '@/components/agents/agent-builder';

export const dynamic = 'force-dynamic';

export default async function NewAgentPage() {
  // Re-checked here as well as in the layout: a layout is not re-executed on
  // every client-side navigation, so the page owns its own gate.
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (!canUseAdminArea(user)) redirect('/dashboard');

  return (
    <>
      <PageHeader title="New AI agent" subtitle="Describe it, review the draft, then activate" />
      <div className="px-6 pb-12"><AgentBuilder /></div>
    </>
  );
}
