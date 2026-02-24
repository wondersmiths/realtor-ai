import Link from 'next/link';
import {
  Shield,
  FileSearch,
  Clock,
  Home,
  Users,
  ScrollText,
  ArrowRight,
  ShieldCheck,
} from 'lucide-react';

const features = [
  {
    icon: ShieldCheck,
    title: 'Fair Housing Compliance',
    description:
      'AI-powered language analysis scans your listings and communications for potential fair housing violations before they become problems.',
  },
  {
    icon: FileSearch,
    title: 'Document Review',
    description:
      'Automated compliance checking reviews contracts, disclosures, and forms against federal, state, and local regulations in seconds.',
  },
  {
    icon: Clock,
    title: 'Disclosure Tracking',
    description:
      'Never miss a deadline with intelligent disclosure tracking. Get reminders for upcoming due dates and required documents.',
  },
  {
    icon: Home,
    title: 'Listing Compliance',
    description:
      'Ensure every listing meets MLS standards, fair housing requirements, and state-specific advertising rules automatically.',
  },
  {
    icon: Users,
    title: 'Team Management',
    description:
      'Role-based access controls let brokerages manage compliance across agents, teams, and offices from a single dashboard.',
  },
  {
    icon: ScrollText,
    title: 'Audit Trail',
    description:
      'Maintain a complete compliance history with timestamped records of every check, review, and action for full accountability.',
  },
];

const stats = [
  { value: '1.2M+', label: 'Documents Reviewed' },
  { value: '3.8M+', label: 'Compliance Checks Run' },
  { value: '24K+', label: 'Violations Caught Early' },
];

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-white">
      {/* ───────── Navigation (duplicated from layout for root page) ───────── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Realtor<span className="text-blue-600">AI</span>
            </span>
          </Link>

          <div className="hidden items-center gap-8 md:flex">
            <Link
              href="/features"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Features
            </Link>
            <Link
              href="/pricing"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Pricing
            </Link>
            <Link
              href="/contact"
              className="text-sm font-medium text-gray-600 transition-colors hover:text-gray-900"
            >
              Contact
            </Link>
          </div>

          <div className="flex items-center gap-3">
            <Link
              href="/login"
              className="hidden text-sm font-medium text-gray-700 transition-colors hover:text-gray-900 sm:inline-block"
            >
              Log in
            </Link>
            <Link
              href="/signup"
              className="inline-flex h-9 items-center rounded-lg bg-blue-600 px-4 text-sm font-medium text-white shadow-sm transition-colors hover:bg-blue-700"
            >
              Get Started
            </Link>
          </div>
        </nav>
      </header>

      {/* ───────── Hero ───────── */}
      <section className="relative overflow-hidden bg-gradient-to-b from-blue-50/70 to-white pb-20 pt-20 sm:pb-28 sm:pt-28">
        {/* Decorative blobs */}
        <div className="pointer-events-none absolute -left-40 -top-40 h-[500px] w-[500px] rounded-full bg-blue-100/40 blur-3xl" />
        <div className="pointer-events-none absolute -right-40 top-20 h-[400px] w-[400px] rounded-full bg-indigo-100/30 blur-3xl" />

        <div className="relative mx-auto max-w-4xl px-4 text-center sm:px-6">
          <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-blue-200 bg-blue-50 px-4 py-1.5 text-sm font-medium text-blue-700">
            <Shield className="h-4 w-4" />
            Trusted by 500+ real estate professionals
          </div>

          <h1 className="text-4xl font-extrabold tracking-tight text-gray-900 sm:text-5xl lg:text-6xl">
            AI-Powered Compliance for{' '}
            <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
              Real Estate Professionals
            </span>
          </h1>

          <p className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-gray-600 sm:text-xl">
            Automate fair housing checks, disclosure tracking, and document review.
            Stay compliant, reduce risk, and close deals with confidence.
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
              See Pricing
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Features Grid ───────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Everything you need to stay compliant
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Comprehensive compliance tools designed specifically for real estate
              professionals, brokerages, and teams.
            </p>
          </div>

          <div className="mt-16 grid gap-8 sm:grid-cols-2 lg:grid-cols-3">
            {features.map((feature) => (
              <div
                key={feature.title}
                className="group rounded-2xl border border-gray-100 bg-white p-8 shadow-sm transition-all hover:border-blue-100 hover:shadow-md"
              >
                <div className="mb-4 inline-flex h-12 w-12 items-center justify-center rounded-xl bg-blue-50 text-blue-600 transition-colors group-hover:bg-blue-100">
                  <feature.icon className="h-6 w-6" />
                </div>
                <h3 className="text-lg font-semibold text-gray-900">{feature.title}</h3>
                <p className="mt-2 leading-relaxed text-gray-600">{feature.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Social Proof / Stats ───────── */}
      <section className="border-y border-gray-100 bg-gray-50 py-16 sm:py-20">
        <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
              Trusted by 500+ real estate professionals
            </h2>
            <p className="mt-4 text-lg text-gray-600">
              Brokerages, agents, and compliance officers rely on RealtorAI every day to
              protect their business.
            </p>
          </div>

          <div className="mt-12 grid gap-8 sm:grid-cols-3">
            {stats.map((stat) => (
              <div
                key={stat.label}
                className="rounded-2xl border border-gray-100 bg-white px-8 py-10 text-center shadow-sm"
              >
                <div className="text-4xl font-extrabold text-blue-600">{stat.value}</div>
                <div className="mt-2 text-sm font-medium text-gray-500">{stat.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ───────── Bottom CTA ───────── */}
      <section className="py-20 sm:py-28">
        <div className="mx-auto max-w-3xl px-4 text-center sm:px-6">
          <h2 className="text-3xl font-bold tracking-tight text-gray-900 sm:text-4xl">
            Ready to ensure compliance?
          </h2>
          <p className="mx-auto mt-4 max-w-xl text-lg text-gray-600">
            Join hundreds of real estate professionals who trust RealtorAI to keep their
            business compliant and their clients protected.
          </p>
          <div className="mt-10">
            <Link
              href="/signup"
              className="inline-flex h-12 items-center gap-2 rounded-lg bg-blue-600 px-8 text-base font-semibold text-white shadow-md transition-colors hover:bg-blue-700"
            >
              Get Started for Free
              <ArrowRight className="h-4 w-4" />
            </Link>
          </div>
        </div>
      </section>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              <span className="text-lg font-bold tracking-tight text-gray-900">
                Realtor<span className="text-blue-600">AI</span>
              </span>
            </div>

            <div className="flex flex-wrap items-center justify-center gap-6 text-sm text-gray-500">
              <Link href="/features" className="transition-colors hover:text-gray-900">
                Features
              </Link>
              <Link href="/pricing" className="transition-colors hover:text-gray-900">
                Pricing
              </Link>
              <Link href="/contact" className="transition-colors hover:text-gray-900">
                Contact
              </Link>
              <Link href="#" className="transition-colors hover:text-gray-900">
                Privacy
              </Link>
              <Link href="#" className="transition-colors hover:text-gray-900">
                Terms
              </Link>
            </div>
          </div>

          <div className="mt-8 border-t border-gray-200 pt-8 text-center text-sm text-gray-400">
            &copy; {new Date().getFullYear()} RealtorAI. All rights reserved.
          </div>
        </div>
      </footer>
    </div>
  );
}
