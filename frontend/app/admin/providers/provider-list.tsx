'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Loader2, CheckCircle2, XCircle } from 'lucide-react';
import { toast } from 'sonner';

type Provider = {
  name: string;
  desc: string;
  isConfigured: boolean;
};

export default function ProviderList({ initialProviders }: { initialProviders: Provider[] }) {
  const [testing, setTesting] = useState<string | null>(null);
  const [results, setResults] = useState<Record<string, { success: boolean; error?: string }>>({});

  const handleTest = async (providerName: string) => {
    setTesting(providerName);
    try {
      const res = await fetch('/api/admin/test-api', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: providerName })
      });
      const data = await res.json();
      
      setResults(prev => ({ ...prev, [providerName]: data }));
      
      if (data.success) {
        toast.success(`${providerName} connection successful!`);
      } else {
        toast.error(`${providerName} connection failed: ${data.error}`);
      }
    } catch (err: any) {
      setResults(prev => ({ ...prev, [providerName]: { success: false, error: err.message } }));
      toast.error(`Error testing ${providerName}: ${err.message}`);
    } finally {
      setTesting(null);
    }
  };

  return (
    <div className="space-y-4">
      {initialProviders.map((api, i) => {
        const result = results[api.name];
        
        return (
          <div key={i} className="flex flex-col sm:flex-row sm:items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-white/5 gap-4">
            <div>
              <div className="flex items-center gap-2">
                <p className="font-medium text-slate-900 dark:text-white">{api.name}</p>
                {api.isConfigured ? (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-emerald-100 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> Configured
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-medium bg-red-100 text-red-700 dark:bg-red-500/10 dark:text-red-400 border border-red-200 dark:border-red-500/20">
                    <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span> Missing
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{api.desc}</p>
            </div>
            
            <div className="flex items-center gap-3">
              {result && (
                <div className="flex items-center gap-1.5 text-xs font-medium">
                  {result.success ? (
                    <span className="text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                      <CheckCircle2 className="w-4 h-4" /> Passed
                    </span>
                  ) : (
                    <span className="text-red-600 dark:text-red-400 flex items-center gap-1" title={result.error}>
                      <XCircle className="w-4 h-4" /> Failed
                    </span>
                  )}
                </div>
              )}
              
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => handleTest(api.name)}
                disabled={testing === api.name || !api.isConfigured}
                className="h-8"
              >
                {testing === api.name ? <Loader2 className="w-3.5 h-3.5 animate-spin mr-1.5" /> : null}
                {testing === api.name ? 'Testing...' : 'Test Connection'}
              </Button>
            </div>
          </div>
        );
      })}
    </div>
  );
}
