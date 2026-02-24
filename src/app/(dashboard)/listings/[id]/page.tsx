'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  Home,
  MapPin,
  DollarSign,
  Bed,
  Bath,
  Ruler,
  ShieldCheck,
  Play,
  Pencil,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { formatDate, formatCurrency } from '@/lib/utils';
import { useToast } from '@/providers/toast-provider';
import type { ListingWithAgent } from '@/types/domain';
import type { ComplianceCheck } from '@/types/database';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  draft: 'secondary',
  active: 'success',
  pending: 'warning',
  sold: 'default',
  withdrawn: 'destructive',
  expired: 'destructive',
};

export default function ListingDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { addToast } = useToast();

  const [listing, setListing] = useState<ListingWithAgent | null>(null);
  const [complianceHistory, setComplianceHistory] = useState<ComplianceCheck[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRunningCheck, setIsRunningCheck] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchListing = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const [listingRes, checksRes] = await Promise.all([
        fetch(`/api/listings/${id}`),
        fetch(`/api/compliance/checks?listing_id=${id}&sortBy=created_at&sortOrder=desc&pageSize=20`),
      ]);

      if (!listingRes.ok) {
        if (listingRes.status === 404) {
          setError('Listing not found');
          return;
        }
        throw new Error('Failed to fetch listing');
      }

      const listingJson = await listingRes.json();
      setListing(listingJson.data);

      if (checksRes.ok) {
        const checksJson = await checksRes.json();
        setComplianceHistory(checksJson.data ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchListing();
  }, [fetchListing]);

  const handleRunComplianceCheck = async () => {
    setIsRunningCheck(true);
    try {
      const res = await fetch(`/api/listings/${id}/compliance-check`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!res.ok) throw new Error('Failed to run compliance check');
      addToast({
        type: 'success',
        title: 'Compliance check started',
        message: 'The check has been queued and will be completed shortly.',
      });
      // Refresh data after a short delay
      setTimeout(() => fetchListing(), 2000);
    } catch {
      addToast({
        type: 'error',
        title: 'Error',
        message: 'Failed to start compliance check.',
      });
    } finally {
      setIsRunningCheck(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading listing..." />;
  }

  if (error || !listing) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/listings')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Listings
        </button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">{error ?? 'Listing not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const scoreColor =
    listing.compliance_score !== null
      ? listing.compliance_score >= 80
        ? 'text-green-600 dark:text-green-400'
        : listing.compliance_score >= 60
          ? 'text-yellow-600 dark:text-yellow-400'
          : 'text-red-600 dark:text-red-400'
      : 'text-gray-400';

  const scoreBorderColor =
    listing.compliance_score !== null
      ? listing.compliance_score >= 80
        ? 'border-green-300 dark:border-green-700'
        : listing.compliance_score >= 60
          ? 'border-yellow-300 dark:border-yellow-700'
          : 'border-red-300 dark:border-red-700'
      : 'border-gray-200 dark:border-gray-700';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <button
        onClick={() => router.push('/listings')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Listings
      </button>

      {/* Listing Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Home className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>{listing.address}</CardTitle>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {listing.city}, {listing.state} {listing.zip_code}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant={statusBadgeVariant[listing.listing_status] ?? 'secondary'}>
                {listing.listing_status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  // In a full app this would open an edit modal or navigate to an edit page
                  addToast({ type: 'info', title: 'Edit mode', message: 'Edit functionality coming soon.' });
                }}
              >
                <Pencil className="h-3.5 w-3.5" />
                Edit
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {listing.price !== null && (
              <InfoItem icon={DollarSign} label="Price" value={formatCurrency(listing.price)} />
            )}
            {listing.bedrooms !== null && (
              <InfoItem icon={Bed} label="Bedrooms" value={listing.bedrooms.toString()} />
            )}
            {listing.bathrooms !== null && (
              <InfoItem icon={Bath} label="Bathrooms" value={listing.bathrooms.toString()} />
            )}
            {listing.square_feet !== null && (
              <InfoItem icon={Ruler} label="Sq Ft" value={listing.square_feet.toLocaleString()} />
            )}
            {listing.mls_number && (
              <InfoItem icon={Home} label="MLS#" value={listing.mls_number} />
            )}
            {listing.property_type && (
              <InfoItem
                icon={MapPin}
                label="Property Type"
                value={listing.property_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              />
            )}
            <InfoItem
              icon={MapPin}
              label="Agent"
              value={listing.agent?.full_name ?? listing.agent?.email ?? 'Unassigned'}
            />
            <InfoItem icon={Clock} label="Created" value={formatDate(listing.created_at)} />
          </div>

          {/* Description */}
          {listing.description && (
            <div className="mt-6 border-t border-gray-200 pt-4 dark:border-gray-700">
              <h4 className="mb-2 text-sm font-semibold text-gray-700 dark:text-gray-300">
                Description
              </h4>
              <p className="whitespace-pre-wrap text-sm text-gray-600 dark:text-gray-400">
                {listing.description}
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Compliance Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
              Compliance Status
            </CardTitle>
            <Button onClick={handleRunComplianceCheck} loading={isRunningCheck}>
              <Play className="h-4 w-4" />
              Run Check
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-6">
            {/* Score Circle */}
            <div
              className={`flex h-24 w-24 shrink-0 items-center justify-center rounded-full border-4 ${scoreBorderColor}`}
            >
              <span className={`text-3xl font-bold ${scoreColor}`}>
                {listing.compliance_score ?? '--'}
              </span>
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                {listing.compliance_score !== null
                  ? listing.compliance_score >= 80
                    ? 'Compliant'
                    : listing.compliance_score >= 60
                      ? 'Needs Attention'
                      : 'Non-Compliant'
                  : 'Not Checked'}
              </p>
              {listing.last_compliance_check && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Last checked: {formatDate(listing.last_compliance_check)}
                </p>
              )}
              {!listing.last_compliance_check && (
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  No compliance checks have been run for this listing yet.
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Compliance History */}
      {complianceHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>Compliance History</CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="divide-y divide-gray-100 dark:divide-gray-800">
              {complianceHistory.map((check) => (
                <li
                  key={check.id}
                  className="flex items-center justify-between py-3 first:pt-0 last:pb-0"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                      {check.check_type.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      {formatDate(check.created_at)}
                      {check.summary && ` - ${check.summary}`}
                    </p>
                  </div>
                  <div className="ml-3 flex items-center gap-2">
                    {check.score !== null && (
                      <span
                        className={`text-sm font-semibold ${
                          check.score >= 80
                            ? 'text-green-600 dark:text-green-400'
                            : check.score >= 60
                              ? 'text-yellow-600 dark:text-yellow-400'
                              : 'text-red-600 dark:text-red-400'
                        }`}
                      >
                        {check.score}%
                      </span>
                    )}
                    <Badge
                      variant={
                        check.status === 'completed'
                          ? 'success'
                          : check.status === 'failed'
                            ? 'destructive'
                            : check.status === 'running'
                              ? 'default'
                              : 'warning'
                      }
                    >
                      {check.status}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ────────────────────────────────────────────
// Info Item Sub-Component
// ────────────────────────────────────────────

interface InfoItemProps {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
}

function InfoItem({ icon: Icon, label, value }: InfoItemProps) {
  return (
    <div className="flex items-start gap-2">
      <Icon className="mt-0.5 h-4 w-4 shrink-0 text-gray-400" />
      <div>
        <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">{label}</p>
        <p className="mt-0.5 text-sm font-medium text-gray-900 dark:text-gray-100">{value}</p>
      </div>
    </div>
  );
}
