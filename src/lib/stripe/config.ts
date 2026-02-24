// ──────────────────────────────────────────────
// Plan definitions
// ──────────────────────────────────────────────

export interface PlanLimits {
  members: number;
  documents: number;
  aiChecks: number;
  listings: number;
  storageGB: number;
}

export interface PlanDefinition {
  name: string;
  /** Price in cents. -1 = custom / contact sales. */
  price: number;
  stripePriceId?: string;
  limits: PlanLimits;
}

/**
 * All available plans.
 * Limit values of -1 indicate "unlimited".
 * Price of -1 indicates "contact sales" (enterprise).
 */
export const PLANS: Record<string, PlanDefinition> = {
  free: {
    name: 'Free',
    price: 0,
    limits: {
      members: 3,
      documents: 10,
      aiChecks: 20,
      listings: 5,
      storageGB: 1,
    },
  },
  starter: {
    name: 'Starter',
    price: 4900,
    stripePriceId: process.env.STRIPE_PRICE_STARTER || 'price_starter',
    limits: {
      members: 10,
      documents: 100,
      aiChecks: 200,
      listings: 50,
      storageGB: 5,
    },
  },
  professional: {
    name: 'Professional',
    price: 14900,
    stripePriceId: process.env.STRIPE_PRICE_PROFESSIONAL || 'price_professional',
    limits: {
      members: 25,
      documents: 500,
      aiChecks: 1000,
      listings: 200,
      storageGB: 25,
    },
  },
  enterprise: {
    name: 'Enterprise',
    price: -1,
    limits: {
      members: -1,
      documents: -1,
      aiChecks: -1,
      listings: -1,
      storageGB: -1,
    },
  },
};

/**
 * Helper to look up a plan definition by tier key.
 */
export function getPlan(tier: string): PlanDefinition | undefined {
  return PLANS[tier];
}

/**
 * Check whether a limit value means "unlimited".
 */
export function isUnlimited(value: number): boolean {
  return value === -1;
}

/**
 * Check whether a given usage amount is within the plan limit.
 */
export function isWithinLimit(current: number, limit: number): boolean {
  if (isUnlimited(limit)) return true;
  return current < limit;
}
