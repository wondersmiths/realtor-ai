'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter, useParams } from 'next/navigation';
import {
  ArrowLeft,
  FileWarning,
  Trash2,
  Edit,
  Clock,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select } from '@/components/ui/select';
import { LoadingState } from '@/components/shared/loading-state';
import { useToast } from '@/providers/toast-provider';
import { formatDate } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const statusBadgeVariant: Record<string, BadgeVariant> = {
  required: 'warning',
  in_progress: 'default',
  submitted: 'default',
  reviewed: 'success',
  accepted: 'success',
  rejected: 'destructive',
};

const typeLabels: Record<string, string> = {
  seller_disclosure: 'Seller Disclosure',
  lead_paint: 'Lead Paint',
  property_condition: 'Property Condition',
  natural_hazard: 'Natural Hazard',
  hoa: 'HOA',
  title: 'Title',
  flood_zone: 'Flood Zone',
};

const STATUS_TRANSITION_OPTIONS = [
  { value: '', label: 'Change Status...' },
  { value: 'required', label: 'Required' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'submitted', label: 'Submitted' },
  { value: 'reviewed', label: 'Reviewed' },
  { value: 'accepted', label: 'Accepted' },
  { value: 'rejected', label: 'Rejected' },
];

interface DisclosureDetail {
  id: string;
  title: string;
  disclosure_type: string;
  status: string;
  due_date: string | null;
  completed_at: string | null;
  assigned_to: string | null;
  notes: string | null;
  description: string | null;
  listing_id: string;
  listing?: { id: string; address: string; mls_number: string | null } | null;
  assigned_to_profile?: { full_name: string | null; email: string } | null;
  created_at: string;
  updated_at: string;
}

export default function DisclosureDetailPage() {
  const router = useRouter();
  const params = useParams();
  const id = params.id as string;
  const { addToast } = useToast();

  const [disclosure, setDisclosure] = useState<DisclosureDetail | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isUpdatingStatus, setIsUpdatingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchDisclosure = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/disclosures/${id}`);
      if (!res.ok) {
        if (res.status === 404) {
          setError('Disclosure not found');
          return;
        }
        throw new Error('Failed to fetch disclosure');
      }
      const json = await res.json();
      setDisclosure(json.data);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setIsLoading(false);
    }
  }, [id]);

  useEffect(() => {
    fetchDisclosure();
  }, [fetchDisclosure]);

  const handleStatusChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const newStatus = e.target.value;
    if (!newStatus) return;

    setIsUpdatingStatus(true);
    try {
      const res = await fetch(`/api/disclosures/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (!res.ok) throw new Error('Failed to update status');
      addToast({ type: 'success', title: 'Status updated' });
      fetchDisclosure();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update disclosure status.' });
    } finally {
      setIsUpdatingStatus(false);
    }
  };

  const handleDelete = async () => {
    if (!confirm('Are you sure you want to delete this disclosure? This action cannot be undone.')) {
      return;
    }
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/disclosures/${id}`, { method: 'DELETE' });
      if (!res.ok) throw new Error('Failed to delete disclosure');
      addToast({ type: 'success', title: 'Disclosure deleted' });
      router.push('/disclosures');
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to delete disclosure.' });
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return <LoadingState message="Loading disclosure..." />;
  }

  if (error || !disclosure) {
    return (
      <div className="space-y-4">
        <button
          onClick={() => router.push('/disclosures')}
          className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Disclosures
        </button>
        <Card>
          <CardContent className="py-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">{error ?? 'Disclosure not found'}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const isOverdue =
    disclosure.due_date &&
    new Date(disclosure.due_date) < new Date() &&
    disclosure.status !== 'accepted' &&
    disclosure.status !== 'reviewed';

  return (
    <div className="space-y-6">
      {/* Back Link */}
      <button
        onClick={() => router.push('/disclosures')}
        className="inline-flex items-center gap-1 text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
      >
        <ArrowLeft className="h-4 w-4" />
        Back to Disclosures
      </button>

      {/* Disclosure Info Card */}
      <Card>
        <CardHeader>
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-yellow-50 dark:bg-yellow-900/20">
                <FileWarning className="h-6 w-6 text-yellow-600 dark:text-yellow-400" />
              </div>
              <div>
                <CardTitle>{disclosure.title}</CardTitle>
                <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
                  {typeLabels[disclosure.disclosure_type] ?? disclosure.disclosure_type}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              {isOverdue && <Badge variant="destructive">Overdue</Badge>}
              <Badge variant={statusBadgeVariant[disclosure.status] ?? 'secondary'}>
                {disclosure.status.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())}
              </Badge>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Listing</p>
              {disclosure.listing ? (
                <button
                  onClick={() => router.push(`/listings/${disclosure.listing!.id}`)}
                  className="mt-1 text-sm font-medium text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                >
                  {disclosure.listing.address}
                </button>
              ) : (
                <p className="mt-1 text-sm text-gray-400">--</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Due Date</p>
              <p className={`mt-1 text-sm font-medium ${isOverdue ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                {disclosure.due_date ? formatDate(disclosure.due_date) : '--'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Assigned To</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {disclosure.assigned_to_profile?.full_name ?? disclosure.assigned_to_profile?.email ?? '--'}
              </p>
            </div>
            <div>
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Created</p>
              <p className="mt-1 text-sm font-medium text-gray-900 dark:text-gray-100">
                {formatDate(disclosure.created_at)}
              </p>
            </div>
          </div>

          {/* Description */}
          {disclosure.description && (
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Description</p>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {disclosure.description}
              </p>
            </div>
          )}

          {/* Notes */}
          {disclosure.notes && (
            <div className="mt-4 border-t border-gray-200 pt-4 dark:border-gray-700">
              <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">Notes</p>
              <p className="mt-1 text-sm text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                {disclosure.notes}
              </p>
            </div>
          )}

          {/* Actions */}
          <div className="mt-6 flex flex-wrap items-center gap-3 border-t border-gray-200 pt-4 dark:border-gray-700">
            <Select
              options={STATUS_TRANSITION_OPTIONS}
              value=""
              onChange={handleStatusChange}
              disabled={isUpdatingStatus}
              className="w-48"
            />
            <Button
              variant="outline"
              onClick={() => router.push(`/disclosures/${id}/edit`)}
            >
              <Edit className="h-4 w-4" />
              Edit
            </Button>
            <Button variant="destructive" onClick={handleDelete} loading={isDeleting}>
              <Trash2 className="h-4 w-4" />
              Delete
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Timeline */}
      <Card>
        <CardHeader>
          <CardTitle>Timeline</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
                <Clock className="h-4 w-4 text-gray-500" />
              </div>
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Created</p>
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  {formatDate(disclosure.created_at)}
                </p>
              </div>
            </div>

            {disclosure.updated_at !== disclosure.created_at && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-blue-100 dark:bg-blue-900/30">
                  <Edit className="h-4 w-4 text-blue-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">
                    Last Updated
                  </p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(disclosure.updated_at)}
                  </p>
                </div>
              </div>
            )}

            {disclosure.completed_at && (
              <div className="flex items-start gap-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-green-100 dark:bg-green-900/30">
                  <FileWarning className="h-4 w-4 text-green-500" />
                </div>
                <div>
                  <p className="text-sm font-medium text-gray-900 dark:text-gray-100">Completed</p>
                  <p className="text-xs text-gray-500 dark:text-gray-400">
                    {formatDate(disclosure.completed_at)}
                  </p>
                </div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
