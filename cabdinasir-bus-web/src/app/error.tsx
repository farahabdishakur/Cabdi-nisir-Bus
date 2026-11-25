'use client';

import { useEffect } from 'react';
import { useI18n } from '@/lib/i18n';

/** Khalad aan la filayn (bug) — bogga ma dumo oo dhan; karraanigu wuu isku dayi karaa mar kale. */
export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const { t } = useI18n();
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-6 text-center">
      <p className="text-4xl">⚠️</p>
      <p className="font-semibold text-gray-800">{t('errors.UNKNOWN')}</p>
      <p className="text-sm text-gray-500">{t('errors.tryAgain')}</p>
      <button onClick={reset} className="rounded-lg bg-navy px-4 py-2 font-semibold text-white">{t('common.refresh')}</button>
    </main>
  );
}
