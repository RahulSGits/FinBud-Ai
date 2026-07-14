'use client';

import { useState, useEffect } from 'react';
import { Save, AlertCircle, CheckCircle2, Loader2, MessageSquare } from 'lucide-react';

export default function WhatsAppSettingsClient() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<{type: 'success' | 'error', message: string} | null>(null);
  
  const [formData, setFormData] = useState({
    apiKey: '',
    apiToken: '',
    accountSid: '',
    subdomain: 'api.exotel.com',
    whatsappNumber: '',
    isActive: true
  });

  useEffect(() => {
    fetch('/api/whatsapp-settings')
      .then(res => res.json())
      .then(data => {
        if (data.id) {
          setFormData({
            apiKey: data.apiKey || '',
            apiToken: data.apiToken || '',
            accountSid: data.accountSid || '',
            subdomain: data.subdomain || 'api.exotel.com',
            whatsappNumber: data.whatsappNumber || '',
            isActive: data.isActive
          });
        }
      })
      .finally(() => setLoading(false));
  }, []);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setStatus(null);
    try {
      const res = await fetch('/api/whatsapp-settings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setStatus({ type: 'success', message: 'Exotel WhatsApp settings saved successfully!' });
      } else {
        setStatus({ type: 'error', message: 'Failed to save settings.' });
      }
    } catch (err) {
      setStatus({ type: 'error', message: 'An error occurred while saving.' });
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {status && (
        <div className={`p-4 rounded-xl flex items-center gap-3 ${status.type === 'success' ? 'bg-emerald-50 dark:bg-emerald-500/10 text-emerald-700 dark:text-emerald-400' : 'bg-red-50 dark:bg-red-500/10 text-red-700 dark:text-red-400'}`}>
          {status.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
          <p className="text-sm font-medium">{status.message}</p>
        </div>
      )}

      <div className="bg-white dark:bg-[#0f172a] rounded-2xl border border-slate-200 dark:border-white/5 overflow-hidden">
        <div className="p-6 border-b border-slate-200 dark:border-white/5 bg-slate-50 dark:bg-slate-800/50 flex justify-between items-center">
          <div>
            <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquare className="w-5 h-5 text-emerald-500" />
              Exotel WhatsApp API
            </h3>
            <p className="text-sm text-slate-500 mt-1">Connect your Exotel account to automate WhatsApp conditional follow-ups.</p>
          </div>
          <label className="relative inline-flex items-center cursor-pointer">
            <input type="checkbox" className="sr-only peer" checked={formData.isActive} onChange={e => setFormData({...formData, isActive: e.target.checked})} />
            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer dark:bg-slate-700 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-slate-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all dark:border-slate-600 peer-checked:bg-emerald-500"></div>
          </label>
        </div>

        <div className="p-6 space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Exotel API Key</label>
              <input 
                type="text" required
                value={formData.apiKey}
                onChange={e => setFormData({...formData, apiKey: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Exotel API Token</label>
              <input 
                type="password" required
                value={formData.apiToken}
                onChange={e => setFormData({...formData, apiToken: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Account SID</label>
              <input 
                type="text" required
                value={formData.accountSid}
                onChange={e => setFormData({...formData, accountSid: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Subdomain</label>
              <input 
                type="text" required
                value={formData.subdomain}
                onChange={e => setFormData({...formData, subdomain: e.target.value})}
                className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
                placeholder="api.exotel.com"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Exotel WhatsApp Number (Sender)</label>
            <input 
              type="text" required
              value={formData.whatsappNumber}
              onChange={e => setFormData({...formData, whatsappNumber: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm focus:ring-2 focus:ring-emerald-500"
              placeholder="+919876543210"
            />
          </div>
        </div>
        <div className="px-6 py-4 bg-slate-50 dark:bg-slate-800/30 border-t border-slate-200 dark:border-white/5 flex justify-end">
          <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg disabled:opacity-50 transition-colors">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
            Save Configuration
          </button>
        </div>
      </div>
    </form>
  );
}
