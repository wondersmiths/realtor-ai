'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  LayoutDashboard,
  Home,
  FileText,
  ShieldCheck,
  ClipboardList,
  Scale,
  Users,
  CreditCard,
  Settings,
  ScrollText,
  ChevronLeft,
  ChevronRight,
  type LucideIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { NAV_ITEMS, type RoleKey } from '@/lib/constants';
import { useOrganization } from '@/hooks/use-organization';
import { UserRole } from '@/types/enums';

// ────────────────────────────────────────────
// Icon lookup
// ────────────────────────────────────────────

const iconMap: Record<string, LucideIcon> = {
  LayoutDashboard,
  Home,
  FileText,
  ShieldCheck,
  ClipboardList,
  Scale,
  Users,
  CreditCard,
  Settings,
  ScrollText,
};

// ────────────────────────────────────────────
// Role hierarchy helper
// ────────────────────────────────────────────

const ROLE_HIERARCHY: Record<string, number> = {
  [UserRole.Owner]: 3,
  [UserRole.Admin]: 2,
  [UserRole.Agent]: 1,
};

function hasRequiredRole(
  userRole: string | null,
  requiredRole?: RoleKey
): boolean {
  if (!requiredRole) return true;
  if (!userRole) return false;
  return (ROLE_HIERARCHY[userRole] ?? 0) >= (ROLE_HIERARCHY[requiredRole] ?? 0);
}

// ────────────────────────────────────────────
// Sidebar
// ────────────────────────────────────────────

export function Sidebar() {
  const pathname = usePathname();
  const { currentOrg, userRole } = useOrganization();
  const [collapsed, setCollapsed] = useState(false);

  const filteredItems = NAV_ITEMS.filter((item) =>
    hasRequiredRole(userRole, item.requiredRole)
  );

  return (
    <aside
      className={cn(
        'flex h-full flex-col border-r border-gray-200 bg-white transition-all duration-300 dark:border-gray-800 dark:bg-gray-950',
        collapsed ? 'w-16' : 'w-64'
      )}
    >
      {/* Organization name */}
      <div className="flex h-16 items-center border-b border-gray-200 px-4 dark:border-gray-800">
        {!collapsed && currentOrg && (
          <span className="truncate text-sm font-semibold text-gray-900 dark:text-gray-50">
            {currentOrg.name}
          </span>
        )}
        {collapsed && currentOrg && (
          <span className="mx-auto text-sm font-bold text-gray-900 dark:text-gray-50">
            {currentOrg.name.charAt(0).toUpperCase()}
          </span>
        )}
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto px-2 py-4">
        <ul className="flex flex-col gap-1">
          {filteredItems.map((item) => {
            const Icon = iconMap[item.icon];
            const isActive =
              item.href === '/dashboard'
                ? pathname === '/dashboard'
                : pathname.startsWith(item.href);

            return (
              <li key={item.href}>
                <Link
                  href={item.href}
                  className={cn(
                    'flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors',
                    isActive
                      ? 'bg-blue-50 text-blue-700 dark:bg-blue-900/20 dark:text-blue-300'
                      : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100',
                    collapsed && 'justify-center px-2'
                  )}
                  title={collapsed ? item.label : undefined}
                >
                  {Icon && (
                    <Icon
                      className={cn(
                        'h-5 w-5 shrink-0',
                        isActive
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-gray-400 dark:text-gray-500'
                      )}
                    />
                  )}
                  {!collapsed && <span>{item.label}</span>}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Collapse toggle */}
      <div className="border-t border-gray-200 p-2 dark:border-gray-800">
        <button
          type="button"
          onClick={() => setCollapsed((prev) => !prev)}
          className="flex w-full items-center justify-center rounded-md p-2 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-800 dark:hover:text-gray-300"
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          {collapsed ? (
            <ChevronRight className="h-5 w-5" />
          ) : (
            <ChevronLeft className="h-5 w-5" />
          )}
        </button>
      </div>
    </aside>
  );
}
