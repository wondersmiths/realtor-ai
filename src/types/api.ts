import type {
  DisclosureType,
  DisclosureStatus,
  ComplianceCheckType,
  ClientType,
  PlanTier,
} from './enums';

// ──────────────────────────────────────────────
// Generic Response Wrappers
// ──────────────────────────────────────────────
export interface ApiResponse<T> {
  data: T;
  message?: string;
}

export interface ApiErrorResponse {
  error: {
    message: string;
    code: string;
    statusCode: number;
    fieldErrors?: Record<string, string[]>;
  };
}

export interface PaginatedResponse<T> {
  data: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface PaginationParams {
  page?: number;
  pageSize?: number;
  sortBy?: string;
  sortOrder?: 'asc' | 'desc';
  search?: string;
}

// ──────────────────────────────────────────────
// Organization Requests
// ──────────────────────────────────────────────
export interface CreateOrganizationRequest {
  name: string;
  slug?: string;
}

export interface UpdateOrganizationRequest {
  name?: string;
  slug?: string;
  settings?: Record<string, unknown>;
  ai_enabled?: boolean;
}

// ──────────────────────────────────────────────
// Client Requests
// ──────────────────────────────────────────────
export interface CreateClientRequest {
  first_name: string;
  last_name: string;
  email?: string;
  phone?: string;
  client_type?: ClientType;
  notes?: string;
  agent_id?: string;
}

export interface UpdateClientRequest {
  first_name?: string;
  last_name?: string;
  email?: string;
  phone?: string;
  client_type?: ClientType;
  notes?: string;
  agent_id?: string;
}

// ──────────────────────────────────────────────
// Listing Requests
// ──────────────────────────────────────────────
export interface CreateListingRequest {
  mls_number?: string;
  address: string;
  city: string;
  state: string;
  zip_code: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  description?: string;
  property_type?: string;
  listing_status?: string;
}

export interface UpdateListingRequest {
  mls_number?: string;
  address?: string;
  city?: string;
  state?: string;
  zip_code?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  square_feet?: number;
  description?: string;
  property_type?: string;
  listing_status?: string;
}

// ──────────────────────────────────────────────
// Disclosure Requests
// ──────────────────────────────────────────────
export interface CreateDisclosureRequest {
  listing_id: string;
  disclosure_type: DisclosureType;
  title: string;
  description?: string;
  due_date?: string;
  notes?: string;
  document_id?: string;
  assigned_to?: string;
}

export interface UpdateDisclosureRequest {
  status?: DisclosureStatus;
  due_date?: string;
  notes?: string;
  document_id?: string;
  assigned_to?: string;
}

// ──────────────────────────────────────────────
// Compliance Check Requests
// ──────────────────────────────────────────────
export interface ComplianceCheckRequest {
  check_type: ComplianceCheckType;
  listing_id?: string;
  document_id?: string;
  input_text?: string;
}

export interface FairHousingValidateRequest {
  text: string;
  context?: 'listing_description' | 'advertisement' | 'communication';
}

// ──────────────────────────────────────────────
// Signature Requests
// ──────────────────────────────────────────────
export interface CreateSignatureRequest {
  document_id: string;
  signer_email: string;
  signer_name: string;
  client_id?: string;
  expires_at?: string;
}

// ──────────────────────────────────────────────
// Reminder Requests
// ──────────────────────────────────────────────
export interface CreateReminderRequest {
  resource_type: string;
  resource_id: string;
  title: string;
  message?: string;
  remind_at: string;
  channel?: 'in_app' | 'email' | 'both';
}

// ──────────────────────────────────────────────
// Billing / Stripe Requests
// ──────────────────────────────────────────────
export interface CheckoutRequest {
  plan: PlanTier;
  successUrl?: string;
  cancelUrl?: string;
}

export interface BillingUsageResponse {
  quota: {
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
    period_start: string;
    period_end: string;
  };
  cost: {
    current_month_cents: number;
    monthly_soft_limit_cents: number;
    monthly_hard_limit_cents: number;
    daily_spend_cents: number;
    daily_hard_limit_cents: number;
  };
  percentages: {
    ai_checks: number;
    tokens: number;
    documents: number;
    storage: number;
    credits: number;
    monthly_cost: number;
  };
}

// ──────────────────────────────────────────────
// AI Cost Limit Requests
// ──────────────────────────────────────────────
export interface UpdateAICostLimitRequest {
  monthly_soft_limit_cents?: number;
  monthly_hard_limit_cents?: number;
  daily_hard_limit_cents?: number;
  alert_threshold_pct?: number;
  alert_email?: string;
  is_hard_limited?: boolean;
}

// ──────────────────────────────────────────────
// AI Governance Dashboard
// ──────────────────────────────────────────────
export interface AIUsageAggregation {
  date: string;
  total_calls: number;
  total_tokens: number;
  total_cost_cents: number;
  by_operation: Record<string, { calls: number; tokens: number; cost_cents: number }>;
  error_rate: number;
}

// ──────────────────────────────────────────────
// Accuracy Governance
// ──────────────────────────────────────────────
export interface AccuracyDashboardResponse {
  overall_accuracy: number;
  total_reviewed: number;
  false_positive_rate: number;
  false_negative_rate: number;
  by_detection_type: Record<string, { accuracy: number; reviewed: number }>;
  recent_regression_runs: Array<{
    id: string;
    run_type: string;
    f1_score: number | null;
    status: string;
    completed_at: string | null;
  }>;
  unreviewed_count: number;
}
