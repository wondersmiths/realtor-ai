'use client';

import { useState, useEffect } from 'react';
import { Settings, Save } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useOrganization } from '@/hooks/use-organization';
import { useToast } from '@/providers/toast-provider';

export default function SettingsPage() {
  const { currentOrg, isLoading: orgLoading } = useOrganization();
  const { addToast } = useToast();

  const [orgName, setOrgName] = useState('');
  const [aiEnabled, setAiEnabled] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (currentOrg) {
      setOrgName(currentOrg.name);
      setAiEnabled(currentOrg.ai_enabled);
    }
  }, [currentOrg]);

  const handleSave = async () => {
    if (!currentOrg) return;

    setIsSaving(true);
    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: orgName,
          ai_enabled: aiEnabled,
        }),
      });

      if (!res.ok) throw new Error('Failed to save settings');

      addToast({ type: 'success', title: 'Settings saved', message: 'Organization settings have been updated.' });
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to save organization settings.' });
    } finally {
      setIsSaving(false);
    }
  };

  if (orgLoading || !currentOrg) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Settings</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Loading organization settings...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Settings</h1>
        <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
          Manage your organization settings.
        </p>
      </div>

      {/* General Settings Card */}
      <Card>
        <CardHeader>
          <div className="flex items-center gap-2">
            <Settings className="h-5 w-5 text-gray-400" />
            <CardTitle>General</CardTitle>
          </div>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Org Name */}
          <Input
            label="Organization Name"
            value={orgName}
            onChange={(e) => setOrgName(e.target.value)}
            placeholder="Your organization name"
          />

          {/* Org Slug (read-only) */}
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              Organization Slug
            </label>
            <div className="flex h-10 w-full items-center rounded-md border border-gray-300 bg-gray-50 px-3 text-sm text-gray-500 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-400">
              {currentOrg.slug}
            </div>
            <p className="mt-1 text-xs text-gray-400">
              The slug is used in URLs and cannot be changed.
            </p>
          </div>

          {/* AI Enabled Toggle */}
          <div className="w-full">
            <label className="mb-1.5 block text-sm font-medium text-gray-700 dark:text-gray-300">
              AI Features
            </label>
            <div className="flex items-center gap-3">
              <button
                type="button"
                role="switch"
                aria-checked={aiEnabled}
                onClick={() => setAiEnabled(!aiEnabled)}
                className={`
                  relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent
                  transition-colors duration-200 ease-in-out
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2
                  ${aiEnabled ? 'bg-blue-600' : 'bg-gray-200 dark:bg-gray-700'}
                `}
              >
                <span
                  className={`
                    pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0
                    transition duration-200 ease-in-out
                    ${aiEnabled ? 'translate-x-5' : 'translate-x-0'}
                  `}
                />
              </button>
              <span className="text-sm text-gray-700 dark:text-gray-300">
                {aiEnabled ? 'Enabled' : 'Disabled'}
              </span>
            </div>
            <p className="mt-1 text-xs text-gray-400">
              When enabled, AI-powered compliance checks, document reviews, and fair housing analysis are available.
            </p>
          </div>

          {/* Save Button */}
          <div className="flex justify-end border-t border-gray-200 pt-4 dark:border-gray-700">
            <Button onClick={handleSave} loading={isSaving}>
              <Save className="h-4 w-4" />
              Save Changes
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
