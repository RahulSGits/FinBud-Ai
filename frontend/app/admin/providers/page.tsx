import { getAuthUser } from '@/lib/auth-server';
import { redirect } from 'next/navigation';
import { Server } from 'lucide-react';
import ProviderList from './provider-list';

export const dynamic = 'force-dynamic';

export default async function ProvidersPage() {
  const user = await getAuthUser();
  if (!user || user.role !== 'admin') redirect('/dashboard');

  const initialProviders = [
    { name: 'Supabase Database', desc: 'Primary database and authentication provider', isConfigured: !!process.env.DATABASE_URL && !process.env.DATABASE_URL.includes('placeholder') },
    { name: 'Sarvam AI', desc: 'Text-to-speech for regional Indian languages', isConfigured: !!process.env.SARVAM_API_KEY && !process.env.SARVAM_API_KEY.includes('placeholder') },
    { name: 'Vapi Native', desc: 'Real-time conversational voice infrastructure', isConfigured: !!process.env.VAPI_API_KEY && !process.env.VAPI_API_KEY.includes('placeholder') },
    { name: 'ElevenLabs', desc: 'Premium voice generation for global accents', isConfigured: !!process.env.ELEVENLABS_API_KEY && !process.env.ELEVENLABS_API_KEY.includes('placeholder') },
    { name: 'OpenAI', desc: 'Foundational LLM for conversational intelligence', isConfigured: !!process.env.OPENAI_API_KEY && !process.env.OPENAI_API_KEY.includes('placeholder') },
    { name: 'Deepgram', desc: 'Ultra-fast speech-to-text transcription', isConfigured: !!process.env.DEEPGRAM_API_KEY && !process.env.DEEPGRAM_API_KEY.includes('placeholder') },
  ];

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
          <Server className="w-8 h-8 text-indigo-500" />
          API Providers
        </h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1">Manage, monitor, and test third-party API configurations.</p>
      </div>

      <div className="bg-white dark:bg-[#0f172a] rounded-2xl shadow-sm border border-slate-200 dark:border-white/5 p-6">
        <h3 className="text-lg font-semibold text-slate-900 dark:text-white mb-4">API Configurations & Integrations</h3>
        <ProviderList initialProviders={initialProviders} />
      </div>
    </div>
  );
}
