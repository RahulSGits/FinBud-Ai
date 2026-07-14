import WhatsAppSettingsClient from '@/components/dashboard/whatsapp-settings';

export default function WhatsAppIntegrationsPage() {
  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">WhatsApp Integration</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Configure your Meta WhatsApp Business API credentials to enable automated messaging.</p>
      </div>
      
      <WhatsAppSettingsClient />
    </div>
  );
}
