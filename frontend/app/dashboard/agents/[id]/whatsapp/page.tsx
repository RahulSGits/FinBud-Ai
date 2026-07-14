import AgentWhatsAppSettings from '@/components/dashboard/agent-whatsapp-settings';
import Link from 'next/link';
import { ChevronLeft } from 'lucide-react';
import { db } from '@/lib/db';
import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';

export default async function AgentWhatsAppPage({ params }: { params: { id: string } }) {
  const user = await getAuthUser();
  if (!user || !user.organizationId) redirect('/login');

  const agent = await db.agent.findUnique({
    where: { id: params.id, organizationId: user.organizationId }
  });

  if (!agent) redirect('/dashboard/agents');

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-4">
        <Link href={`/dashboard/agents/${params.id}`} className="p-2 bg-white dark:bg-[#0f172a] rounded-lg shadow-sm border border-slate-200 dark:border-slate-800 text-slate-500 hover:text-slate-900 dark:hover:text-white transition-colors">
          <ChevronLeft className="w-5 h-5" />
        </Link>
        <div>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{agent.name} - WhatsApp Automation</h1>
          <p className="text-sm text-slate-500 dark:text-slate-400">Configure conditional WhatsApp messages for this specific agent.</p>
        </div>
      </div>
      
      <AgentWhatsAppSettings agentId={params.id} />
    </div>
  );
}
