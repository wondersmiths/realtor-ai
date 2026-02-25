// ──────────────────────────────────────────────
// Roles
// ──────────────────────────────────────────────
export const ROLES = {
  owner: { value: 'owner', label: 'Owner' },
  admin: { value: 'admin', label: 'Admin' },
  agent: { value: 'agent', label: 'Agent' },
} as const;

export type RoleKey = keyof typeof ROLES;

// ──────────────────────────────────────────────
// Document Statuses
// ──────────────────────────────────────────────
export const DOCUMENT_STATUSES = {
  pending: { value: 'pending', label: 'Pending' },
  reviewing: { value: 'reviewing', label: 'Reviewing' },
  reviewed: { value: 'reviewed', label: 'Reviewed' },
  flagged: { value: 'flagged', label: 'Flagged' },
  approved: { value: 'approved', label: 'Approved' },
} as const;

export type DocumentStatusKey = keyof typeof DOCUMENT_STATUSES;

// ──────────────────────────────────────────────
// Compliance Check Types
// ──────────────────────────────────────────────
export const COMPLIANCE_CHECK_TYPES = {
  fair_housing: { value: 'fair_housing', label: 'Fair Housing' },
  listing_compliance: { value: 'listing_compliance', label: 'Listing Compliance' },
  document_review: { value: 'document_review', label: 'Document Review' },
  disclosure_completeness: { value: 'disclosure_completeness', label: 'Disclosure Completeness' },
} as const;

export type ComplianceCheckTypeKey = keyof typeof COMPLIANCE_CHECK_TYPES;

// ──────────────────────────────────────────────
// Disclosure Types
// ──────────────────────────────────────────────
export const DISCLOSURE_TYPES = {
  seller_disclosure: { value: 'seller_disclosure', label: 'Seller Disclosure' },
  lead_paint: { value: 'lead_paint', label: 'Lead Paint Disclosure' },
  property_condition: { value: 'property_condition', label: 'Property Condition' },
  natural_hazard: { value: 'natural_hazard', label: 'Natural Hazard' },
  hoa: { value: 'hoa', label: 'HOA Disclosure' },
  title: { value: 'title', label: 'Title Disclosure' },
  flood_zone: { value: 'flood_zone', label: 'Flood Zone Disclosure' },
} as const;

export type DisclosureTypeKey = keyof typeof DISCLOSURE_TYPES;

// ──────────────────────────────────────────────
// Compliance Score Thresholds
// ──────────────────────────────────────────────
export const COMPLIANCE_SCORE_THRESHOLDS = {
  excellent: { min: 90, label: 'Excellent', color: 'green' },
  good: { min: 70, label: 'Good', color: 'blue' },
  needs_review: { min: 50, label: 'Needs Review', color: 'yellow' },
  critical: { min: 0, label: 'Critical', color: 'red' },
} as const;

export function getScoreThreshold(score: number) {
  if (score >= COMPLIANCE_SCORE_THRESHOLDS.excellent.min) return COMPLIANCE_SCORE_THRESHOLDS.excellent;
  if (score >= COMPLIANCE_SCORE_THRESHOLDS.good.min) return COMPLIANCE_SCORE_THRESHOLDS.good;
  if (score >= COMPLIANCE_SCORE_THRESHOLDS.needs_review.min) return COMPLIANCE_SCORE_THRESHOLDS.needs_review;
  return COMPLIANCE_SCORE_THRESHOLDS.critical;
}

// ──────────────────────────────────────────────
// Plan Names
// ──────────────────────────────────────────────
export const PLAN_NAMES = {
  free: { value: 'free', label: 'Free' },
  starter: { value: 'starter', label: 'Starter' },
  professional: { value: 'professional', label: 'Professional' },
  enterprise: { value: 'enterprise', label: 'Enterprise' },
} as const;

export type PlanNameKey = keyof typeof PLAN_NAMES;

// ──────────────────────────────────────────────
// File Upload Constraints
// ──────────────────────────────────────────────
export const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10 MB in bytes
export const MLS_FILE_SIZE_THRESHOLD = 5 * 1024 * 1024; // 5 MB — typical MLS upload limit
export const PDF_SPLIT_MAX_PAGES_PER_PART = 50;

export const ALLOWED_FILE_TYPES = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'text/plain',
] as const;

export const ALLOWED_FILE_EXTENSIONS = ['pdf', 'doc', 'docx', 'txt'] as const;

// ──────────────────────────────────────────────
// Sidebar Navigation Items
// ──────────────────────────────────────────────
export interface NavItem {
  href: string;
  label: string;
  icon: string; // lucide-react icon name
  requiredRole?: RoleKey;
}

// ──────────────────────────────────────────────
// Signature Report Messages
// ──────────────────────────────────────────────
export const SIGNATURE_REPORT_MESSAGES = {
  completed: 'Automated signature detection completed.',
  flagged: 'Pages flagged for manual review are indicated.',
  humanReview: 'Final compliance verification requires human review.',
} as const;

export const NAV_ITEMS: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: 'LayoutDashboard' },
  { href: '/dashboard/listings', label: 'Listings', icon: 'Home' },
  { href: '/dashboard/documents', label: 'Documents', icon: 'FileText' },
  { href: '/dashboard/compliance', label: 'Compliance', icon: 'ShieldCheck' },
  { href: '/dashboard/disclosures', label: 'Disclosures', icon: 'ClipboardList' },
  { href: '/dashboard/fair-housing', label: 'Fair Housing', icon: 'Scale' },
  { href: '/dashboard/team', label: 'Team', icon: 'Users', requiredRole: 'admin' },
  { href: '/dashboard/billing', label: 'Billing', icon: 'CreditCard', requiredRole: 'owner' },
  { href: '/dashboard/settings', label: 'Settings', icon: 'Settings' },
  { href: '/dashboard/audit-log', label: 'Audit Log', icon: 'ScrollText', requiredRole: 'admin' },
  { href: '/dashboard/ai-analytics', label: 'AI Analytics', icon: 'BrainCircuit', requiredRole: 'admin' },
  { href: '/dashboard/evaluations', label: 'Evaluations', icon: 'FlaskConical', requiredRole: 'admin' },
  { href: '/dashboard/anomaly-flags', label: 'Anomaly Flags', icon: 'ShieldAlert', requiredRole: 'admin' },
  { href: '/dashboard/compliance-tracker', label: 'Compliance Tracker', icon: 'ClipboardCheck', requiredRole: 'admin' },
];
