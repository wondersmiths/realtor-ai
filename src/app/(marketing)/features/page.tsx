import Link from 'next/link';
import {
  ArrowRight,
  ShieldCheck,
  FileSearch,
  ClipboardList,
  Home,
  Brain,
  Gauge,
  Lock,
  Zap,
  BarChart3,
  RefreshCcw,
} from 'lucide-react';

const featureSections = [
  {
    badge: 'Fair Housing',
    title: 'Fair Housing Language Analysis',
    description:
      'Our AI engine combines natural language processing with a comprehensive rules engine built on federal, state, and local fair housing regulations. It scans every listing description, email template, and marketing material to flag potentially discriminatory language -- from obvious violations to subtle steering phrases.',
    highlights: [
      'Real-time scanning of listing descriptions and marketing copy',
      'Rules engine covering all protected classes under the Fair Housing Act',
      'Suggested alternative phrasing for flagged language',
      'State-specific fair housing regulation support',
    ],
    icon: ShieldCheck,
    accentColor: 'blue',
  },
  {
    badge: 'Documents',
    title: 'Document Compliance Review',
    description:
      'Upload contracts, disclosures, and transaction documents for automated AI-powered compliance review. Our system checks every document against applicable regulations and highlights missing clauses, outdated language, and potential legal issues -- giving you a detailed compliance report in seconds.',
    highlights: [
      'Support for PDF, DOCX, DOC, and TXT formats',
      'Clause-by-clause compliance scoring',
      'Automatic detection of missing required disclosures',
      'Side-by-side comparison with compliant templates',
    ],
    icon: FileSearch,
    accentColor: 'indigo',
  },
  {
    badge: 'Disclosures',
    title: 'Disclosure Management',
    description:
      'Never miss a required disclosure again. RealtorAI tracks every disclosure requirement for each transaction, sends automated reminders before deadlines, and maintains a complete audit log. From seller disclosures to lead paint notices, every required document is accounted for.',
    highlights: [
      'Automated deadline tracking with email and in-app reminders',
      'Transaction-level disclosure checklists',
      'Support for all common disclosure types (seller, lead paint, HOA, natural hazard, etc.)',
      'Overdue alert escalation for brokers and compliance officers',
    ],
    icon: ClipboardList,
    accentColor: 'emerald',
  },
  {
    badge: 'Listings',
    title: 'Listing Compliance Checks',
    description:
      'Before a listing goes live, run it through RealtorAI\'s automated validation engine. We check MLS data standards, advertising rules, fair housing language, and state-specific requirements to ensure every listing is fully compliant before publication.',
    highlights: [
      'Pre-publication compliance validation',
      'MLS data standards and formatting checks',
      'Advertising rule compliance for photos and descriptions',
      'Batch checking for bulk listing uploads',
    ],
    icon: Home,
    accentColor: 'amber',
  },
  {
    badge: 'AI Governance',
    title: 'AI Governance & Controls',
    description:
      'Maintain full control over AI usage across your organization. RealtorAI provides detailed cost tracking, accuracy metrics, response caching for efficiency, and configurable governance policies. Monitor AI performance, set spending limits, and ensure your team uses AI responsibly.',
    highlights: [
      'Per-user and per-team AI usage dashboards',
      'Configurable monthly cost limits and alerts',
      'Response accuracy tracking with human feedback loops',
      'Intelligent caching to reduce costs and improve response times',
    ],
    icon: Brain,
    accentColor: 'violet',
  },
];

const accentStyles: Record<string, { badge: string; icon: string; highlight: string; placeholder: string }> = {
  blue: {
    badge: 'bg-blue-50 text-blue-700 border-blue-200',
    icon: 'bg-blue-100 text-blue-600',
    highlight: 'text-blue-600',
    placeholder: 'from-blue-100 to-blue-50 border-blue-200',
  },
  indigo: {
    badge: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    icon: 'bg-indigo-100 text-indigo-600',
    highlight: 'text-indigo-600',
    placeholder: 'from-indigo-100 to-indigo-50 border-indigo-200',
  },
  emerald: {
    badge: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    icon: 'bg-emerald-100 text-emerald-600',
    highlight: 'text-emerald-600',
    placeholder: 'from-emerald-100 to-emerald-50 border-emerald-200',
  },
  amber: {
    badge: 'bg-amber-50 text-amber-700 border-amber-200',
    icon: 'bg-amber-100 text-amber-600',
    highlight: 'text-amber-600',
    placeholder: 'from-amber-100 to-amber-50 border-amber-200',
  },
  violet: {
    badge: 'bg-violet-50 text-violet-700 border-violet-200',
    icon: 'bg-violet-100 text-violet-600',
    highlight: 'text-violet-600',
    placeholder: 'from-violet-100 to-violet-50 border-violet-200',
  },
};

const secondaryIcons: Record<string, typeof Gauge> = {
  blue: Lock,
  indigo: Zap,
  emerald: RefreshCcw,
  amber: BarChart3,
  violet: Gauge,
};

export default function FeaturesPage() {
  return (
    <div>
      {/* ───────── Header ───────── */}
      <section className="bg-gradient-to-b from-blue-50/70 to-white pb-4 pt-16 sm:pt-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Everything You Need for Real Estate Compliance
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            A complete compliance platform that combines AI intelligence with industry
            expertise to protect your business.
          </p>
        </div>
      </section>

      {/* ───────── Alternating Feature Sections ───────── */}
      <section className="py-16 sm:py-24">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="space-y-24 lg:space-y-32">
            {featureSections.map((feature, index) => {
              const reversed = index % 2 === 1;
              const styles = accentStyles[feature.accentColor];
              const SecondaryIcon = secondaryIcons[feature.accentColor];

              return (
                <div
                  key={feature.title}
                  className={`flex flex-col items-center gap-12 lg:flex-row lg:gap-16 ${
                    reversed ? 'lg:flex-row-reverse' : ''
                  }`}
                >
                  {/* Image placeholder */}
                  <div className="w-full shrink-0 lg:w-1/2">
                    <div
                      className={`flex aspect-[4/3] items-center justify-center rounded-2xl border bg-gradient-to-br ${styles.placeholder}`}
                    >
                      <div className="flex flex-col items-center gap-4 text-center">
                        <div className={`inline-flex h-20 w-20 items-center justify-center rounded-2xl ${styles.icon}`}>
                          <feature.icon className="h-10 w-10" />
                        </div>
                        <div className={`inline-flex h-12 w-12 items-center justify-center rounded-xl ${styles.icon} opacity-60`}>
                          <SecondaryIcon className="h-6 w-6" />
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Text content */}
                  <div className="w-full lg:w-1/2">
                    <div
                      className={`mb-4 inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${styles.badge}`}
                    >
                      {feature.badge}
                    </div>
                    <h2 className="text-2xl font-bold tracking-tight text-gray-900 sm:text-3xl">
                      {feature.title}
                    </h2>
                    <p className="mt-4 leading-relaxed text-gray-600">{feature.description}</p>

                    <ul className="mt-6 space-y-3">
                      {feature.highlights.map((item) => (
                        <li key={item} className="flex items-start gap-3 text-sm text-gray-700">
                          <ShieldCheck className={`mt-0.5 h-4 w-4 shrink-0 ${styles.highlight}`} />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ───────── Bottom CTA ───────── */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Ready to streamline your compliance?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            Start your free trial today and see how RealtorAI can save your team hours
            every week while reducing compliance risk.
          </p>
          <div className="mt-10 flex flex-col items-center justify-center gap-4 sm:flex-row">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-6 text-base font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
            >
              Start Free Trial
              <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              href="/pricing"
              className="inline-flex h-12 items-center gap-2 rounded-lg border border-gray-300 bg-white px-6 text-base font-semibold text-gray-700 shadow-sm transition-colors hover:bg-gray-50"
            >
              View Pricing
            </Link>
          </div>
        </div>
      </section>
    </div>
  );
}
