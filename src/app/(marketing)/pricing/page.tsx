import Link from 'next/link';
import { Check, Minus, HelpCircle } from 'lucide-react';

const plans = [
  {
    name: 'Free',
    price: '$0',
    period: '/mo',
    description: 'For individual agents getting started with compliance.',
    cta: 'Get Started',
    ctaHref: '/signup',
    highlighted: false,
    limits: {
      members: '3 team members',
      documents: '10 documents/mo',
      aiChecks: '20 AI checks/mo',
      listings: '5 active listings',
      storage: '1 GB storage',
    },
  },
  {
    name: 'Starter',
    price: '$49',
    period: '/mo',
    description: 'For growing teams that need more power and flexibility.',
    cta: 'Start Free Trial',
    ctaHref: '/signup',
    highlighted: true,
    badge: 'Most Popular',
    limits: {
      members: '10 team members',
      documents: '100 documents/mo',
      aiChecks: '200 AI checks/mo',
      listings: '50 active listings',
      storage: '5 GB storage',
    },
  },
  {
    name: 'Professional',
    price: '$149',
    period: '/mo',
    description: 'For brokerages that demand comprehensive compliance.',
    cta: 'Start Free Trial',
    ctaHref: '/signup',
    highlighted: false,
    limits: {
      members: '25 team members',
      documents: '500 documents/mo',
      aiChecks: '1,000 AI checks/mo',
      listings: '200 active listings',
      storage: '25 GB storage',
    },
  },
  {
    name: 'Enterprise',
    price: 'Custom',
    period: '',
    description: 'For large organizations with custom requirements.',
    cta: 'Contact Sales',
    ctaHref: '/contact',
    highlighted: false,
    limits: {
      members: 'Unlimited members',
      documents: 'Unlimited documents',
      aiChecks: 'Unlimited AI checks',
      listings: 'Unlimited listings',
      storage: 'Unlimited storage',
    },
  },
];

interface ComparisonRow {
  feature: string;
  free: string | boolean;
  starter: string | boolean;
  professional: string | boolean;
  enterprise: string | boolean;
}

const comparisonFeatures: ComparisonRow[] = [
  { feature: 'Team Members', free: '3', starter: '10', professional: '25', enterprise: 'Unlimited' },
  { feature: 'Documents per Month', free: '10', starter: '100', professional: '500', enterprise: 'Unlimited' },
  { feature: 'AI Compliance Checks', free: '20', starter: '200', professional: '1,000', enterprise: 'Unlimited' },
  { feature: 'Active Listings', free: '5', starter: '50', professional: '200', enterprise: 'Unlimited' },
  { feature: 'Storage', free: '1 GB', starter: '5 GB', professional: '25 GB', enterprise: 'Unlimited' },
  { feature: 'Fair Housing Analysis', free: true, starter: true, professional: true, enterprise: true },
  { feature: 'Document Review', free: true, starter: true, professional: true, enterprise: true },
  { feature: 'Disclosure Tracking', free: false, starter: true, professional: true, enterprise: true },
  { feature: 'Listing Compliance', free: false, starter: true, professional: true, enterprise: true },
  { feature: 'Audit Trail', free: false, starter: true, professional: true, enterprise: true },
  { feature: 'Team Management', free: false, starter: false, professional: true, enterprise: true },
  { feature: 'Priority Support', free: false, starter: false, professional: true, enterprise: true },
  { feature: 'Custom Integrations', free: false, starter: false, professional: false, enterprise: true },
  { feature: 'Dedicated Account Manager', free: false, starter: false, professional: false, enterprise: true },
  { feature: 'SLA Guarantee', free: false, starter: false, professional: false, enterprise: true },
];

const faqs = [
  {
    question: 'Can I switch plans at any time?',
    answer:
      'Yes. You can upgrade or downgrade your plan at any time from your billing settings. When upgrading, the new plan takes effect immediately and you will be charged a prorated amount. Downgrades take effect at the end of your current billing cycle.',
  },
  {
    question: 'Is there a free trial for paid plans?',
    answer:
      'Absolutely. All paid plans come with a 14-day free trial -- no credit card required. You get full access to all features during the trial so you can evaluate RealtorAI risk-free.',
  },
  {
    question: 'What happens if I exceed my plan limits?',
    answer:
      'We will notify you as you approach your limits. If you exceed them, existing data is never deleted. You can either upgrade your plan or wait until the next billing cycle for limits to reset.',
  },
  {
    question: 'Do you offer discounts for annual billing?',
    answer:
      'Yes. Annual plans receive a 20% discount compared to monthly billing. Contact our sales team for details on annual pricing or custom arrangements for larger organizations.',
  },
];

function CellValue({ value }: { value: string | boolean }) {
  if (typeof value === 'string') {
    return <span className="text-sm font-medium text-gray-900">{value}</span>;
  }
  if (value) {
    return <Check className="mx-auto h-5 w-5 text-blue-600" />;
  }
  return <Minus className="mx-auto h-5 w-5 text-gray-300" />;
}

export default function PricingPage() {
  return (
    <div>
      {/* ───────── Header ───────── */}
      <section className="bg-gradient-to-b from-blue-50/70 to-white pb-4 pt-16 sm:pt-20">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl">
            Simple, Transparent Pricing
          </h1>
          <p className="mt-4 text-lg text-gray-600">
            Start for free and scale as your brokerage grows. No hidden fees, no surprises.
          </p>
        </div>
      </section>

      {/* ───────── Plan Cards ───────── */}
      <section className="pb-20 pt-12">
        <div className="mx-auto grid max-w-7xl gap-6 px-4 sm:px-6 lg:grid-cols-4 lg:px-8">
          {plans.map((plan) => (
            <div
              key={plan.name}
              className={`relative flex flex-col rounded-2xl border p-8 shadow-sm transition-shadow hover:shadow-md ${
                plan.highlighted
                  ? 'border-blue-600 ring-2 ring-blue-600'
                  : 'border-gray-200'
              }`}
            >
              {plan.highlighted && plan.badge && (
                <div className="absolute -top-3.5 left-1/2 -translate-x-1/2">
                  <span className="inline-flex items-center rounded-full bg-blue-600 px-3 py-1 text-xs font-semibold text-white">
                    {plan.badge}
                  </span>
                </div>
              )}

              <div className="mb-6">
                <h3 className="text-lg font-semibold text-gray-900">{plan.name}</h3>
                <div className="mt-3 flex items-baseline">
                  <span className="text-4xl font-extrabold text-gray-900">{plan.price}</span>
                  {plan.period && (
                    <span className="ml-1 text-base text-gray-500">{plan.period}</span>
                  )}
                </div>
                <p className="mt-3 text-sm leading-relaxed text-gray-500">{plan.description}</p>
              </div>

              <ul className="mb-8 flex-1 space-y-3">
                {Object.values(plan.limits).map((limit) => (
                  <li key={limit} className="flex items-start gap-2 text-sm text-gray-700">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-blue-600" />
                    {limit}
                  </li>
                ))}
              </ul>

              <Link
                href={plan.ctaHref}
                className={`inline-flex h-11 items-center justify-center rounded-lg text-sm font-semibold transition-colors ${
                  plan.highlighted
                    ? 'bg-blue-600 text-white shadow-sm hover:bg-blue-700'
                    : 'border border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                }`}
              >
                {plan.cta}
              </Link>
            </div>
          ))}
        </div>
      </section>

      {/* ───────── Feature Comparison Table ───────── */}
      <section className="border-t border-gray-100 bg-gray-50 py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-gray-900">
            Feature Comparison
          </h2>

          <div className="overflow-x-auto rounded-xl border border-gray-200 bg-white shadow-sm">
            <table className="w-full text-left">
              <thead>
                <tr className="border-b border-gray-200 bg-gray-50">
                  <th className="px-6 py-4 text-sm font-semibold text-gray-900">Feature</th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Free
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-blue-600">
                    Starter
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Professional
                  </th>
                  <th className="px-6 py-4 text-center text-sm font-semibold text-gray-900">
                    Enterprise
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {comparisonFeatures.map((row) => (
                  <tr key={row.feature} className="hover:bg-gray-50/50">
                    <td className="px-6 py-3.5 text-sm font-medium text-gray-700">
                      {row.feature}
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <CellValue value={row.free} />
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <CellValue value={row.starter} />
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <CellValue value={row.professional} />
                    </td>
                    <td className="px-6 py-3.5 text-center">
                      <CellValue value={row.enterprise} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* ───────── FAQ ───────── */}
      <section className="py-20">
        <div className="mx-auto max-w-3xl px-4 sm:px-6">
          <h2 className="mb-12 text-center text-3xl font-bold tracking-tight text-gray-900">
            Frequently Asked Questions
          </h2>

          <div className="space-y-6">
            {faqs.map((faq) => (
              <div
                key={faq.question}
                className="rounded-xl border border-gray-200 bg-white p-6 shadow-sm"
              >
                <h3 className="flex items-start gap-3 text-base font-semibold text-gray-900">
                  <HelpCircle className="mt-0.5 h-5 w-5 shrink-0 text-blue-600" />
                  {faq.question}
                </h3>
                <p className="mt-3 pl-8 text-sm leading-relaxed text-gray-600">{faq.answer}</p>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
