import { cn } from '@/lib/utils';
import { Spinner } from '@/components/ui/spinner';

interface LoadingStateProps {
  message?: string;
  fullPage?: boolean;
  className?: string;
}

export function LoadingState({
  message,
  fullPage = false,
  className,
}: LoadingStateProps) {
  return (
    <div
      className={cn(
        'flex flex-col items-center justify-center gap-3',
        fullPage ? 'fixed inset-0 z-50 bg-white/80 dark:bg-gray-950/80' : 'py-12',
        className
      )}
    >
      <Spinner size="lg" className="text-blue-600" />
      {message && (
        <p className="text-sm text-gray-500 dark:text-gray-400">{message}</p>
      )}
    </div>
  );
}
