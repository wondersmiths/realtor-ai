'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { ChevronRight } from 'lucide-react';

// ────────────────────────────────────────────
// Segment label mapping
// ────────────────────────────────────────────

const SEGMENT_LABELS: Record<string, string> = {
  dashboard: 'Dashboard',
  listings: 'Listings',
  documents: 'Documents',
  compliance: 'Compliance',
  disclosures: 'Disclosures',
  'fair-housing': 'Fair Housing',
  team: 'Team',
  billing: 'Billing',
  settings: 'Settings',
  'audit-log': 'Audit Log',
  new: 'New',
  edit: 'Edit',
};

function formatSegment(segment: string): string {
  if (SEGMENT_LABELS[segment]) return SEGMENT_LABELS[segment];
  // Attempt to format UUID-like segments
  if (/^[0-9a-f-]{36}$/i.test(segment)) return 'Details';
  // Capitalize and replace hyphens
  return segment
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

// ────────────────────────────────────────────
// Breadcrumbs
// ────────────────────────────────────────────

export function Breadcrumbs() {
  const pathname = usePathname();

  // Only render within /dashboard
  if (!pathname.startsWith('/dashboard')) return null;

  const segments = pathname.split('/').filter(Boolean);
  const crumbs = segments.map((segment, index) => {
    const href = '/' + segments.slice(0, index + 1).join('/');
    const label = formatSegment(segment);
    const isLast = index === segments.length - 1;
    return { href, label, isLast };
  });

  return (
    <nav aria-label="Breadcrumb" className="flex items-center">
      <ol className="flex items-center gap-1 text-sm">
        {crumbs.map((crumb) => (
          <li key={crumb.href} className="flex items-center gap-1">
            {!crumb.isLast ? (
              <>
                <Link
                  href={crumb.href}
                  className="text-gray-500 transition-colors hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100"
                >
                  {crumb.label}
                </Link>
                <ChevronRight className="h-3.5 w-3.5 text-gray-400" />
              </>
            ) : (
              <span className="font-medium text-gray-900 dark:text-gray-50">
                {crumb.label}
              </span>
            )}
          </li>
        ))}
      </ol>
    </nav>
  );
}
