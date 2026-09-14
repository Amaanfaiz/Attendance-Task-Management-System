export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gradient-to-b from-brand-50 via-slate-50 to-slate-50 px-4 py-12">
      <div className="w-full max-w-md">
        <div className="mb-6 flex flex-col items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-brand-600 text-base font-bold text-white shadow-sm">
            AT
          </span>
          <h1 className="text-center text-xl font-semibold text-slate-900">
            Attendance &amp; Task Management
          </h1>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-6 shadow-md">{children}</div>
      </div>
    </div>
  );
}
