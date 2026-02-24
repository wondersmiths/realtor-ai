import { type NextRequest, NextResponse } from 'next/server';
import { updateSession } from '@/lib/supabase/middleware';

const protectedPaths = [
  '/dashboard',
  '/documents',
  '/listings',
  '/compliance',
  '/disclosures',
  '/settings',
  '/admin',
];

const authPaths = ['/login', '/signup', '/forgot-password'];

export async function middleware(request: NextRequest) {
  const response = await updateSession(request);
  const { pathname } = request.nextUrl;

  // Check for user session by looking at Supabase auth cookies.
  // Supabase SSR stores auth tokens in cookies whose names contain 'auth-token'.
  const hasSession = request.cookies
    .getAll()
    .some((c) => c.name.includes('auth-token'));

  // Redirect unauthenticated users away from protected routes
  if (!hasSession && protectedPaths.some((p) => pathname.startsWith(p))) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('redirect', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // Redirect authenticated users away from auth pages
  if (hasSession && authPaths.some((p) => pathname.startsWith(p))) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  // Inject x-org-id header for API routes so server-side handlers can read it
  if (pathname.startsWith('/api')) {
    const orgId = request.cookies.get('x-org-id')?.value;
    if (orgId) {
      response.headers.set('x-org-id', orgId);
    }
  }

  return response;
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
