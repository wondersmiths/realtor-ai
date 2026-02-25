import { z } from 'zod';

const envSchema = z.object({
  NEXT_PUBLIC_SUPABASE_URL: z.string().url(),
  NEXT_PUBLIC_SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1).optional(),
  NEXT_PUBLIC_APP_URL: z.string().url().default('http://localhost:3000'),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY: z.string().min(1).optional(),
  UPSTASH_REDIS_REST_URL: z.string().url().optional(),
  UPSTASH_REDIS_REST_TOKEN: z.string().min(1).optional(),
  REDIS_URL: z.string().optional().default('redis://localhost:6379'),
  ANTHROPIC_API_KEY: z.string().min(1).optional(),
  AI_ENABLED: z.string().default('true').transform(v => v === 'true'),
  AI_MODEL_FAST: z.string().min(1).optional(),
  AI_MODEL_STANDARD: z.string().min(1).optional(),
  AI_MODEL_PREMIUM: z.string().min(1).optional(),
  AI_MODEL_FALLBACK: z.string().min(1).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  FROM_EMAIL: z.string().email().default('noreply@realtorai.com'),
});

export type EnvConfig = z.infer<typeof envSchema>;

function getConfig(): EnvConfig {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.flatten().fieldErrors);
    // Don't throw at build time - allow defaults
    return envSchema.parse({
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321',
      NEXT_PUBLIC_SUPABASE_ANON_KEY: process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder',
      NEXT_PUBLIC_APP_URL: process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000',
    });
  }
  return parsed.data;
}

export const config = getConfig();
