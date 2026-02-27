-- ============================================================
-- RealtorAI Compliance Assistant – Initial Schema
-- Multi-tenant, soft-delete, AI-governed, partitioned
-- ============================================================

-- Extensions
create extension if not exists "pgcrypto";
create extension if not exists "pg_trgm";    -- trigram index support for text search

-- ────────────────────────────────────────────
-- Helper functions (SECURITY DEFINER)
-- Note: get_user_org_ids and get_user_role are defined after
-- the memberships table since they depend on it.
-- ────────────────────────────────────────────

-- Auto-update updated_at trigger function
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ============================================================
-- CORE TABLES
-- ============================================================

-- ────────────────────────────────────────────
-- organizations
-- ────────────────────────────────────────────
create table public.organizations (
  id            uuid primary key default gen_random_uuid(),
  name          text not null,
  slug          text not null unique,
  logo_url      text,
  settings      jsonb not null default '{}',
  ai_enabled    boolean not null default true,
  plan_tier     text not null default 'free'
                  check (plan_tier in ('free','starter','professional','enterprise')),
  stripe_customer_id     text,
  stripe_subscription_id text,
  subscription_status    text not null default 'active'
                  check (subscription_status in ('active','past_due','canceled','trialing','incomplete')),
  trial_ends_at timestamptz,
  deleted_at    timestamptz,          -- soft delete
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create index idx_organizations_slug on public.organizations (slug) where deleted_at is null;
create index idx_organizations_stripe on public.organizations (stripe_customer_id) where stripe_customer_id is not null;

create trigger trg_organizations_updated_at
  before update on public.organizations
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- profiles (extends auth.users)
-- ────────────────────────────────────────────
create table public.profiles (
  id              uuid primary key references auth.users on delete cascade,
  email           text not null,
  full_name       text,
  avatar_url      text,
  phone           text,
  license_number  text,
  deleted_at      timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

create trigger trg_profiles_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

-- Auto-create profile on auth signup
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = ''
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'full_name', '')
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- ────────────────────────────────────────────
-- memberships (user ↔ organization join)
-- ────────────────────────────────────────────
create table public.memberships (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references public.profiles(id) on delete cascade,
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  role             text not null default 'agent'
                     check (role in ('owner','admin','agent')),
  invited_email    text,
  invited_by       uuid references public.profiles(id),
  accepted_at      timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (user_id, organization_id)
);

create index idx_memberships_org on public.memberships (organization_id) where deleted_at is null;
create index idx_memberships_user on public.memberships (user_id) where deleted_at is null;

create trigger trg_memberships_updated_at
  before update on public.memberships
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- Helper functions that depend on memberships
-- ────────────────────────────────────────────

-- Returns org IDs where the calling user has an active membership
create or replace function public.get_user_org_ids()
returns uuid[] language sql stable security definer set search_path = ''
as $$
  select coalesce(
    array_agg(m.organization_id),
    '{}'::uuid[]
  )
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.deleted_at is null;
$$;

-- Returns the role the calling user holds in a given org
create or replace function public.get_user_role(org_id uuid)
returns text language sql stable security definer set search_path = ''
as $$
  select m.role
  from public.memberships m
  where m.user_id = (select auth.uid())
    and m.organization_id = org_id
    and m.deleted_at is null
  limit 1;
$$;

-- ────────────────────────────────────────────
-- clients (real-estate clients / contacts)
-- ────────────────────────────────────────────
create table public.clients (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  agent_id         uuid references public.profiles(id),
  first_name       text not null,
  last_name        text not null,
  email            text,
  phone            text,
  client_type      text not null default 'buyer'
                     check (client_type in ('buyer','seller','both')),
  notes            text,
  metadata         jsonb not null default '{}',
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_clients_org on public.clients (organization_id) where deleted_at is null;
create index idx_clients_agent on public.clients (agent_id) where deleted_at is null;
create index idx_clients_name on public.clients using gin ((first_name || ' ' || last_name) gin_trgm_ops);

create trigger trg_clients_updated_at
  before update on public.clients
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- documents
-- ────────────────────────────────────────────
create table public.documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  listing_id       uuid,       -- FK added after listings table
  uploaded_by      uuid not null references public.profiles(id),
  name             text not null,
  file_path        text not null,
  file_type        text not null,
  file_size        integer not null default 0,
  status           text not null default 'pending'
                     check (status in ('pending','reviewing','reviewed','flagged','approved')),
  extracted_text   text,
  review_score     integer,
  review_findings  jsonb,
  reviewed_at      timestamptz,
  metadata         jsonb not null default '{}',
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_documents_org on public.documents (organization_id) where deleted_at is null;
create index idx_documents_status on public.documents (organization_id, status) where deleted_at is null;
create index idx_documents_uploaded_by on public.documents (uploaded_by);

create trigger trg_documents_updated_at
  before update on public.documents
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- listings
-- ────────────────────────────────────────────
create table public.listings (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  agent_id         uuid not null references public.profiles(id),
  mls_number       text,
  address          text not null,
  city             text not null,
  state            text not null check (length(state) = 2),
  zip_code         text not null,
  price            numeric(12,2),
  bedrooms         integer,
  bathrooms        numeric(3,1),
  square_feet      integer,
  description      text,
  property_type    text,
  listing_status   text not null default 'draft'
                     check (listing_status in ('draft','active','pending','sold','withdrawn','expired')),
  compliance_score integer,
  last_compliance_check timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

-- Add deferred FK from documents → listings
alter table public.documents
  add constraint fk_documents_listing
  foreign key (listing_id) references public.listings(id) on delete set null;

create index idx_listings_org on public.listings (organization_id) where deleted_at is null;
create index idx_listings_agent on public.listings (agent_id) where deleted_at is null;
create index idx_listings_state on public.listings (state) where deleted_at is null;
create index idx_listings_status on public.listings (organization_id, listing_status) where deleted_at is null;
create index idx_listings_mls on public.listings (mls_number) where mls_number is not null and deleted_at is null;

create trigger trg_listings_updated_at
  before update on public.listings
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- compliance_checks
-- ────────────────────────────────────────────
create table public.compliance_checks (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  check_type       text not null
                     check (check_type in ('fair_housing','listing_compliance','document_review','disclosure_completeness')),
  status           text not null default 'pending'
                     check (status in ('pending','running','completed','failed')),
  score            integer,
  findings         jsonb not null default '[]',
  summary          text,
  input_text       text,
  ai_used          boolean not null default false,
  model_used       text,
  tokens_used      integer,
  document_id      uuid references public.documents(id) on delete set null,
  listing_id       uuid references public.listings(id) on delete set null,
  initiated_by     uuid references public.profiles(id),
  completed_at     timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_compliance_checks_org on public.compliance_checks (organization_id);
create index idx_compliance_checks_type on public.compliance_checks (organization_id, check_type);
create index idx_compliance_checks_status on public.compliance_checks (status) where status in ('pending','running');
create index idx_compliance_checks_listing on public.compliance_checks (listing_id) where listing_id is not null;
create index idx_compliance_checks_document on public.compliance_checks (document_id) where document_id is not null;

create trigger trg_compliance_checks_updated_at
  before update on public.compliance_checks
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- disclosures
-- ────────────────────────────────────────────
create table public.disclosures (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  listing_id       uuid not null references public.listings(id) on delete cascade,
  disclosure_type  text not null
                     check (disclosure_type in ('seller_disclosure','lead_paint','property_condition','natural_hazard','hoa','title','flood_zone')),
  title            text not null,
  description      text,
  status           text not null default 'required'
                     check (status in ('required','in_progress','submitted','reviewed','accepted','rejected')),
  due_date         date,
  completed_at     timestamptz,
  document_id      uuid references public.documents(id) on delete set null,
  assigned_to      uuid references public.profiles(id),
  notes            text,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_disclosures_org on public.disclosures (organization_id) where deleted_at is null;
create index idx_disclosures_listing on public.disclosures (listing_id) where deleted_at is null;
create index idx_disclosures_status on public.disclosures (organization_id, status) where deleted_at is null;
create index idx_disclosures_due on public.disclosures (due_date) where status in ('required','in_progress') and deleted_at is null;

create trigger trg_disclosures_updated_at
  before update on public.disclosures
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- signatures (e-signature tracking)
-- ────────────────────────────────────────────
create table public.signatures (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  document_id      uuid not null references public.documents(id) on delete cascade,
  signer_id        uuid references public.profiles(id),
  client_id        uuid references public.clients(id) on delete set null,
  signer_email     text not null,
  signer_name      text not null,
  status           text not null default 'pending'
                     check (status in ('pending','sent','viewed','signed','declined','expired')),
  signed_at        timestamptz,
  ip_address       text,
  signature_data   jsonb,        -- e.g. hash, coordinates
  expires_at       timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_signatures_org on public.signatures (organization_id) where deleted_at is null;
create index idx_signatures_document on public.signatures (document_id) where deleted_at is null;
create index idx_signatures_status on public.signatures (status) where status in ('pending','sent','viewed');

create trigger trg_signatures_updated_at
  before update on public.signatures
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- reminders
-- ────────────────────────────────────────────
create table public.reminders (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  user_id          uuid not null references public.profiles(id) on delete cascade,
  resource_type    text not null check (resource_type in ('disclosure','document','listing','signature','compliance_check')),
  resource_id      uuid not null,
  title            text not null,
  message          text,
  remind_at        timestamptz not null,
  channel          text not null default 'in_app'
                     check (channel in ('in_app','email','both')),
  is_sent          boolean not null default false,
  sent_at          timestamptz,
  deleted_at       timestamptz,
  created_at       timestamptz not null default now()
);

create index idx_reminders_pending on public.reminders (remind_at)
  where is_sent = false and deleted_at is null;
create index idx_reminders_user on public.reminders (user_id, organization_id)
  where deleted_at is null;

-- ────────────────────────────────────────────
-- subscriptions (Stripe billing detail)
-- ────────────────────────────────────────────
create table public.subscriptions (
  id                     uuid primary key default gen_random_uuid(),
  organization_id        uuid not null references public.organizations(id) on delete cascade,
  stripe_subscription_id text unique,
  stripe_customer_id     text,
  plan_tier              text not null default 'free'
                           check (plan_tier in ('free','starter','professional','enterprise')),
  status                 text not null default 'active'
                           check (status in ('active','past_due','canceled','trialing','incomplete','paused')),
  current_period_start   timestamptz,
  current_period_end     timestamptz,
  cancel_at              timestamptz,
  canceled_at            timestamptz,
  trial_start            timestamptz,
  trial_end              timestamptz,
  metadata               jsonb not null default '{}',
  created_at             timestamptz not null default now(),
  updated_at             timestamptz not null default now()
);

create unique index idx_subscriptions_org on public.subscriptions (organization_id);
create index idx_subscriptions_stripe on public.subscriptions (stripe_subscription_id) where stripe_subscription_id is not null;
create index idx_subscriptions_status on public.subscriptions (status) where status != 'canceled';

create trigger trg_subscriptions_updated_at
  before update on public.subscriptions
  for each row execute function public.set_updated_at();


-- ============================================================
-- AI GOVERNANCE TABLES
-- ============================================================

-- ────────────────────────────────────────────
-- ai_usage – monthly partitioned
-- Tracks every AI call for billing & audit
-- ────────────────────────────────────────────
create table public.ai_usage (
  id               uuid not null default gen_random_uuid(),
  organization_id  uuid not null,   -- no FK on partitioned table; enforced in app
  user_id          uuid,
  operation        text not null,    -- e.g. 'fair_housing_check', 'document_review'
  model            text not null,
  provider         text not null default 'anthropic',
  input_tokens     integer not null default 0,
  output_tokens    integer not null default 0,
  total_tokens     integer not null default 0,
  cost_cents       numeric(10,4) not null default 0,  -- cost in USD cents
  latency_ms       integer,
  status           text not null default 'success'
                     check (status in ('success','error','timeout','fallback')),
  error_message    text,
  request_metadata jsonb not null default '{}',
  created_at       timestamptz not null default now(),

  primary key (id, created_at)      -- required for partitioning
) partition by range (created_at);

-- Create monthly partitions for current year + 1 quarter ahead
-- (In production a cron job or pg_partman handles creation)
create table public.ai_usage_2026_01 partition of public.ai_usage
  for values from ('2026-01-01') to ('2026-02-01');
create table public.ai_usage_2026_02 partition of public.ai_usage
  for values from ('2026-02-01') to ('2026-03-01');
create table public.ai_usage_2026_03 partition of public.ai_usage
  for values from ('2026-03-01') to ('2026-04-01');
create table public.ai_usage_2026_04 partition of public.ai_usage
  for values from ('2026-04-01') to ('2026-05-01');
create table public.ai_usage_2026_05 partition of public.ai_usage
  for values from ('2026-05-01') to ('2026-06-01');
create table public.ai_usage_2026_06 partition of public.ai_usage
  for values from ('2026-06-01') to ('2026-07-01');

-- Aggregation-friendly indexes (each partition inherits these)
create index idx_ai_usage_org_month on public.ai_usage (organization_id, created_at);
create index idx_ai_usage_user on public.ai_usage (user_id, created_at) where user_id is not null;
create index idx_ai_usage_operation on public.ai_usage (operation, created_at);
create index idx_ai_usage_status on public.ai_usage (status) where status != 'success';

-- ────────────────────────────────────────────
-- organization_ai_quota
-- Per-org quotas reset each billing period
-- ────────────────────────────────────────────
create table public.organization_ai_quota (
  id                    uuid primary key default gen_random_uuid(),
  organization_id       uuid not null references public.organizations(id) on delete cascade unique,
  period_start          date not null,
  period_end            date not null,
  max_ai_checks         integer not null default 100,
  used_ai_checks        integer not null default 0,
  max_tokens            integer not null default 500000,
  used_tokens           integer not null default 0,
  max_documents         integer not null default 50,
  used_documents        integer not null default 0,
  max_storage_bytes     bigint not null default 1073741824,  -- 1 GB
  used_storage_bytes    bigint not null default 0,
  created_at            timestamptz not null default now(),
  updated_at            timestamptz not null default now()
);

create trigger trg_org_ai_quota_updated_at
  before update on public.organization_ai_quota
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- ai_cost_limits
-- Hard / soft spending limits per org
-- ────────────────────────────────────────────
create table public.ai_cost_limits (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade unique,
  monthly_soft_limit_cents  integer not null default 5000,   -- $50.00
  monthly_hard_limit_cents  integer not null default 10000,  -- $100.00
  daily_hard_limit_cents    integer not null default 1000,   -- $10.00
  alert_threshold_pct       integer not null default 80,     -- alert at 80% of soft limit
  alert_email               text,
  is_hard_limited           boolean not null default false,   -- true = block when limit hit
  last_alert_sent_at        timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now()
);

create trigger trg_ai_cost_limits_updated_at
  before update on public.ai_cost_limits
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- ai_cache
-- Semantic/hash cache to avoid redundant AI calls
-- ────────────────────────────────────────────
create table public.ai_cache (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid not null references public.organizations(id) on delete cascade,
  cache_key        text not null,          -- sha256 of (operation + normalized input)
  operation        text not null,
  input_hash       text not null,
  response         jsonb not null,
  model            text not null,
  tokens_saved     integer not null default 0,
  hit_count        integer not null default 0,
  expires_at       timestamptz not null,
  created_at       timestamptz not null default now(),

  unique (organization_id, cache_key)
);

create index idx_ai_cache_lookup on public.ai_cache (organization_id, cache_key);
create index idx_ai_cache_expiry on public.ai_cache (expires_at);


-- ============================================================
-- ACCURACY GOVERNANCE TABLES
-- ============================================================

-- ────────────────────────────────────────────
-- detection_results
-- Stores individual AI detection outputs for review
-- ────────────────────────────────────────────
create table public.detection_results (
  id                uuid primary key default gen_random_uuid(),
  organization_id   uuid not null references public.organizations(id) on delete cascade,
  compliance_check_id uuid references public.compliance_checks(id) on delete set null,
  detection_type    text not null,       -- 'fair_housing_violation', 'missing_disclosure', etc.
  input_text        text,
  detected_items    jsonb not null default '[]',
  confidence_score  numeric(5,4),        -- 0.0000–1.0000
  model             text,
  is_correct        boolean,             -- null = unreviewed, true/false = human verdict
  reviewed_by       uuid references public.profiles(id),
  reviewed_at       timestamptz,
  feedback_notes    text,
  created_at        timestamptz not null default now()
);

create index idx_detection_results_org on public.detection_results (organization_id);
create index idx_detection_results_type on public.detection_results (detection_type, created_at);
create index idx_detection_results_unreviewed on public.detection_results (organization_id)
  where is_correct is null;
create index idx_detection_results_check on public.detection_results (compliance_check_id)
  where compliance_check_id is not null;

-- ────────────────────────────────────────────
-- detection_errors
-- Logs false positives / false negatives for analysis
-- ────────────────────────────────────────────
create table public.detection_errors (
  id                  uuid primary key default gen_random_uuid(),
  organization_id     uuid not null references public.organizations(id) on delete cascade,
  detection_result_id uuid not null references public.detection_results(id) on delete cascade,
  error_type          text not null check (error_type in ('false_positive','false_negative','misclassification')),
  expected_output     jsonb,
  actual_output       jsonb,
  severity            text not null default 'medium'
                        check (severity in ('low','medium','high','critical')),
  root_cause          text,
  resolved            boolean not null default false,
  resolved_at         timestamptz,
  resolved_by         uuid references public.profiles(id),
  created_at          timestamptz not null default now()
);

create index idx_detection_errors_org on public.detection_errors (organization_id);
create index idx_detection_errors_type on public.detection_errors (error_type) where not resolved;
create index idx_detection_errors_severity on public.detection_errors (severity) where not resolved;

-- ────────────────────────────────────────────
-- ground_truth_documents
-- Labeled data for accuracy measurement
-- ────────────────────────────────────────────
create table public.ground_truth_documents (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete set null,
  document_type    text not null,          -- 'listing_description', 'lease_agreement', etc.
  input_text       text not null,
  expected_findings jsonb not null,         -- labeled correct output
  tags             text[] not null default '{}',
  source           text not null default 'manual'
                     check (source in ('manual','production_review','synthetic')),
  is_active        boolean not null default true,
  created_by       uuid references public.profiles(id),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);

create index idx_ground_truth_type on public.ground_truth_documents (document_type) where is_active;
create index idx_ground_truth_tags on public.ground_truth_documents using gin (tags);

create trigger trg_ground_truth_updated_at
  before update on public.ground_truth_documents
  for each row execute function public.set_updated_at();

-- ────────────────────────────────────────────
-- regression_runs
-- Tracks automated accuracy regression tests
-- ────────────────────────────────────────────
create table public.regression_runs (
  id               uuid primary key default gen_random_uuid(),
  run_type         text not null,                -- 'fair_housing', 'document_review', etc.
  model            text not null,
  total_cases      integer not null default 0,
  passed           integer not null default 0,
  failed           integer not null default 0,
  precision_score  numeric(5,4),
  recall_score     numeric(5,4),
  f1_score         numeric(5,4),
  results_detail   jsonb not null default '[]',  -- per-case pass/fail
  triggered_by     text not null default 'manual'
                     check (triggered_by in ('manual','ci','scheduled','deploy')),
  started_at       timestamptz not null default now(),
  completed_at     timestamptz,
  status           text not null default 'running'
                     check (status in ('running','completed','failed','canceled')),
  notes            text,
  created_at       timestamptz not null default now()
);

create index idx_regression_runs_type on public.regression_runs (run_type, created_at desc);
create index idx_regression_runs_status on public.regression_runs (status) where status = 'running';


-- ============================================================
-- SECURITY TABLES
-- ============================================================

-- ────────────────────────────────────────────
-- audit_logs
-- ────────────────────────────────────────────
create table public.audit_logs (
  id               uuid primary key default gen_random_uuid(),
  organization_id  uuid references public.organizations(id) on delete set null,
  user_id          uuid references public.profiles(id) on delete set null,
  action           text not null,
  resource_type    text not null,
  resource_id      uuid,
  metadata         jsonb not null default '{}',
  ip_address       text,
  user_agent       text,
  created_at       timestamptz not null default now()
);

create index idx_audit_logs_org on public.audit_logs (organization_id, created_at desc);
create index idx_audit_logs_user on public.audit_logs (user_id, created_at desc) where user_id is not null;
create index idx_audit_logs_action on public.audit_logs (action, created_at desc);
create index idx_audit_logs_resource on public.audit_logs (resource_type, resource_id) where resource_id is not null;

-- ────────────────────────────────────────────
-- rate_limits
-- Persistent rate-limit state (supplement to Redis)
-- ────────────────────────────────────────────
create table public.rate_limits (
  id               uuid primary key default gen_random_uuid(),
  key              text not null,         -- e.g. 'api:user:<id>', 'ai:org:<id>'
  tokens           integer not null default 0,
  max_tokens       integer not null,
  window_start     timestamptz not null default now(),
  window_seconds   integer not null,
  blocked_until    timestamptz,
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),

  unique (key)
);

create index idx_rate_limits_blocked on public.rate_limits (blocked_until)
  where blocked_until is not null;
create index idx_rate_limits_window on public.rate_limits (window_start);

create trigger trg_rate_limits_updated_at
  before update on public.rate_limits
  for each row execute function public.set_updated_at();


-- ============================================================
-- STORAGE BUCKETS
-- ============================================================
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents',
  'documents',
  false,
  10485760,  -- 10 MB
  array['application/pdf','application/msword','application/vnd.openxmlformats-officedocument.wordprocessingml.document','text/plain']
) on conflict (id) do nothing;


-- ============================================================
-- ROW LEVEL SECURITY
-- ============================================================

-- Enable RLS on all tables
alter table public.organizations enable row level security;
alter table public.profiles enable row level security;
alter table public.memberships enable row level security;
alter table public.clients enable row level security;
alter table public.documents enable row level security;
alter table public.listings enable row level security;
alter table public.compliance_checks enable row level security;
alter table public.disclosures enable row level security;
alter table public.signatures enable row level security;
alter table public.reminders enable row level security;
alter table public.subscriptions enable row level security;
alter table public.ai_usage enable row level security;
alter table public.organization_ai_quota enable row level security;
alter table public.ai_cost_limits enable row level security;
alter table public.ai_cache enable row level security;
alter table public.detection_results enable row level security;
alter table public.detection_errors enable row level security;
alter table public.ground_truth_documents enable row level security;
alter table public.audit_logs enable row level security;
alter table public.rate_limits enable row level security;

-- ──── organizations ────
create policy "org_select" on public.organizations for select using (
  id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "org_update" on public.organizations for update using (
  public.get_user_role(id) in ('owner','admin')
);

-- ──── profiles ────
create policy "profile_select" on public.profiles for select using (
  id = (select auth.uid())
  or id in (
    select m.user_id from public.memberships m
    where m.organization_id = any (public.get_user_org_ids())
      and m.deleted_at is null
  )
);
create policy "profile_update" on public.profiles for update using (
  id = (select auth.uid())
);

-- ──── memberships ────
create policy "membership_select" on public.memberships for select using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "membership_insert" on public.memberships for insert with check (
  public.get_user_role(organization_id) in ('owner','admin')
);
create policy "membership_delete" on public.memberships for delete using (
  public.get_user_role(organization_id) in ('owner','admin')
);
create policy "membership_update" on public.memberships for update using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── clients ────
create policy "clients_select" on public.clients for select using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "clients_insert" on public.clients for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "clients_update" on public.clients for update using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "clients_delete" on public.clients for delete using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── documents ────
create policy "documents_select" on public.documents for select using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "documents_insert" on public.documents for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "documents_update" on public.documents for update using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "documents_delete" on public.documents for delete using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── listings ────
create policy "listings_select" on public.listings for select using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "listings_insert" on public.listings for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "listings_update" on public.listings for update using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "listings_delete" on public.listings for delete using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── compliance_checks ────
create policy "checks_select" on public.compliance_checks for select using (
  organization_id = any (public.get_user_org_ids())
);
create policy "checks_insert" on public.compliance_checks for insert with check (
  organization_id = any (public.get_user_org_ids())
);

-- ──── disclosures ────
create policy "disclosures_select" on public.disclosures for select using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "disclosures_insert" on public.disclosures for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "disclosures_update" on public.disclosures for update using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "disclosures_delete" on public.disclosures for delete using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── signatures ────
create policy "signatures_select" on public.signatures for select using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);
create policy "signatures_insert" on public.signatures for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "signatures_update" on public.signatures for update using (
  organization_id = any (public.get_user_org_ids()) and deleted_at is null
);

-- ──── reminders ────
create policy "reminders_select" on public.reminders for select using (
  user_id = (select auth.uid()) and deleted_at is null
);
create policy "reminders_insert" on public.reminders for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "reminders_update" on public.reminders for update using (
  user_id = (select auth.uid()) and deleted_at is null
);
create policy "reminders_delete" on public.reminders for delete using (
  user_id = (select auth.uid())
);

-- ──── subscriptions ────
create policy "subscriptions_select" on public.subscriptions for select using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── ai_usage ────
create policy "ai_usage_select" on public.ai_usage for select using (
  organization_id = any (public.get_user_org_ids())
);
create policy "ai_usage_insert" on public.ai_usage for insert with check (
  organization_id = any (public.get_user_org_ids())
);

-- ──── organization_ai_quota ────
create policy "ai_quota_select" on public.organization_ai_quota for select using (
  organization_id = any (public.get_user_org_ids())
);
create policy "ai_quota_update" on public.organization_ai_quota for update using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── ai_cost_limits ────
create policy "ai_cost_select" on public.ai_cost_limits for select using (
  public.get_user_role(organization_id) in ('owner','admin')
);
create policy "ai_cost_update" on public.ai_cost_limits for update using (
  public.get_user_role(organization_id) = 'owner'
);

-- ──── ai_cache ────
create policy "ai_cache_select" on public.ai_cache for select using (
  organization_id = any (public.get_user_org_ids())
);
create policy "ai_cache_insert" on public.ai_cache for insert with check (
  organization_id = any (public.get_user_org_ids())
);

-- ──── detection_results ────
create policy "detection_results_select" on public.detection_results for select using (
  organization_id = any (public.get_user_org_ids())
);
create policy "detection_results_insert" on public.detection_results for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "detection_results_update" on public.detection_results for update using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── detection_errors ────
create policy "detection_errors_select" on public.detection_errors for select using (
  organization_id = any (public.get_user_org_ids())
);
create policy "detection_errors_insert" on public.detection_errors for insert with check (
  organization_id = any (public.get_user_org_ids())
);
create policy "detection_errors_update" on public.detection_errors for update using (
  public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── ground_truth_documents ────
-- Global ground truth is readable by all authenticated users; org-scoped only by members
create policy "ground_truth_select" on public.ground_truth_documents for select using (
  organization_id is null or organization_id = any (public.get_user_org_ids())
);
create policy "ground_truth_insert" on public.ground_truth_documents for insert with check (
  organization_id is null or public.get_user_role(organization_id) in ('owner','admin')
);

-- ──── audit_logs ────
create policy "audit_logs_select" on public.audit_logs for select using (
  public.get_user_role(organization_id) in ('owner','admin')
);
-- Insert allowed for all org members (services log on behalf of users)
create policy "audit_logs_insert" on public.audit_logs for insert with check (
  organization_id = any (public.get_user_org_ids())
);

-- ──── rate_limits ────
-- Only service role should access this table; no user-facing policies
-- (Admin client bypasses RLS)

-- Storage policies for documents bucket
create policy "documents_bucket_select" on storage.objects for select using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1]::uuid = any (public.get_user_org_ids())
);
create policy "documents_bucket_insert" on storage.objects for insert with check (
  bucket_id = 'documents'
  and (storage.foldername(name))[1]::uuid = any (public.get_user_org_ids())
);
create policy "documents_bucket_delete" on storage.objects for delete using (
  bucket_id = 'documents'
  and (storage.foldername(name))[1]::uuid = any (public.get_user_org_ids())
);
