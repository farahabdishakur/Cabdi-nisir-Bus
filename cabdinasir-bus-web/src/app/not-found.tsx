'use client';

import Link from 'next/link';
import { useI18n } from '@/lib/i18n';

export default function NotFound() {
  const { t } = useI18n();
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-6xl font-black text-navy">404</p>
      <p className="text-gray-600">{t('errors.pageNotFound')}</p>
      <Link href="/" className="rounded-lg bg-brand px-4 py-2 font-semibold text-white">{t('nav.dashboard')}</Link>
    </main>
  );
}
