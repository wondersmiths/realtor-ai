'use client';

import { useState, useRef, useEffect } from 'react';
import { ChevronsUpDown, Check, Building2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useOrganization } from '@/hooks/use-organization';

export function OrgSwitcher() {
  const { currentOrg, organizations, setCurrentOrg } = useOrganization();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  // Click outside to close
  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setOpen(false);
      }
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };

    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  // Don't render if user has 0 or 1 org
  if (organizations.length <= 1) return null;

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={cn(
          'flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-1.5 text-sm transition-colors',
          'hover:bg-gray-50 dark:border-gray-700 dark:bg-gray-900 dark:hover:bg-gray-800'
        )}
        aria-haspopup="listbox"
        aria-expanded={open}
      >
        <Building2 className="h-4 w-4 text-gray-400" />
        <span className="max-w-[120px] truncate text-gray-700 dark:text-gray-300">
          {currentOrg?.name ?? 'Select org'}
        </span>
        <ChevronsUpDown className="h-3.5 w-3.5 text-gray-400" />
      </button>

      {open && (
        <div
          role="listbox"
          className={cn(
            'absolute left-0 z-50 mt-1 w-56 overflow-hidden rounded-md border border-gray-200 bg-white py-1 shadow-lg',
            'dark:border-gray-700 dark:bg-gray-900',
            'animate-in fade-in-0 zoom-in-95'
          )}
        >
          {organizations.map((org) => {
            const isSelected = org.id === currentOrg?.id;
            return (
              <button
                key={org.id}
                type="button"
                role="option"
                aria-selected={isSelected}
                className={cn(
                  'flex w-full items-center gap-2 px-3 py-2 text-sm transition-colors',
                  'hover:bg-gray-100 dark:hover:bg-gray-800',
                  isSelected && 'bg-blue-50 dark:bg-blue-900/20'
                )}
                onClick={() => {
                  setCurrentOrg(org.id);
                  setOpen(false);
                }}
              >
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-gray-200 text-xs font-medium text-gray-600 dark:bg-gray-700 dark:text-gray-300">
                  {org.name.charAt(0).toUpperCase()}
                </span>
                <span className="flex-1 truncate text-left text-gray-700 dark:text-gray-300">
                  {org.name}
                </span>
                {isSelected && (
                  <Check className="h-4 w-4 shrink-0 text-blue-600 dark:text-blue-400" />
                )}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
