export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <div className="w-full max-w-md">
        <h1 className="mb-6 text-center text-xl font-semibold text-slate-900">
          Attendance &amp; Task Management
        </h1>
        <div className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm">{children}</div>
      </div>
    </div>
  );
}
