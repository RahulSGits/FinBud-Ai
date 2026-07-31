import Link from 'next/link';
import { FileQuestion } from 'lucide-react';
import { FinanceBuddhaLogo } from '@/components/brand/logo';

// Next generates a /_not-found route whether or not this file exists; without
// it the build warns that it cannot find the source, and a missing page falls
// back to an unstyled default that looks nothing like the rest of the app.
export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-[#020617] px-6">
      <div className="text-center max-w-sm">
        <div className="mb-8 flex justify-center">
          <FinanceBuddhaLogo size="sm" />
        </div>

        <div className="w-12 h-12 mx-auto mb-4 rounded-2xl bg-slate-100 dark:bg-white/5 flex items-center justify-center">
          <FileQuestion className="w-5 h-5 text-slate-400 dark:text-slate-500" />
        </div>

        <h1 className="text-lg font-semibold text-slate-900 dark:text-white">Page not found</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-1.5">
          That page does not exist, or you do not have access to it.
        </p>

        {/* Deliberately points at the root rather than a role-specific
            dashboard: this page renders for signed-out visitors too, and the
            landing page already routes each role onwards. */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 h-9 px-4 mt-6 rounded-xl bg-brand-600 hover:bg-brand-500 text-white text-sm font-semibold transition-colors"
        >
          Back to safety
        </Link>
      </div>
    </div>
  );
}
