import Link from 'next/link';
import {
  Shield,
} from 'lucide-react';

export default function MarketingLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="min-h-screen flex flex-col bg-white">
      {/* ───────── Navigation ───────── */}
      <header className="sticky top-0 z-50 border-b border-gray-100 bg-white/80 backdrop-blur-md">
        <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <Shield className="h-7 w-7 text-blue-600" />
            <span className="text-xl font-bold tracking-tight text-gray-900">
              Realtor<span className="text-blue-600">AI</span>
            </span>
          </Link>

          {/* Center links */}
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

          {/* Right actions */}
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

      {/* ───────── Page content ───────── */}
      <main className="flex-1">{children}</main>

      {/* ───────── Footer ───────── */}
      <footer className="border-t border-gray-100 bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="flex flex-col items-center justify-between gap-8 md:flex-row">
            {/* Brand */}
            <div className="flex items-center gap-2">
              <Shield className="h-6 w-6 text-blue-600" />
              <span className="text-lg font-bold tracking-tight text-gray-900">
                Realtor<span className="text-blue-600">AI</span>
              </span>
            </div>

            {/* Links */}
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
