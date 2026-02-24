'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

// ────────────────────────────────────────────
// Context
// ────────────────────────────────────────────

interface DropdownMenuContextValue {
  open: boolean;
  setOpen: (open: boolean) => void;
  toggle: () => void;
}

const DropdownMenuContext = React.createContext<DropdownMenuContextValue | undefined>(
  undefined
);

function useDropdownMenu() {
  const ctx = React.useContext(DropdownMenuContext);
  if (!ctx)
    throw new Error('DropdownMenu components must be used within <DropdownMenu>');
  return ctx;
}

// ────────────────────────────────────────────
// Root
// ────────────────────────────────────────────

interface DropdownMenuProps {
  children: React.ReactNode;
}

export function DropdownMenu({ children }: DropdownMenuProps) {
  const [open, setOpen] = React.useState(false);
  const toggle = React.useCallback(() => setOpen((prev) => !prev), []);
  const containerRef = React.useRef<HTMLDivElement>(null);

  // Click outside handler
  React.useEffect(() => {
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

  return (
    <DropdownMenuContext.Provider value={{ open, setOpen, toggle }}>
      <div ref={containerRef} className="relative inline-block text-left">
        {children}
      </div>
    </DropdownMenuContext.Provider>
  );
}

// ────────────────────────────────────────────
// Trigger
// ────────────────────────────────────────────

export function DropdownMenuTrigger({
  children,
  className,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const { toggle } = useDropdownMenu();

  return (
    <button
      type="button"
      className={cn('inline-flex items-center', className)}
      onClick={toggle}
      aria-haspopup="true"
      {...props}
    >
      {children}
    </button>
  );
}

// ────────────────────────────────────────────
// Content
// ────────────────────────────────────────────

interface DropdownMenuContentProps extends React.HTMLAttributes<HTMLDivElement> {
  align?: 'start' | 'end';
  sideOffset?: number;
}

const DropdownMenuContent = React.forwardRef<HTMLDivElement, DropdownMenuContentProps>(
  ({ className, align = 'end', children, ...props }, ref) => {
    const { open } = useDropdownMenu();

    if (!open) return null;

    return (
      <div
        ref={ref}
        role="menu"
        className={cn(
          'absolute z-50 mt-2 min-w-[8rem] overflow-hidden rounded-md border border-gray-200 bg-white p-1 shadow-md',
          'dark:border-gray-700 dark:bg-gray-900',
          'animate-in fade-in-0 zoom-in-95',
          align === 'end' ? 'right-0' : 'left-0',
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);
DropdownMenuContent.displayName = 'DropdownMenuContent';

// ────────────────────────────────────────────
// Item
// ────────────────────────────────────────────

interface DropdownMenuItemProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  destructive?: boolean;
}

const DropdownMenuItem = React.forwardRef<HTMLButtonElement, DropdownMenuItemProps>(
  ({ className, destructive, onClick, children, ...props }, ref) => {
    const { setOpen } = useDropdownMenu();

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      onClick?.(e);
      setOpen(false);
    };

    return (
      <button
        ref={ref}
        type="button"
        role="menuitem"
        className={cn(
          'flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-sm outline-none transition-colors',
          'hover:bg-gray-100 focus:bg-gray-100 dark:hover:bg-gray-800 dark:focus:bg-gray-800',
          destructive && 'text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-900/20',
          className
        )}
        onClick={handleClick}
        {...props}
      >
        {children}
      </button>
    );
  }
);
DropdownMenuItem.displayName = 'DropdownMenuItem';

// ────────────────────────────────────────────
// Separator & Label
// ────────────────────────────────────────────

export function DropdownMenuSeparator({ className }: { className?: string }) {
  return (
    <div
      role="separator"
      className={cn('-mx-1 my-1 h-px bg-gray-200 dark:bg-gray-700', className)}
    />
  );
}

export function DropdownMenuLabel({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'px-2 py-1.5 text-xs font-semibold text-gray-500 dark:text-gray-400',
        className
      )}
    >
      {children}
    </div>
  );
}

export { DropdownMenuContent, DropdownMenuItem };
