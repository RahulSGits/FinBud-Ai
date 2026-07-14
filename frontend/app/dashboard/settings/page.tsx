'use client';

import Header from '@/components/dashboard/header';
import { useState, useEffect } from 'react';
import { User, Building2, Bell, Save, Upload, AlertCircle, Loader2, MessageCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { useAuth } from '@/lib/auth-context';
import { toast } from 'sonner';

const TABS = [
  { id: 'profile', label: 'Profile Settings', icon: User },
  { id: 'company', label: 'Company Info', icon: Building2 },
  { id: 'whatsapp', label: 'WhatsApp Follow-up', icon: MessageCircle },
  { id: 'notifications', label: 'Notifications', icon: Bell }
];

export default function SettingsPage() {
  const [tab, setTab] = useState('profile');
  const { user, refreshProfile } = useAuth();
  const [form, setForm] = useState({ fullName: '', phone: '', company: '', website: '', industry: 'Technology / SaaS', whatsappTemplate: '' });
  const [waEnabled, setWaEnabled] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (user) {
      setForm(f => ({
        ...f,
        fullName: user.fullName || '',
        phone: user.phone || '',
        company: user.company || '',
        website: user.website || '',
        industry: user.industry || 'Technology / SaaS',
        whatsappTemplate: user.whatsappTemplate || 'Hi {name}! Thanks for your interest during our call. Our team will reach out shortly. — {company}',
      }));
      setWaEnabled(!!user.whatsappEnabled);
    }
  }, [user]);

  const set = (k: string, v: string) => setForm(f => ({ ...f, [k]: v }));

  const save = async (fields: string[], label: string, extra?: Record<string, any>) => {
    setSaving(true);
    try {
      const payload: Record<string, any> = { ...extra };
      for (const f of fields) payload[f] = (form as any)[f];
      const r = await fetch('/api/profile', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      if (r.ok) { await refreshProfile(); toast.success(`${label} saved`); }
      else toast.error('Could not save');
    } finally { setSaving(false); }
  };

  const initials = (form.fullName || user?.email || 'U').split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);

  return (
    <div className="min-h-screen pb-10">
      <Header title="Settings" subtitle="Manage your personal preferences and company details" />
      
      <div className="p-6 max-w-5xl">
        <div className="flex flex-col md:flex-row gap-8">
          
          {/* Tabs Sidebar */}
          <div className="w-full md:w-56 flex-shrink-0">
            <nav className="flex md:flex-col gap-2 overflow-x-auto md:overflow-visible pb-2 md:pb-0">
              {TABS.map(t => (
                <button 
                  key={t.id} 
                  onClick={() => setTab(t.id)} 
                  className={cn(
                    'flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all text-left whitespace-nowrap', 
                    tab === t.id 
                      ? 'bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20' 
                      : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 border border-transparent'
                  )}
                >
                  <t.icon className="w-4 h-4" />
                  {t.label}
                </button>
              ))}
            </nav>
            
            <div className="mt-8 p-4 bg-indigo-500/10 border border-indigo-500/20 rounded-xl hidden md:block">
              <div className="flex items-start gap-2 text-indigo-600 dark:text-indigo-400">
                <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                <p className="text-xs">API Keys and Provider settings are now managed by your Organization Admin in the Admin Panel.</p>
              </div>
            </div>
          </div>
          
          {/* Tab Content */}
          <div className="flex-1">
            {tab === 'profile' && (
              <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6 md:p-8 space-y-8 animate-in fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Profile Details</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Update your personal information and profile picture.</p>
                </div>
                
                <div className="flex items-center gap-6 pb-6 border-b border-slate-200 dark:border-white/5">
                  <div className="w-20 h-20 rounded-full bg-gradient-to-br from-emerald-600 to-teal-600 flex items-center justify-center text-3xl font-bold text-white shadow-lg border-2 border-[#0a1128] ring-2 ring-emerald-500/30">
                    {initials}
                  </div>
                  <div>
                    <div className="flex gap-3 mb-2">
                      <Button variant="outline" size="sm" className="border-slate-300 dark:border-white/10 text-slate-900 dark:text-white bg-slate-100 dark:bg-white/5 hover:bg-slate-200 dark:hover:bg-white/10"><Upload className="w-3.5 h-3.5 mr-2" /> Upload New</Button>
                      <Button variant="ghost" size="sm" className="text-slate-600 dark:text-slate-400 hover:text-red-600 dark:text-red-400">Remove</Button>
                    </div>
                    <p className="text-xs text-slate-600 dark:text-slate-500">Recommended: Square JPG, PNG, or GIF, at least 1,000 pixels per side.</p>
                  </div>
                </div>
                
                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Full Name</Label>
                    <Input value={form.fullName} onChange={e => set('fullName', e.target.value)} className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white h-11" />
                  </div>
                  <div>
                    <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Email Address</Label>
                    <Input value={user?.email || ''} readOnly className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-600 dark:text-slate-400 h-11 opacity-70" />
                    <p className="text-xs text-slate-600 dark:text-slate-500 mt-1.5">Email cannot be changed.</p>
                  </div>
                  <div>
                    <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Phone Number</Label>
                    <Input value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="+91 98765 43210" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white h-11" />
                  </div>
                </div>

                <div className="pt-4">
                  <Button onClick={() => save(['fullName', 'phone'], 'Profile')} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save Profile</>}</Button>
                </div>
              </div>
            )}
            
            {tab === 'company' && (
              <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6 md:p-8 space-y-8 animate-in fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Company Information</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Manage your organization&apos;s details.</p>
                </div>
                
                <div className="space-y-6">
                  <div>
                    <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Company Name</Label>
                    <Input value={form.company} onChange={e => set('company', e.target.value)} placeholder="Acme Corp" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white h-11" />
                  </div>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Website</Label>
                      <Input value={form.website} onChange={e => set('website', e.target.value)} placeholder="https://acme.com" className="bg-slate-100 dark:bg-white/5 border-slate-300 dark:border-white/10 text-slate-900 dark:text-white h-11" />
                    </div>
                    <div>
                      <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Industry</Label>
                      <select value={form.industry} onChange={e => set('industry', e.target.value)} className="w-full h-11 bg-white dark:bg-[#0a1128] border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white rounded-md px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500">
                        <option>Technology / SaaS</option>
                        <option>Financial Services</option>
                        <option>Healthcare</option>
                        <option>Real Estate</option>
                        <option>Fitness / Gym</option>
                        <option>Other</option>
                      </select>
                    </div>
                  </div>
                </div>

                <div className="pt-4">
                  <Button onClick={() => save(['company', 'website', 'industry'], 'Company details')} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save Company Details</>}</Button>
                </div>
              </div>
            )}
            
            {tab === 'whatsapp' && (
              <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6 md:p-8 space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">WhatsApp Auto Follow-up</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">When an AI call marks a lead as <span className="text-emerald-600 dark:text-emerald-400 font-medium">Interested</span>, FinBud automatically sends this WhatsApp message to the customer.</p>
                </div>

                <div className="flex items-center justify-between p-4 rounded-xl bg-emerald-500/5 border border-emerald-500/20">
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-white">Enable auto WhatsApp for interested leads</p>
                    <p className="text-xs text-slate-600 dark:text-slate-500 mt-0.5">Requires a WhatsApp-enabled Twilio number (set by admin in API Providers).</p>
                  </div>
                  <button onClick={() => setWaEnabled(v => !v)} className={cn('w-12 h-6 rounded-full relative transition-colors flex-shrink-0', waEnabled ? 'bg-emerald-600' : 'bg-slate-300 dark:bg-slate-700')}>
                    <span className={cn('absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform shadow', waEnabled ? 'translate-x-6' : 'translate-x-0.5')} />
                  </button>
                </div>

                <div>
                  <Label className="text-slate-600 dark:text-slate-300 text-sm mb-2 block">Message Template</Label>
                  <textarea value={form.whatsappTemplate} onChange={e => set('whatsappTemplate', e.target.value)} rows={5} className="w-full rounded-md bg-slate-100 dark:bg-white/5 border border-slate-300 dark:border-white/10 text-slate-900 dark:text-white p-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500" />
                  <p className="text-xs text-slate-600 dark:text-slate-500 mt-2">Placeholders: <code className="text-emerald-600 dark:text-emerald-400">{'{name}'}</code>, <code className="text-emerald-600 dark:text-emerald-400">{'{phone}'}</code>, <code className="text-emerald-600 dark:text-emerald-400">{'{company}'}</code> are filled in automatically.</p>
                </div>

                <div className="rounded-xl bg-slate-50 dark:bg-white/[0.02] border border-slate-200 dark:border-white/5 p-4">
                  <p className="text-xs text-slate-600 dark:text-slate-500 mb-1.5">Preview</p>
                  <div className="inline-block max-w-full bg-emerald-500/10 border border-emerald-500/20 rounded-2xl rounded-tl-none px-4 py-2.5 text-sm text-slate-700 dark:text-slate-200">
                    {form.whatsappTemplate.replace(/\{name\}/gi, 'Rahul').replace(/\{company\}/gi, form.company || 'Skyline Properties').replace(/\{phone\}/gi, '')}
                  </div>
                </div>

                <div className="pt-2">
                  <Button onClick={() => save(['whatsappTemplate'], 'WhatsApp settings', { whatsappEnabled: waEnabled })} disabled={saving} className="bg-emerald-600 hover:bg-emerald-500 text-white border-0">{saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <><Save className="w-4 h-4 mr-2" /> Save WhatsApp Settings</>}</Button>
                </div>
              </div>
            )}

            {tab === 'notifications' && (
              <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl p-6 md:p-8 space-y-6 animate-in fade-in">
                <div>
                  <h3 className="text-lg font-bold text-slate-900 dark:text-white mb-1">Notification Preferences</h3>
                  <p className="text-sm text-slate-600 dark:text-slate-400">Choose what events you want to be notified about.</p>
                </div>
                
                <div className="space-y-1">
                  {[
                    { label: 'Hot Lead Alert', desc: 'Email when an AI agent marks a call outcome as "Interested"', enabled: true },
                    { label: 'Call Failed', desc: 'Alert when a call fails to connect or drops', enabled: true },
                    { label: 'Low Credits Warning', desc: 'Email when balance falls below 10%', enabled: true },
                    { label: 'Weekly Summary', desc: 'Weekly report of call volume and outcomes', enabled: false },
                    { label: 'Product Updates', desc: 'News about new features and improvements', enabled: true },
                  ].map((n, i) => (
                    <div key={i} className="flex items-center justify-between py-4 border-b border-slate-200 dark:border-white/5 last:border-0">
                      <div className="pr-8">
                        <p className="text-sm font-medium text-slate-900 dark:text-white mb-0.5">{n.label}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-500">{n.desc}</p>
                      </div>
                      <div className={cn('w-11 h-6 rounded-full relative cursor-pointer transition-colors flex-shrink-0 border', n.enabled ? 'bg-emerald-600 border-emerald-500' : 'bg-white dark:bg-[#0f172a] border-slate-300 dark:border-white/10')}>
                        <div className={cn('absolute top-0.5 w-4 h-4 bg-white rounded-full transition-transform shadow-sm', n.enabled ? 'translate-x-6' : 'translate-x-1')} />
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
