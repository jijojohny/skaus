'use client';

import Link from 'next/link';
import { DashboardShell } from '@/components/DashboardShell';

export default function ActivitiesPage() {
  return (
    <DashboardShell title="Activities">
      <div className="px-6 lg:px-10 py-16 max-w-lg mx-auto text-center space-y-4">
        <p className="text-skaus-muted text-sm">
          Activity history and filters live on the main dashboard for now.
        </p>
        <Link href="/dashboard" className="inline-flex text-skaus-primary font-semibold text-sm hover:underline">
          Go to Dashboard
        </Link>
      </div>
    </DashboardShell>
  );
}
