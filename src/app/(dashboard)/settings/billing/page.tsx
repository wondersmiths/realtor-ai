'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  CreditCard,
  Check,
  Zap,
  HardDrive,
  FileText,
  Bot,
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { LoadingState } from '@/components/shared/loading-state';
import { useOrganization } from '@/hooks/use-organization';
import { useToast } from '@/providers/toast-provider';

interface PlanInfo {
  name: string;
  price: string;
  priceMonthly: number;
  features: string[];
  aiChecks: number;
  documents: number;
  storageMB: number;
}

const PLANS: Record<string, PlanInfo> = {
  free: {
    name: 'Free',
    price: '$0',
    priceMonthly: 0,
    features: ['5 AI checks/month', '10 documents', '100 MB storage', 'Basic compliance'],
    aiChecks: 5,
    documents: 10,
    storageMB: 100,
  },
  starter: {
    name: 'Starter',
    price: '$29',
    priceMonthly: 29,
    features: ['50 AI checks/month', '100 documents', '1 GB storage', 'Fair housing checks', 'Email support'],
    aiChecks: 50,
    documents: 100,
    storageMB: 1024,
  },
  professional: {
    name: 'Professional',
    price: '$79',
    priceMonthly: 79,
    features: ['500 AI checks/month', 'Unlimited documents', '10 GB storage', 'All compliance types', 'Priority support', 'Audit log'],
    aiChecks: 500,
    documents: -1, // unlimited
    storageMB: 10240,
  },
  enterprise: {
    name: 'Enterprise',
    price: '$199',
    priceMonthly: 199,
    features: ['Unlimited AI checks', 'Unlimited documents', '100 GB storage', 'All compliance types', 'Dedicated support', 'Custom integrations', 'SSO'],
    aiChecks: -1, // unlimited
    documents: -1,
    storageMB: 102400,
  },
};

interface UsageData {
  aiChecksUsed: number;
  aiChecksLimit: number;
  documentsUsed: number;
  documentsLimit: number;
  storageBytesUsed: number;
  storageBytesLimit: number;
  currentMonthSpendCents: number;
  monthlyLimitCents: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const size = bytes / Math.pow(1024, i);
  return `${size.toFixed(i === 0 ? 0 : 1)} ${units[i]}`;
}

function ProgressBar({ used, total, label }: { used: number; total: number; label: string }) {
  const isUnlimited = total < 0;
  const pct = isUnlimited ? 0 : total === 0 ? 0 : Math.min((used / total) * 100, 100);
  const pctColor =
    pct >= 90
      ? 'bg-red-500'
      : pct >= 70
        ? 'bg-yellow-500'
        : 'bg-blue-500';

  return (
    <div>
      <div className="flex items-center justify-between mb-1">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300">{label}</span>
        <span className="text-sm text-gray-500 dark:text-gray-400">
          {isUnlimited ? `${used} / Unlimited` : `${used} / ${total}`}
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className={`h-full rounded-full transition-all ${pctColor}`}
          style={{ width: isUnlimited ? '0%' : `${pct}%` }}
        />
      </div>
      {!isUnlimited && (
        <p className="mt-0.5 text-xs text-gray-400">{pct.toFixed(0)}% used</p>
      )}
    </div>
  );
}

export default function BillingPage() {
  const { currentOrg, isLoading: orgLoading } = useOrganization();
  const { addToast } = useToast();

  const [usage, setUsage] = useState<UsageData | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isManaging, setIsManaging] = useState(false);

  const currentPlan = currentOrg?.plan_tier ?? 'free';
  const planInfo = PLANS[currentPlan] ?? PLANS.free;

  const fetchUsage = useCallback(async () => {
    if (!currentOrg) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}/usage`);
      if (!res.ok) throw new Error('Failed to fetch usage data');

      const json = await res.json();
      const data = json.data;

      setUsage({
        aiChecksUsed: data?.quota?.used_ai_checks ?? 0,
        aiChecksLimit: data?.quota?.max_ai_checks ?? planInfo.aiChecks,
        documentsUsed: data?.quota?.used_documents ?? 0,
        documentsLimit: data?.quota?.max_documents ?? planInfo.documents,
        storageBytesUsed: data?.quota?.used_storage_bytes ?? 0,
        storageBytesLimit: data?.quota?.max_storage_bytes ?? planInfo.storageMB * 1024 * 1024,
        currentMonthSpendCents: data?.currentMonthSpendCents ?? 0,
        monthlyLimitCents: data?.costLimit?.monthly_soft_limit_cents ?? 0,
      });
    } catch (err) {
      console.error('Error fetching usage:', err);
      // Set default usage data
      setUsage({
        aiChecksUsed: 0,
        aiChecksLimit: planInfo.aiChecks,
        documentsUsed: 0,
        documentsLimit: planInfo.documents,
        storageBytesUsed: 0,
        storageBytesLimit: planInfo.storageMB * 1024 * 1024,
        currentMonthSpendCents: 0,
        monthlyLimitCents: 0,
      });
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg, planInfo]);

  useEffect(() => {
    fetchUsage();
  }, [fetchUsage]);

  const handleManageBilling = async () => {
    if (!currentOrg) return;

    setIsManaging(true);
    try {
      // Try portal first (for existing subscribers), fall back to checkout
      const endpoint = currentOrg.stripe_subscription_id
        ? '/api/billing/portal'
        : '/api/billing/checkout';

      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ organizationId: currentOrg.id }),
      });

      if (!res.ok) throw new Error('Failed to open billing');

      const json = await res.json();
      if (json.url) {
        window.location.href = json.url;
      }
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to open billing portal.' });
    } finally {
      setIsManaging(false);
    }
  };

  if (orgLoading || isLoading) {
    return <LoadingState message="Loading billing information..." />;
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Billing</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your subscription and view usage.
        </p>
      </div>

      {/* Current Plan Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCard className="h-5 w-5 text-gray-400" />
              <CardTitle>Current Plan</CardTitle>
            </div>
            <Button onClick={handleManageBilling} loading={isManaging}>
              <Zap className="h-4 w-4" />
              {currentOrg?.stripe_subscription_id ? 'Manage Subscription' : 'Upgrade'}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center rounded-xl bg-blue-50 dark:bg-blue-900/20">
              <span className="text-2xl font-bold text-blue-600 dark:text-blue-400">
                {planInfo.price}
              </span>
            </div>
            <div>
              <p className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                {planInfo.name}
              </p>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                {planInfo.priceMonthly > 0 ? `${planInfo.price}/month` : 'Free forever'}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Usage Meters */}
      <Card>
        <CardHeader>
          <CardTitle>Usage This Month</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid gap-6 sm:grid-cols-1 lg:grid-cols-3">
            <div className="flex items-start gap-3">
              <Bot className="mt-1 h-5 w-5 text-blue-500" />
              <div className="flex-1">
                <ProgressBar
                  used={usage?.aiChecksUsed ?? 0}
                  total={usage?.aiChecksLimit ?? 0}
                  label="AI Checks"
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <FileText className="mt-1 h-5 w-5 text-green-500" />
              <div className="flex-1">
                <ProgressBar
                  used={usage?.documentsUsed ?? 0}
                  total={usage?.documentsLimit ?? 0}
                  label="Documents"
                />
              </div>
            </div>

            <div className="flex items-start gap-3">
              <HardDrive className="mt-1 h-5 w-5 text-purple-500" />
              <div className="flex-1">
                <ProgressBar
                  used={Math.round((usage?.storageBytesUsed ?? 0) / (1024 * 1024))}
                  total={Math.round((usage?.storageBytesLimit ?? 0) / (1024 * 1024))}
                  label={`Storage (${formatBytes(usage?.storageBytesUsed ?? 0)} / ${formatBytes(usage?.storageBytesLimit ?? 0)})`}
                />
              </div>
            </div>
          </div>

          {/* Cost Section */}
          <div className="border-t border-gray-200 pt-4 dark:border-gray-700">
            <div className="grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Current Month Spend
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
                  ${((usage?.currentMonthSpendCents ?? 0) / 100).toFixed(2)}
                </p>
              </div>
              <div>
                <p className="text-xs font-medium uppercase text-gray-500 dark:text-gray-400">
                  Monthly Limit
                </p>
                <p className="mt-1 text-xl font-bold text-gray-900 dark:text-gray-50">
                  {(usage?.monthlyLimitCents ?? 0) > 0
                    ? `$${((usage?.monthlyLimitCents ?? 0) / 100).toFixed(2)}`
                    : 'No limit set'}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Plan Comparison Grid */}
      <Card>
        <CardHeader>
          <CardTitle>Compare Plans</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {Object.entries(PLANS).map(([tier, plan]) => {
              const isCurrent = tier === currentPlan;
              return (
                <div
                  key={tier}
                  className={`
                    rounded-lg border-2 p-4 transition-colors
                    ${isCurrent
                      ? 'border-blue-500 bg-blue-50/50 dark:bg-blue-900/10'
                      : 'border-gray-200 dark:border-gray-700'
                    }
                  `}
                >
                  <div className="flex items-center justify-between mb-3">
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-50">
                      {plan.name}
                    </h3>
                    {isCurrent && <Badge variant="default">Current</Badge>}
                  </div>
                  <p className="text-2xl font-bold text-gray-900 dark:text-gray-50">
                    {plan.price}
                    {plan.priceMonthly > 0 && (
                      <span className="text-sm font-normal text-gray-500">/mo</span>
                    )}
                  </p>
                  <ul className="mt-4 space-y-2">
                    {plan.features.map((feature, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                        <Check className="h-4 w-4 shrink-0 text-green-500" />
                        {feature}
                      </li>
                    ))}
                  </ul>
                  {!isCurrent && (
                    <Button
                      variant="outline"
                      className="mt-4 w-full"
                      onClick={handleManageBilling}
                    >
                      {PLANS[tier].priceMonthly > planInfo.priceMonthly ? 'Upgrade' : 'Switch'}
                    </Button>
                  )}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
