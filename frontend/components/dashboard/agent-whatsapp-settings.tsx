'use client';

import { useState, useEffect } from 'react';
import { Save, Plus, Trash2, CheckCircle2, MessageSquare, Loader2 } from 'lucide-react';

export default function AgentWhatsAppSettings({ agentId }: { agentId: string }) {
  const [templates, setTemplates] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  
  const [newTemplate, setNewTemplate] = useState({
    triggerOutcome: 'interested',
    templateName: '',
    messageBody: 'Hi [Name], thank you for your time on the call! Let us know if you have any questions.',
    isActive: true
  });

  useEffect(() => {
    fetch(`/api/agents/${agentId}/whatsapp`)
      .then(res => res.json())
      .then(data => setTemplates(Array.isArray(data) ? data : []))
      .finally(() => setLoading(false));
  }, [agentId]);

  const handleAddTemplate = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(newTemplate)
      });
      if (res.ok) {
        const data = await res.json();
        setTemplates([...templates, data]);
        setIsAdding(false);
        setNewTemplate({ triggerOutcome: 'interested', templateName: '', messageBody: '', isActive: true });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (templateId: string) => {
    try {
      const res = await fetch(`/api/agents/${agentId}/whatsapp`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId })
      });
      if (res.ok) {
        setTemplates(templates.filter(t => t.id !== templateId));
      }
    } catch (err) {
      console.error(err);
    }
  };

  if (loading) return <div className="flex justify-center p-12"><Loader2 className="w-8 h-8 animate-spin text-emerald-500" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-500" />
            WhatsApp Automation Rules
          </h2>
          <p className="text-sm text-slate-500">Automatically send WhatsApp messages based on call outcomes.</p>
        </div>
        <button 
          onClick={() => setIsAdding(!isAdding)}
          className="flex items-center gap-2 px-4 py-2 bg-slate-900 dark:bg-white text-white dark:text-slate-900 text-sm font-medium rounded-lg hover:opacity-90 transition-opacity"
        >
          <Plus className="w-4 h-4" />
          Add Rule
        </button>
      </div>

      {isAdding && (
        <form onSubmit={handleAddTemplate} className="bg-white dark:bg-[#0f172a] p-6 rounded-2xl border border-slate-200 dark:border-white/5 space-y-4">
          <h3 className="font-semibold text-slate-900 dark:text-white">Create New Automation Rule</h3>
          
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Trigger Condition</label>
            <select 
              value={newTemplate.triggerOutcome}
              onChange={e => setNewTemplate({...newTemplate, triggerOutcome: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            >
              <option value="interested">Call completed and marked "Interested"</option>
              <option value="not_interested">Call completed and marked "Not Interested"</option>
              <option value="no-answer">Call failed (No Answer)</option>
              <option value="all">Any Call Completed</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Meta Pre-approved Template Name (Optional)</label>
            <input 
              type="text"
              placeholder="e.g., lead_followup_01"
              value={newTemplate.templateName}
              onChange={e => setNewTemplate({...newTemplate, templateName: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm"
            />
            <p className="text-xs text-slate-500 mt-1">If specified, we will send this official template using [Name] as the single variable.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-300 mb-1">Message Body (Fallback)</label>
            <textarea 
              rows={3}
              value={newTemplate.messageBody}
              onChange={e => setNewTemplate({...newTemplate, messageBody: e.target.value})}
              className="w-full px-4 py-2 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-lg text-sm resize-none"
              placeholder="Hi [Name]..."
            />
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-sm font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg">Cancel</button>
            <button type="submit" disabled={saving} className="flex items-center gap-2 px-5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-medium rounded-lg disabled:opacity-50">
              {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />} Save Rule
            </button>
          </div>
        </form>
      )}

      <div className="space-y-4">
        {templates.map(t => (
          <div key={t.id} className="bg-white dark:bg-[#0f172a] p-5 rounded-2xl border border-slate-200 dark:border-white/5 flex flex-col sm:flex-row gap-4 justify-between items-start">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="px-2.5 py-1 bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-400 text-xs font-bold uppercase rounded-full">
                  {t.triggerOutcome.replace('_', ' ')}
                </span>
                {t.templateName && (
                  <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-500/10 px-2 py-1 rounded">
                    Template: {t.templateName}
                  </span>
                )}
              </div>
              <p className="text-sm text-slate-600 dark:text-slate-300 mt-2 line-clamp-2">"{t.messageBody}"</p>
            </div>
            <button 
              onClick={() => handleDelete(t.id)}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors shrink-0"
              title="Delete Rule"
            >
              <Trash2 className="w-5 h-5" />
            </button>
          </div>
        ))}

        {templates.length === 0 && !isAdding && (
          <div className="text-center p-12 bg-slate-50 dark:bg-slate-800/30 rounded-2xl border border-slate-200 dark:border-white/5 text-slate-500">
            No automation rules configured for this agent yet.
          </div>
        )}
      </div>
    </div>
  );
}
