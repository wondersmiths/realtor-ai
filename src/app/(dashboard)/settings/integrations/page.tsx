'use client';

import { Link2, Plug } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

export default function IntegrationsPage() {
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Integrations</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Connect third-party services to enhance your workflow.
        </p>
      </div>

      {/* MLS Integration Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-lg bg-blue-50 dark:bg-blue-900/20">
                <Link2 className="h-6 w-6 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <CardTitle>MLS Integration</CardTitle>
                <p className="mt-0.5 text-sm text-gray-500 dark:text-gray-400">
                  Multiple Listing Service
                </p>
              </div>
            </div>
            <Badge variant="warning">Coming Soon</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-gray-600 dark:text-gray-300">
            Connect your MLS account to automatically import and sync your property listings.
            This integration will enable real-time listing data synchronization, automatic
            compliance checks on new listings, and streamlined disclosure management
            directly from your MLS feed.
          </p>
          <div className="mt-4 rounded-lg bg-gray-50 p-4 dark:bg-gray-800/50">
            <p className="text-sm text-gray-500 dark:text-gray-400">
              We are actively developing MLS integration support. Features will include:
            </p>
            <ul className="mt-2 space-y-1 text-sm text-gray-500 dark:text-gray-400">
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Automatic listing import from RETS/RESO Web API
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Bi-directional sync for listing updates
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Auto-triggered compliance checks on new imports
              </li>
              <li className="flex items-center gap-2">
                <span className="h-1.5 w-1.5 rounded-full bg-gray-400" />
                Support for major MLS providers nationwide
              </li>
            </ul>
          </div>
        </CardContent>
      </Card>

      {/* Placeholder for future integrations */}
      <Card>
        <CardContent className="flex flex-col items-center justify-center py-12 text-center">
          <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-gray-100 dark:bg-gray-800">
            <Plug className="h-6 w-6 text-gray-400 dark:text-gray-500" />
          </div>
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-50">
            More Integrations
          </h3>
          <p className="mt-1 max-w-sm text-sm text-gray-500 dark:text-gray-400">
            Additional integrations for CRMs, e-signature platforms, and document
            management systems are on our roadmap.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
