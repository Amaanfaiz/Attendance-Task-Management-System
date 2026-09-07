import type { Metadata } from 'next';
import './globals.css';
import { QueryProvider } from '@/lib/query-provider';

export const metadata: Metadata = {
  title: 'Attendance & Task Management',
  description: 'Attendance, breaks and task-time tracking',
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body className="bg-slate-50 text-slate-900 antialiased">
        <QueryProvider>{children}</QueryProvider>
      </body>
    </html>
  );
}
