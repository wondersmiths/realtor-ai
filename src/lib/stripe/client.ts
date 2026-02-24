import Stripe from 'stripe';

let stripe: Stripe | null = null;

/**
 * Returns a singleton Stripe SDK client.
 * Returns null when STRIPE_SECRET_KEY is not configured, allowing
 * the application to run without Stripe in development.
 */
export function getStripeClient(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) {
    return null;
  }
  if (!stripe) {
    stripe = new Stripe(process.env.STRIPE_SECRET_KEY, {
      apiVersion: '2026-01-28.clover',
      typescript: true,
    });
  }
  return stripe;
}
