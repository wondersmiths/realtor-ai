import 'server-only';

import { Resend } from 'resend';
import { SupabaseClient } from '@supabase/supabase-js';
import type { ComplianceCheck, Disclosure, Membership } from '@/types/database';

/**
 * Lazily initialize the Resend client.
 * Returns null if RESEND_API_KEY is not set (graceful fallback).
 */
function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  return new Resend(apiKey);
}

function getFromEmail(): string {
  return process.env.FROM_EMAIL || 'noreply@realtorai.com';
}

function getAppUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
}

export class NotificationService {
  constructor(private supabase: SupabaseClient) {}

  /**
   * Send a system-wide AI spend ceiling breach alert to the platform admin.
   */
  static async sendSystemCeilingAlert(
    adminEmail: string,
    totalSpentCents: number,
    ceilingCents: number,
  ): Promise<{ sent: boolean; error?: string }> {
    const resend = getResendClient();

    if (!resend) {
      console.warn('[NotificationService] RESEND_API_KEY not set - skipping system ceiling alert email');
      return { sent: false, error: 'Email service not configured' };
    }

    const spendPct = ceilingCents > 0 ? Math.round((totalSpentCents / ceilingCents) * 100) : 0;

    try {
      await resend.emails.send({
        from: getFromEmail(),
        to: adminEmail,
        subject: 'System AI Spend Ceiling Breached',
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">System AI Spend Ceiling Breached</h2>
            <p>The system-wide AI spend ceiling has been exceeded. All organizations have been automatically downgraded to the fastest (cheapest) model.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Total Spent</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${(totalSpentCents / 100).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Ceiling</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">$${(ceilingCents / 100).toFixed(2)}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Usage</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${spendPct}%</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Action Taken</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">All orgs downgraded to fast model</td>
              </tr>
            </table>
            <p>Increase <code>AI_SYSTEM_MONTHLY_CEILING_CENTS</code> or wait for the next billing month to restore normal model routing.</p>
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
              This is an automated notification from RealtorAI.
            </p>
          </div>
        `,
      });

      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      console.error('[NotificationService] Failed to send system ceiling alert:', message);
      return { sent: false, error: message };
    }
  }

  /**
   * Send a compliance alert email when a compliance check produces concerning findings.
   */
  async sendComplianceAlert(
    orgId: string,
    recipientEmail: string,
    check: Pick<ComplianceCheck, 'id' | 'check_type' | 'score' | 'summary' | 'findings'>
  ): Promise<{ sent: boolean; error?: string }> {
    const resend = getResendClient();

    if (!resend) {
      console.warn('[NotificationService] RESEND_API_KEY not set - skipping compliance alert email');
      return { sent: false, error: 'Email service not configured' };
    }

    const appUrl = getAppUrl();
    const checkUrl = `${appUrl}/dashboard/compliance/${check.id}`;
    const scoreLabel = check.score !== null ? `Score: ${check.score}/100` : 'Score: N/A';
    const findingsCount = check.findings?.length ?? 0;

    try {
      await resend.emails.send({
        from: getFromEmail(),
        to: recipientEmail,
        subject: `Compliance Alert: ${check.check_type} check requires attention`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc2626;">Compliance Check Alert</h2>
            <p>A compliance check has completed and requires your attention.</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Type</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${check.check_type}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Score</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${scoreLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Findings</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${findingsCount} issue(s) found</td>
              </tr>
              ${check.summary ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Summary</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${check.summary}</td>
              </tr>
              ` : ''}
            </table>
            <a href="${checkUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
              View Details
            </a>
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
              This is an automated notification from RealtorAI.
            </p>
          </div>
        `,
      });

      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      console.error('[NotificationService] Failed to send compliance alert:', message);
      return { sent: false, error: message };
    }
  }

  /**
   * Send a reminder email for an overdue or upcoming disclosure.
   */
  async sendDisclosureReminder(
    orgId: string,
    recipientEmail: string,
    disclosure: Pick<Disclosure, 'id' | 'title' | 'disclosure_type' | 'due_date' | 'status'>,
    listingAddress?: string
  ): Promise<{ sent: boolean; error?: string }> {
    const resend = getResendClient();

    if (!resend) {
      console.warn('[NotificationService] RESEND_API_KEY not set - skipping disclosure reminder email');
      return { sent: false, error: 'Email service not configured' };
    }

    const appUrl = getAppUrl();
    const disclosureUrl = `${appUrl}/dashboard/disclosures/${disclosure.id}`;
    const dueLabel = disclosure.due_date
      ? new Date(disclosure.due_date).toLocaleDateString('en-US', {
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        })
      : 'No due date set';

    const isOverdue = disclosure.due_date && new Date(disclosure.due_date) < new Date();

    try {
      await resend.emails.send({
        from: getFromEmail(),
        to: recipientEmail,
        subject: isOverdue
          ? `OVERDUE: Disclosure "${disclosure.title}" needs attention`
          : `Reminder: Disclosure "${disclosure.title}" due soon`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: ${isOverdue ? '#dc2626' : '#f59e0b'};">
              ${isOverdue ? 'Overdue Disclosure' : 'Disclosure Reminder'}
            </h2>
            <p>The following disclosure requires your attention:</p>
            <table style="width: 100%; border-collapse: collapse; margin: 16px 0;">
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Title</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${disclosure.title}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Type</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${disclosure.disclosure_type}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Due Date</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${dueLabel}</td>
              </tr>
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Status</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${disclosure.status}</td>
              </tr>
              ${listingAddress ? `
              <tr>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb; font-weight: bold;">Listing</td>
                <td style="padding: 8px; border-bottom: 1px solid #e5e7eb;">${listingAddress}</td>
              </tr>
              ` : ''}
            </table>
            <a href="${disclosureUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px;">
              View Disclosure
            </a>
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
              This is an automated notification from RealtorAI.
            </p>
          </div>
        `,
      });

      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      console.error('[NotificationService] Failed to send disclosure reminder:', message);
      return { sent: false, error: message };
    }
  }

  /**
   * Send an organization invitation email.
   */
  async sendInvitation(
    orgId: string,
    membership: Pick<Membership, 'id' | 'invited_email' | 'role'>,
    organizationName: string,
    inviterName?: string
  ): Promise<{ sent: boolean; error?: string }> {
    const resend = getResendClient();

    if (!resend) {
      console.warn('[NotificationService] RESEND_API_KEY not set - skipping invitation email');
      return { sent: false, error: 'Email service not configured' };
    }

    if (!membership.invited_email) {
      return { sent: false, error: 'No invited email address' };
    }

    const appUrl = getAppUrl();
    const inviteUrl = `${appUrl}/invite/${membership.id}`;
    const inviterLabel = inviterName || 'A team member';

    try {
      await resend.emails.send({
        from: getFromEmail(),
        to: membership.invited_email,
        subject: `You've been invited to join ${organizationName} on RealtorAI`,
        html: `
          <div style="font-family: sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #2563eb;">You're Invited!</h2>
            <p>${inviterLabel} has invited you to join <strong>${organizationName}</strong> on RealtorAI as a <strong>${membership.role}</strong>.</p>
            <p>RealtorAI helps real estate teams stay compliant with automated document review, fair housing checks, and disclosure tracking.</p>
            <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #2563eb; color: white; text-decoration: none; border-radius: 6px; margin: 16px 0;">
              Accept Invitation
            </a>
            <p style="color: #6b7280; font-size: 12px; margin-top: 24px;">
              If you didn't expect this invitation, you can safely ignore this email.
            </p>
          </div>
        `,
      });

      return { sent: true };
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown email error';
      console.error('[NotificationService] Failed to send invitation:', message);
      return { sent: false, error: message };
    }
  }
}
