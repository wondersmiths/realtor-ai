-- Add 'missed_signature' to detection_errors error_type CHECK constraint
-- and add document_hash column for tracking which document triggered the error.

alter table public.detection_errors
  drop constraint if exists detection_errors_error_type_check;

alter table public.detection_errors
  add constraint detection_errors_error_type_check
  check (error_type in ('false_positive', 'false_negative', 'missed_signature', 'misclassification'));

alter table public.detection_errors
  add column if not exists document_hash text,
  add column if not exists detection_method text;

create index if not exists idx_detection_errors_document_hash
  on public.detection_errors (document_hash)
  where document_hash is not null;
