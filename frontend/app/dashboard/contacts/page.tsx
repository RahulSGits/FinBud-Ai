'use client';

import { useState, useEffect } from 'react';
import Header from '@/components/dashboard/header';
import { Upload, FileSpreadsheet, Plus, Download, Loader2 } from 'lucide-react';
// @ts-ignore
import Papa from 'papaparse';
import { toast } from 'sonner';

export default function ContactsPage() {
  const [contacts, setContacts] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    fetchContacts();
  }, []);

  const fetchContacts = async () => {
    try {
      const res = await fetch('/api/contacts');
      const data = await res.json();
      if (Array.isArray(data)) setContacts(data);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    toast.info('Parsing file...');

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results: any) => {
        try {
          const mappedContacts = results.data.map((row: any) => ({
            name: row.name || row.Name || row.NAME || '',
            phone: row.phone || row.Phone || row.PHONE || row.phoneNumber || '',
            email: row.email || row.Email || row.EMAIL || '',
            company: row.company || row.Company || '',
            loanAmount: row.loanAmount || row['Loan Amount'] || null,
            loanType: row.loanType || row['Loan Type'] || '',
            notes: row.notes || row.Notes || '',
            tags: row.tags || row.Tags || '',
          })).filter((c: any) => c.phone); // Require phone number

          if (mappedContacts.length === 0) {
            toast.error('No valid contacts found. Please ensure the file has a phone/Phone column.');
            setUploading(false);
            return;
          }

          toast.info(`Importing ${mappedContacts.length} contacts...`);
          
          const res = await fetch('/api/contacts/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contacts: mappedContacts })
          });
          
          const result = await res.json();
          if (res.ok) {
            toast.success(`Successfully imported ${result.imported} contacts!`);
            fetchContacts();
          } else {
            toast.error(result.error || 'Failed to import contacts');
          }
        } catch (error) {
          console.error(error);
          toast.error('Error importing contacts.');
        } finally {
          setUploading(false);
          if (e.target) e.target.value = ''; // Reset input
        }
      },
      error: (error: any) => {
        toast.error('Failed to parse CSV file: ' + error.message);
        setUploading(false);
      }
    });
  };

  return (
    <div className="min-h-screen pb-10">
      <Header title="Contacts" subtitle="Manage your contacts and CRM data." />
      <div className="p-6 max-w-7xl mx-auto space-y-6">
        
        <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
          <div className="flex items-center gap-3">
            <label className="relative cursor-pointer inline-flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700 transition-all focus-within:ring-2 focus-within:ring-indigo-500 focus-within:ring-offset-2">
              {uploading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Upload className="w-4 h-4" />}
              <span>Import CSV/XLSX</span>
              <input 
                type="file" 
                accept=".csv, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel" 
                className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
                onChange={handleFileUpload}
                disabled={uploading}
              />
            </label>
            <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
              <Plus className="w-4 h-4" />
              <span>Add Manually</span>
            </button>
          </div>
          <button className="inline-flex items-center justify-center gap-2 rounded-xl bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 px-4 py-2 text-sm font-medium text-slate-700 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-white/5 transition-all">
            <Download className="w-4 h-4" />
            <span>Export</span>
          </button>
        </div>

        <div className="bg-white dark:bg-[#0a1128] border border-slate-200 dark:border-white/5 rounded-2xl overflow-hidden shadow-sm">
          {loading ? (
            <div className="p-12 text-center text-slate-500">Loading contacts...</div>
          ) : contacts.length === 0 ? (
            <div className="p-12 text-center">
              <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-slate-50 dark:bg-slate-800/50 mb-4">
                <FileSpreadsheet className="w-8 h-8 text-slate-400" />
              </div>
              <h3 className="text-lg font-medium text-slate-900 dark:text-white mb-2">No contacts yet</h3>
              <p className="text-slate-500 dark:text-slate-400 max-w-sm mx-auto mb-6">
                Upload a CSV file with your contacts or add them manually to get started with your campaigns.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm text-left">
                <thead className="bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-slate-400 font-medium">
                  <tr>
                    <th className="px-6 py-4">Name</th>
                    <th className="px-6 py-4">Phone</th>
                    <th className="px-6 py-4">Email</th>
                    <th className="px-6 py-4">Company</th>
                    <th className="px-6 py-4">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 dark:divide-white/5">
                  {contacts.map((contact) => (
                    <tr key={contact.id} className="hover:bg-slate-50 dark:hover:bg-white/5 transition-colors">
                      <td className="px-6 py-4">
                        <div className="font-medium text-slate-900 dark:text-white">{contact.name || '-'}</div>
                      </td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contact.phone}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contact.email || '-'}</td>
                      <td className="px-6 py-4 text-slate-600 dark:text-slate-300">{contact.company || '-'}</td>
                      <td className="px-6 py-4">
                        <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-slate-100 text-slate-800 dark:bg-slate-800 dark:text-slate-300 capitalize">
                          {contact.status}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
