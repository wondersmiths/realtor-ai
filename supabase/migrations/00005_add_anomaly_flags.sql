-- Anomaly Flags: track abnormal organization behavior
create table public.anomaly_flags (
  id              uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  anomaly_type    text not null check (anomaly_type in ('excessive_large_uploads','repeated_duplicate_uploads','sudden_ai_spike')),
  severity        text not null default 'medium' check (severity in ('low','medium','high','critical')),
  status          text not null default 'open' check (status in ('open','dismissed','resolved')),
  title           text not null,
  description     text,
  metadata        jsonb not null default '{}',
  detected_at     timestamptz not null default now(),
  dismissed_at    timestamptz,
  dismissed_by    uuid references auth.users(id),
  resolved_at     timestamptz,
  resolved_by     uuid references auth.users(id),
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now()
);

-- Indexes for common queries
create index idx_anomaly_flags_org_status on public.anomaly_flags (organization_id, status) where status = 'open';
create index idx_anomaly_flags_org_type on public.anomaly_flags (organization_id, anomaly_type);
create index idx_anomaly_flags_detected_at on public.anomaly_flags (detected_at desc);

-- Auto-update timestamp trigger (reuses existing set_updated_at function)
create trigger trg_anomaly_flags_updated_at before update on public.anomaly_flags
  for each row execute function public.set_updated_at();

-- RLS
alter table public.anomaly_flags enable row level security;

create policy "Org members can read anomaly flags" on public.anomaly_flags for select
  using (organization_id = any(public.get_user_org_ids()));

create policy "Admins can update anomaly flags" on public.anomaly_flags for update
  using (public.get_user_role(organization_id) in ('admin', 'owner'));
