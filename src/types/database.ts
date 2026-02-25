import type {
  UserRole,
  DocumentStatus,
  ComplianceCheckType,
  ComplianceCheckStatus,
  DisclosureType,
  DisclosureStatus,
  PlanTier,
  AuditAction,
  ClientType,
  SignatureStatus,
  ReminderChannel,
  SubscriptionStatus,
  AIUsageStatus,
  DetectionErrorType,
  Severity,
  GroundTruthSource,
  RegressionRunStatus,
  RegressionTrigger,
  ResourceType,
} from './enums';

// ============================================================
// CORE TABLES
// ============================================================

export interface Organization {
  id: string;
  name: string;
  slug: string;
  logo_url: string | null;
  settings: Record<string, unknown>;
  ai_enabled: boolean;
  plan_tier: PlanTier;
  stripe_customer_id: string | null;
  stripe_subscription_id: string | null;
  subscription_status: string;
  trial_ends_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Profile {
  id: string;
  email: string;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  license_number: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Membership {
  id: string;
  user_id: string;
  organization_id: string;
  role: UserRole;
  invited_email: string | null;
  invited_by: string | null;
  accepted_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Client {
  id: string;
  organization_id: string;
  agent_id: string | null;
  first_name: string;
  last_name: string;
  email: string | null;
  phone: string | null;
  client_type: ClientType;
  notes: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Document {
  id: string;
  organization_id: string;
  listing_id: string | null;
  uploaded_by: string;
  name: string;
  file_path: string;
  file_type: string;
  file_size: number;
  file_hash: string | null;
  status: DocumentStatus;
  extracted_text: string | null;
  review_score: number | null;
  review_findings: ComplianceCheckFindingJSON[] | null;
  reviewed_at: string | null;
  metadata: Record<string, unknown>;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Listing {
  id: string;
  organization_id: string;
  agent_id: string;
  mls_number: string | null;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  price: number | null;
  bedrooms: number | null;
  bathrooms: number | null;
  square_feet: number | null;
  description: string | null;
  property_type: string | null;
  listing_status: string;
  compliance_score: number | null;
  last_compliance_check: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface ComplianceCheckFindingJSON {
  type: string;
  severity: 'info' | 'warning' | 'error' | 'critical';
  message: string;
  location?: string;
  suggestion?: string;
  rule_id?: string;
}

export interface ComplianceCheck {
  id: string;
  organization_id: string;
  check_type: ComplianceCheckType;
  status: ComplianceCheckStatus;
  score: number | null;
  findings: ComplianceCheckFindingJSON[];
  summary: string | null;
  input_text: string | null;
  ai_used: boolean;
  model_used: string | null;
  tokens_used: number | null;
  document_id: string | null;
  listing_id: string | null;
  initiated_by: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Disclosure {
  id: string;
  organization_id: string;
  listing_id: string;
  disclosure_type: DisclosureType;
  title: string;
  description: string | null;
  status: DisclosureStatus;
  due_date: string | null;
  completed_at: string | null;
  document_id: string | null;
  assigned_to: string | null;
  notes: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Signature {
  id: string;
  organization_id: string;
  document_id: string;
  signer_id: string | null;
  client_id: string | null;
  signer_email: string;
  signer_name: string;
  status: SignatureStatus;
  signed_at: string | null;
  ip_address: string | null;
  signature_data: Record<string, unknown> | null;
  expires_at: string | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Reminder {
  id: string;
  organization_id: string;
  user_id: string;
  resource_type: ResourceType;
  resource_id: string;
  title: string;
  message: string | null;
  remind_at: string;
  channel: ReminderChannel;
  is_sent: boolean;
  sent_at: string | null;
  deleted_at: string | null;
  created_at: string;
}

export interface Subscription {
  id: string;
  organization_id: string;
  stripe_subscription_id: string | null;
  stripe_customer_id: string | null;
  plan_tier: PlanTier;
  status: SubscriptionStatus;
  current_period_start: string | null;
  current_period_end: string | null;
  cancel_at: string | null;
  canceled_at: string | null;
  trial_start: string | null;
  trial_end: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ============================================================
// AI GOVERNANCE
// ============================================================

export interface AIUsage {
  id: string;
  organization_id: string;
  user_id: string | null;
  operation: string;
  model: string;
  provider: string;
  input_tokens: number;
  output_tokens: number;
  total_tokens: number;
  cost_cents: number;
  latency_ms: number | null;
  status: AIUsageStatus;
  error_message: string | null;
  request_metadata: Record<string, unknown>;
  created_at: string;
}

export interface OrganizationAIQuota {
  id: string;
  organization_id: string;
  period_start: string;
  period_end: string;
  max_ai_checks: number;
  used_ai_checks: number;
  max_tokens: number;
  used_tokens: number;
  max_documents: number;
  used_documents: number;
  max_storage_bytes: number;
  used_storage_bytes: number;
  max_credits: number;
  used_credits: number;
  created_at: string;
  updated_at: string;
}

export interface AICostLimit {
  id: string;
  organization_id: string;
  monthly_soft_limit_cents: number;
  monthly_hard_limit_cents: number;
  daily_hard_limit_cents: number;
  alert_threshold_pct: number;
  alert_email: string | null;
  is_hard_limited: boolean;
  last_alert_sent_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface AICache {
  id: string;
  organization_id: string;
  cache_key: string;
  operation: string;
  input_hash: string;
  response: Record<string, unknown>;
  model: string;
  tokens_saved: number;
  hit_count: number;
  expires_at: string;
  created_at: string;
}

// ============================================================
// ACCURACY GOVERNANCE
// ============================================================

export interface DetectionResult {
  id: string;
  organization_id: string;
  compliance_check_id: string | null;
  detection_type: string;
  input_text: string | null;
  detected_items: Record<string, unknown>[];
  confidence_score: number | null;
  model: string | null;
  is_correct: boolean | null;
  reviewed_by: string | null;
  reviewed_at: string | null;
  feedback_notes: string | null;
  created_at: string;
}

export interface DetectionError {
  id: string;
  organization_id: string;
  detection_result_id: string;
  error_type: DetectionErrorType;
  expected_output: Record<string, unknown> | null;
  actual_output: Record<string, unknown> | null;
  severity: Severity;
  root_cause: string | null;
  resolved: boolean;
  resolved_at: string | null;
  resolved_by: string | null;
  created_at: string;
}

export interface GroundTruthDocument {
  id: string;
  organization_id: string | null;
  document_type: string;
  input_text: string;
  expected_findings: Record<string, unknown>;
  tags: string[];
  source: GroundTruthSource;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

export interface RegressionRun {
  id: string;
  run_type: string;
  model: string;
  total_cases: number;
  passed: number;
  failed: number;
  precision_score: number | null;
  recall_score: number | null;
  f1_score: number | null;
  results_detail: Record<string, unknown>[];
  triggered_by: RegressionTrigger;
  started_at: string;
  completed_at: string | null;
  status: RegressionRunStatus;
  notes: string | null;
  created_at: string;
}

// ============================================================
// SECURITY
// ============================================================

export interface AuditLog {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  action: AuditAction;
  resource_type: string;
  resource_id: string | null;
  metadata: Record<string, unknown>;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export interface RateLimit {
  id: string;
  key: string;
  tokens: number;
  max_tokens: number;
  window_start: string;
  window_seconds: number;
  blocked_until: string | null;
  created_at: string;
  updated_at: string;
}
