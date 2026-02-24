'use client';

import { cn } from '@/lib/utils';
import { useOrganization } from '@/hooks/use-organization';

export function AIStatusIndicator() {
  const { currentOrg, isLoading } = useOrganization();

  if (isLoading || !currentOrg) return null;

  const isEnabled = currentOrg.ai_enabled;

  return (
    <div
      className="flex items-center gap-1.5"
      title={isEnabled ? 'AI features enabled' : 'AI features disabled'}
    >
      <span
        className={cn(
          'inline-block h-2 w-2 rounded-full',
          isEnabled
            ? 'bg-green-500 shadow-[0_0_4px_rgba(34,197,94,0.4)]'
            : 'bg-gray-400'
        )}
        aria-hidden="true"
      />
      <span className="hidden text-xs text-gray-500 dark:text-gray-400 sm:inline-block">
        {isEnabled ? 'AI On' : 'AI Off'}
      </span>
    </div>
  );
}
