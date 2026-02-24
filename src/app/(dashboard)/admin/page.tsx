'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import {
  Shield,
  Users,
  FileText,
  Home,
  ShieldCheck,
  ClipboardList,
  Settings,
  ArrowRight,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';

interface AdminStats {
  totalMembers: number;
  totalDocuments: number;
  totalListings: number;
  totalChecks: number;
}

export default function AdminPage() {
  const router = useRouter();
  const { currentOrg } = useOrganization();
  const { isOwner, isAdmin } = usePermissions();

  const [stats, setStats] = useState<AdminStats | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // Redirect non-admin users
  useEffect(() => {
    if (!isOwner && !isAdmin) {
      router.replace('/dashboard');
    }
  }, [isOwner, isAdmin, router]);

  const fetchStats = useCallback(async () => {
    if (!currentOrg) return;

    setIsLoading(true);
    try {
      // Fetch stats from multiple endpoints in parallel
      const [membersRes, documentsRes, listingsRes, checksRes] = await Promise.allSettled([
        fetch(`/api/organizations/${currentOrg.id}/members`),
        fetch('/api/documents?pageSize=1'),
        fetch('/api/listings?pageSize=1'),
        fetch('/api/compliance/checks?pageSize=1'),
      ]);

      const membersData =
        membersRes.status === 'fulfilled' && membersRes.value.ok
          ? await membersRes.value.json()
          : null;

      const documentsData =
        documentsRes.status === 'fulfilled' && documentsRes.value.ok
          ? await documentsRes.value.json()
          : null;

      const listingsData =
        listingsRes.status === 'fulfilled' && listingsRes.value.ok
          ? await listingsRes.value.json()
          : null;

      const checksData =
        checksRes.status === 'fulfilled' && checksRes.value.ok
          ? await checksRes.value.json()
          : null;

      setStats({
        totalMembers: membersData?.data?.length ?? 0,
        totalDocuments: documentsData?.pagination?.totalItems ?? documentsData?.data?.length ?? 0,
        totalListings: listingsData?.pagination?.totalItems ?? listingsData?.data?.length ?? 0,
        totalChecks: checksData?.pagination?.totalItems ?? checksData?.data?.length ?? 0,
      });
    } catch (err) {
      console.error('Error fetching admin stats:', err);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    if (isOwner || isAdmin) {
      fetchStats();
    }
  }, [fetchStats, isOwner, isAdmin]);

  // Don't render for non-admin
  if (!isOwner && !isAdmin) {
    return null;
  }

  const statCards = [
    {
      label: 'Total Members',
      value: stats?.totalMembers ?? 0,
      icon: Users,
      color: 'text-blue-500',
      bg: 'bg-blue-50 dark:bg-blue-900/20',
    },
    {
      label: 'Total Documents',
      value: stats?.totalDocuments ?? 0,
      icon: FileText,
      color: 'text-green-500',
      bg: 'bg-green-50 dark:bg-green-900/20',
    },
    {
      label: 'Total Listings',
      value: stats?.totalListings ?? 0,
      icon: Home,
      color: 'text-purple-500',
      bg: 'bg-purple-50 dark:bg-purple-900/20',
    },
    {
      label: 'Total Checks',
      value: stats?.totalChecks ?? 0,
      icon: ShieldCheck,
      color: 'text-orange-500',
      bg: 'bg-orange-50 dark:bg-orange-900/20',
    },
  ];

  const quickLinks = [
    {
      label: 'Audit Log',
      description: 'View all actions and changes in your organization',
      href: '/admin/audit-log',
      icon: ClipboardList,
    },
    {
      label: 'Organization Settings',
      description: 'Manage general settings, name, and AI configuration',
      href: '/settings',
      icon: Settings,
    },
    {
      label: 'Team Members',
      description: 'Manage team members, roles, and invitations',
      href: '/settings/members',
      icon: Users,
    },
    {
      label: 'Billing',
      description: 'View and manage your subscription plan and usage',
      href: '/settings/billing',
      icon: Shield,
    },
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Admin</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Organization administration overview.
        </p>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-6">
              {isLoading ? (
                <>
                  <Skeleton className="h-4 w-24 mb-2" />
                  <Skeleton className="h-8 w-16" />
                </>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <div className={`flex h-8 w-8 items-center justify-center rounded-lg ${stat.bg}`}>
                      <stat.icon className={`h-4 w-4 ${stat.color}`} />
                    </div>
                    <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                      {stat.label}
                    </p>
                  </div>
                  <p className="mt-3 text-3xl font-bold text-gray-900 dark:text-gray-50">
                    {stat.value}
                  </p>
                </>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Quick Links */}
      <Card>
        <CardHeader>
          <CardTitle>Quick Links</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 sm:grid-cols-2">
            {quickLinks.map((link) => (
              <button
                key={link.href}
                onClick={() => router.push(link.href)}
                className="flex items-center justify-between rounded-lg border border-gray-200 p-4 text-left transition-colors hover:bg-gray-50 dark:border-gray-700 dark:hover:bg-gray-800/50"
              >
                <div className="flex items-center gap-3">
                  <link.icon className="h-5 w-5 text-gray-400" />
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {link.label}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {link.description}
                    </p>
                  </div>
                </div>
                <ArrowRight className="h-4 w-4 text-gray-400" />
              </button>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
