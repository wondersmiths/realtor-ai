export default function AuthLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50 px-4 py-12">
      <div className="w-full max-w-md">
        {/* Logo / App name */}
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-gray-900">
            Realtor<span className="text-blue-600">AI</span>
          </h1>
          <p className="mt-2 text-sm text-gray-500">
            AI-powered real estate compliance platform
          </p>
        </div>

        {/* Card container */}
        <div className="rounded-xl border border-gray-200 bg-white px-8 py-10 shadow-sm">
          {children}
        </div>
      </div>
    </div>
  );
}
