'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { cn } from '@/lib/utils';

interface ConfirmActionDialogProps {
  title: string;
  description: string;
  actionLabel?: string;
  variant?: 'default' | 'destructive' | 'warning' | 'success';
  onConfirm: () => void;
  children: React.ReactNode;
}

export function ConfirmActionDialog({
  title,
  description,
  actionLabel = 'Confirm',
  variant = 'default',
  onConfirm,
  children,
}: ConfirmActionDialogProps) {
  const variantStyles = {
    default: 'bg-indigo-600 hover:bg-indigo-700 text-white border-0',
    destructive: 'bg-red-600 hover:bg-red-700 text-white border-0',
    warning: 'bg-amber-500 hover:bg-amber-600 text-white border-0',
    success: 'bg-emerald-600 hover:bg-emerald-700 text-white border-0',
  };

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        {children}
      </AlertDialogTrigger>
      <AlertDialogContent className="bg-white dark:bg-[#0a1128] border-slate-200 dark:border-white/10">
        <AlertDialogHeader>
          <AlertDialogTitle className="text-slate-900 dark:text-white">{title}</AlertDialogTitle>
          <AlertDialogDescription className="text-slate-600 dark:text-slate-400">
            {description}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel className="border-slate-300 dark:border-white/10 hover:bg-slate-100 dark:hover:bg-white/10 text-slate-700 dark:text-slate-300">
            Cancel
          </AlertDialogCancel>
          <AlertDialogAction 
            onClick={onConfirm}
            className={cn(variantStyles[variant])}
          >
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
