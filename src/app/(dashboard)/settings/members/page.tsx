'use client';

import { useState, useEffect, useCallback } from 'react';
import { UserPlus, Trash2 } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { DataTable, type Column } from '@/components/shared/data-table';
import { useOrganization } from '@/hooks/use-organization';
import { usePermissions } from '@/hooks/use-permissions';
import { useToast } from '@/providers/toast-provider';
import { formatDate } from '@/lib/utils';

type BadgeVariant = 'default' | 'secondary' | 'success' | 'warning' | 'destructive';

const roleBadgeVariant: Record<string, BadgeVariant> = {
  owner: 'destructive',
  admin: 'warning',
  agent: 'default',
};

const ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'agent', label: 'Agent' },
];

const INVITE_ROLE_OPTIONS = [
  { value: 'admin', label: 'Admin' },
  { value: 'agent', label: 'Agent' },
];

interface MemberRow {
  id: string;
  user_id: string;
  full_name: string;
  email: string;
  role: string;
  created_at: string;
}

export default function MembersPage() {
  const { currentOrg } = useOrganization();
  const { canManageMembers } = usePermissions();
  const { addToast } = useToast();

  const [members, setMembers] = useState<MemberRow[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole] = useState('agent');
  const [isInviting, setIsInviting] = useState(false);

  const fetchMembers = useCallback(async () => {
    if (!currentOrg) return;

    setIsLoading(true);
    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}/members`);
      if (!res.ok) throw new Error('Failed to fetch members');

      const json = await res.json();
      const data = json.data ?? [];

      setMembers(
        data.map((m: any) => ({
          id: m.id,
          user_id: m.user_id,
          full_name: m.profile?.full_name ?? '--',
          email: m.profile?.email ?? m.invited_email ?? '--',
          role: m.role,
          created_at: m.accepted_at ?? m.created_at,
        }))
      );
    } catch (err) {
      console.error('Error fetching members:', err);
      setMembers([]);
    } finally {
      setIsLoading(false);
    }
  }, [currentOrg]);

  useEffect(() => {
    fetchMembers();
  }, [fetchMembers]);

  const handleInvite = async () => {
    if (!currentOrg || !inviteEmail.trim()) return;

    setIsInviting(true);
    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}/members`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: inviteEmail, role: inviteRole }),
      });

      if (!res.ok) {
        const errJson = await res.json().catch(() => null);
        throw new Error(errJson?.error ?? 'Failed to invite member');
      }

      addToast({ type: 'success', title: 'Invitation sent', message: `Invited ${inviteEmail} as ${inviteRole}.` });
      setInviteEmail('');
      setInviteRole('agent');
      setInviteOpen(false);
      fetchMembers();
    } catch (err) {
      addToast({
        type: 'error',
        title: 'Error',
        message: err instanceof Error ? err.message : 'Failed to invite member.',
      });
    } finally {
      setIsInviting(false);
    }
  };

  const handleRoleChange = async (memberId: string, newRole: string) => {
    if (!currentOrg) return;

    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}/members/${memberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });

      if (!res.ok) throw new Error('Failed to update role');

      addToast({ type: 'success', title: 'Role updated' });
      fetchMembers();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to update member role.' });
    }
  };

  const handleRemove = async (memberId: string, memberName: string) => {
    if (!currentOrg) return;
    if (!confirm(`Are you sure you want to remove ${memberName} from the organization?`)) return;

    try {
      const res = await fetch(`/api/organizations/${currentOrg.id}/members/${memberId}`, {
        method: 'DELETE',
      });

      if (!res.ok) throw new Error('Failed to remove member');

      addToast({ type: 'success', title: 'Member removed' });
      fetchMembers();
    } catch {
      addToast({ type: 'error', title: 'Error', message: 'Failed to remove member.' });
    }
  };

  const columns: Column<MemberRow>[] = [
    {
      header: 'Name',
      accessor: 'full_name',
      render: (_, row) => (
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-full bg-gray-100 text-sm font-medium text-gray-600 dark:bg-gray-800 dark:text-gray-300">
            {row.full_name !== '--' ? row.full_name.charAt(0).toUpperCase() : row.email.charAt(0).toUpperCase()}
          </div>
          <span className="font-medium">{row.full_name}</span>
        </div>
      ),
    },
    {
      header: 'Email',
      accessor: 'email',
    },
    {
      header: 'Role',
      accessor: 'role',
      render: (value, row) => {
        if (canManageMembers && String(value) !== 'owner') {
          return (
            <Select
              options={ROLE_OPTIONS}
              value={String(value)}
              onChange={(e) => handleRoleChange(row.id, e.target.value)}
              className="w-28"
            />
          );
        }
        return (
          <Badge variant={roleBadgeVariant[String(value)] ?? 'secondary'}>
            {String(value).replace(/\b\w/g, (c) => c.toUpperCase())}
          </Badge>
        );
      },
    },
    {
      header: 'Joined',
      accessor: 'created_at',
      render: (value) => formatDate(String(value)),
    },
    ...(canManageMembers
      ? [
          {
            header: '',
            accessor: 'id' as keyof MemberRow & string,
            render: (_: any, row: MemberRow) => {
              if (row.role === 'owner') return null;
              return (
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={(e) => {
                    e.stopPropagation();
                    handleRemove(row.id, row.full_name);
                  }}
                  title="Remove member"
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              );
            },
            className: 'w-12',
          },
        ] as Column<MemberRow>[]
      : []),
  ];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-gray-50">Team Members</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Manage your organization&apos;s team members and their roles.
          </p>
        </div>
        {canManageMembers && (
          <Button onClick={() => setInviteOpen(true)}>
            <UserPlus className="h-4 w-4" />
            Invite Member
          </Button>
        )}
      </div>

      {/* Members Table */}
      <Card>
        <CardContent className="p-0">
          <DataTable
            columns={columns}
            data={members}
            isLoading={isLoading}
            emptyMessage="No team members found"
            emptyDescription="Invite members to start collaborating."
            rowKey={(row) => row.id}
          />
        </CardContent>
      </Card>

      {/* Invite Dialog */}
      <Dialog open={inviteOpen} onOpenChange={setInviteOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Invite Team Member</DialogTitle>
            <DialogDescription>
              Send an invitation to join your organization.
            </DialogDescription>
          </DialogHeader>

          <div className="mt-4 space-y-4">
            <Input
              label="Email Address"
              type="email"
              placeholder="colleague@example.com"
              value={inviteEmail}
              onChange={(e) => setInviteEmail(e.target.value)}
            />

            <Select
              label="Role"
              options={INVITE_ROLE_OPTIONS}
              value={inviteRole}
              onChange={(e) => setInviteRole(e.target.value)}
            />

            <div className="flex justify-end gap-3 pt-2">
              <Button variant="outline" onClick={() => setInviteOpen(false)}>
                Cancel
              </Button>
              <Button
                onClick={handleInvite}
                loading={isInviting}
                disabled={!inviteEmail.trim()}
              >
                Send Invitation
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
