import { SupabaseProvider } from '@/providers/supabase-provider';
import { OrganizationProvider } from '@/providers/organization-provider';
import { ThemeProvider } from '@/providers/theme-provider';
import { ToastProvider } from '@/providers/toast-provider';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata = {
  title: 'RealtorAI',
  description: 'AI-powered compliance for real estate',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className}>
        <SupabaseProvider>
          <OrganizationProvider>
            <ThemeProvider>
              <ToastProvider>
                {children}
              </ToastProvider>
            </ThemeProvider>
          </OrganizationProvider>
        </SupabaseProvider>
      </body>
    </html>
  );
}
