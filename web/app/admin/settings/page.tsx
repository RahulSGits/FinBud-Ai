import { redirect } from 'next/navigation';
import { db } from '@/lib/db';
import { getCurrentUser } from '@/lib/auth';
import { defaultProviderId, isMockMode, listProviders } from '@/lib/providers';
import { parseBusinessHours } from '@/lib/campaigns/business-hours';
import { PageHeader } from '@/components/shell/page-header';
import {
  SettingsManager,
  type IntegrationStatus,
  type PlatformSettings,
  type ProviderCard,
} from '@/components/settings/settings-manager';

export const dynamic = 'force-dynamic';

// Kept in step with the same list in app/api/settings/route.ts by hand: a
// route file cannot export helpers without breaking Next's route type contract,
// so the defaults are declared in both places rather than shared from one.
const DEFAULTS: PlatformSettings = {
  companyName: 'Finance Buddha',
  dailyCallLimit: 100,
  businessHours: { tz: 'Asia/Kolkata', days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '20:00' },
  retryLimit: 1,
  retryDelayMins: 60,
};

function whole(raw: unknown, fallback: number, min: number): number {
  const n = Math.trunc(Number(raw));
  return typeof raw !== 'boolean' && Number.isFinite(n) && n >= min ? n : fallback;
}

export default async function SettingsPage() {
  const user = await getCurrentUser();
  if (!user) redirect('/login');
  if (user.role !== 'admin') redirect('/dashboard');

  const [rows, providers] = await Promise.all([db.setting.findMany(), listProviders()]);
  const stored = new Map<string, unknown>(rows.map((r) => [r.key, r.value as unknown]));

  const companyName = String(stored.get('companyName') ?? '').trim();
  const hours = parseBusinessHours(stored.get('businessHours'));

  const settings: PlatformSettings = {
    companyName: companyName || DEFAULTS.companyName,
    dailyCallLimit: whole(stored.get('dailyCallLimit'), DEFAULTS.dailyCallLimit, 1),
    businessHours: hours ?? DEFAULTS.businessHours,
    retryLimit: whole(stored.get('retryLimit'), DEFAULTS.retryLimit, 0),
    retryDelayMins: whole(stored.get('retryDelayMins'), DEFAULTS.retryDelayMins, 1),
  };

  const defaultId = defaultProviderId();
  const cards: ProviderCard[] = providers.map((p) => ({
    id: p.id,
    name: p.name,
    configured: p.configured,
    isDefault: p.id === defaultId,
    capabilities: p.capabilities,
  }));

  // Presence is resolved here and only the boolean crosses to the client — a
  // key must never reach the browser, not even to be masked there.
  const integrations: IntegrationStatus[] = [
    {
      id: 'openai',
      label: 'AI authoring',
      envVar: 'OPENAI_API_KEY',
      configured: !!process.env.OPENAI_API_KEY,
      impact: 'Generate agent and Enhance are unavailable, so every prompt section has to be written by hand.',
    },
    {
      id: 'resend',
      label: 'Email invites',
      envVar: 'RESEND_API_KEY',
      configured: !!process.env.RESEND_API_KEY,
      impact: 'Invite and password-reset links are not emailed — an admin has to copy the link and pass it on.',
    },
    {
      id: 'cron',
      label: 'Campaign scheduler',
      envVar: 'CRON_SECRET',
      configured: !!process.env.CRON_SECRET,
      impact: 'An external scheduler cannot authenticate to the tick endpoint, so campaigns only advance while an admin has the dashboard open.',
    },
  ];

  return (
    <>
      <PageHeader title="Settings" subtitle="Platform defaults, voice engines and integrations" />
      <div className="px-6 pb-10 space-y-6">
        <SettingsManager
          settings={settings}
          providers={cards}
          mockMode={isMockMode()}
          integrations={integrations}
        />
      </div>
    </>
  );
}
