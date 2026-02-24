import type { Job } from 'bullmq';
import { getSupabaseAdmin } from '@/lib/supabase/admin';
import { NotificationService } from '@/services/notification.service';
import type { NotificationJob } from '@/lib/queue/jobs';

/**
 * Notification processor.
 *
 * Routes by notification type to the appropriate NotificationService method:
 * - compliance_alert -> sendComplianceAlert
 * - disclosure_reminder -> sendDisclosureReminder
 * - invitation -> sendInvitation
 */
export async function processNotification(job: Job<NotificationJob>): Promise<void> {
  const { type, orgId, recipientEmail, data } = job.data;
  const supabase = getSupabaseAdmin();
  const notificationService = new NotificationService(supabase as any);

  console.log(`[NotificationWorker] Sending ${type} to ${recipientEmail}`);

  try {
    switch (type) {
      // ────────────────────────────
      // Compliance Alert
      // ────────────────────────────
      case 'compliance_alert': {
        const result = await notificationService.sendComplianceAlert(orgId, recipientEmail, {
          id: data.checkId as string,
          check_type: data.checkType as any,
          score: (data.score as number) ?? null,
          summary: (data.summary as string) ?? null,
          findings: (data.findings as any[]) ?? [],
        });

        if (!result.sent) {
          console.warn(
            `[NotificationWorker] Compliance alert not sent: ${result.error}`
          );
        }
        break;
      }

      // ────────────────────────────
      // Disclosure Reminder
      // ────────────────────────────
      case 'disclosure_reminder': {
        const result = await notificationService.sendDisclosureReminder(
          orgId,
          recipientEmail,
          {
            id: data.disclosureId as string,
            title: data.title as string,
            disclosure_type: data.disclosureType as any,
            due_date: (data.dueDate as string) ?? null,
            status: data.status as any,
          },
          data.listingAddress as string | undefined
        );

        if (!result.sent) {
          console.warn(
            `[NotificationWorker] Disclosure reminder not sent: ${result.error}`
          );
        }
        break;
      }

      // ────────────────────────────
      // Invitation
      // ────────────────────────────
      case 'invitation': {
        const result = await notificationService.sendInvitation(
          orgId,
          {
            id: data.membershipId as string,
            invited_email: recipientEmail,
            role: data.role as any,
          },
          data.organizationName as string,
          data.inviterName as string | undefined
        );

        if (!result.sent) {
          console.warn(
            `[NotificationWorker] Invitation not sent: ${result.error}`
          );
        }
        break;
      }

      default:
        console.warn(`[NotificationWorker] Unknown notification type: ${type}`);
    }

    console.log(`[NotificationWorker] Processed ${type} notification for ${recipientEmail}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[NotificationWorker] Failed to send ${type} notification:`, message);
    throw error;
  }
}
