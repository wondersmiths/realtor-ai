-- Add credit-based AI usage columns to organization_ai_quota
ALTER TABLE organization_ai_quota
  ADD COLUMN IF NOT EXISTS max_credits  integer NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS used_credits integer NOT NULL DEFAULT 0;
