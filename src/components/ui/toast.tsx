'use client';

/**
 * Re-export toast types and hook from the toast provider.
 *
 * Usage:
 *   import { useToast } from '@/components/ui/toast';
 *   const { addToast } = useToast();
 *   addToast({ type: 'success', title: 'Saved!' });
 */
export { useToast } from '@/providers/toast-provider';
export type { Toast } from '@/providers/toast-provider';
