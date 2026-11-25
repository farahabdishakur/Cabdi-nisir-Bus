'use client';

import { BrandMark } from './brand';
import Link from 'next/link';
import { ReactNode } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useI18n } from '@/lib/i18n';
import type { Company } from '@/lib/types';

interface PublicBranch { code: string; name: string; city: string; phones: string[]; zaadNumber: string | null; edahabNumber: string | null }

/** Bogagga dadweynaha (login la'aan): raadinta alaabta + jadwalka safarada + xiriirka laamaha. */
export function PublicShell({ children }: { children: ReactNode }) {
  const { t, lang, setLang } = useI18n();
  const company = useQuery({ queryKey: ['public', 'company'], queryFn: () => api<Company>('/company'), staleTime: 3600_000 });
  const branches = useQuery({ queryKey: ['public', 'branches'], queryFn: () => api<PublicBranch[]>('/public/branches'), staleTime: 3600_000 });
  return (
    <div className="min-h-screen bg-gray-50">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-between gap-3 p-4">
          <Link href="/track" className="flex items-center gap-2">
            <BrandMark size={40} />
            <span>
              <span className="block font-black">{company.data?.name ?? 'Cabdinasir Bus'}</span>
              <span className="block text-xs text-indigo-200">{company.data?.tagline}</span>
            </span>
          </Link>
          <nav className="flex items-center gap-1 text-sm">
            <Link href="/track" className="rounded-lg px-3 py-2 hover:bg-white/10">📦 {t('public.track')}</Link>
            <Link href="/schedule" className="rounded-lg px-3 py-2 hover:bg-white/10">🚐 {t('public.schedule')}</Link>
            <button className="rounded-lg px-2 py-2 text-xs font-semibold hover:bg-white/10" onClick={() => setLang(lang === 'so' ? 'en' : 'so')}>{lang === 'so' ? 'EN' : 'SO'}</button>
          </nav>
        </div>
      </header>
      <main className="mx-auto max-w-4xl p-4">{children}</main>
      <footer className="mx-auto max-w-4xl p-4 pb-10">
        <h2 className="mb-2 font-bold text-navy">{t('public.contact')}</h2>
        <div className="grid gap-3 sm:grid-cols-3">
          {branches.data?.map((b) => (
            <div key={b.code} className="rounded-xl border border-gray-200 bg-white p-3 text-sm">
              <p className="font-semibold">{b.name}</p>
              {b.phones.length > 0 && <p className="text-gray-600">☎ {b.phones.join(' · ')}</p>}
              {b.zaadNumber && <p className="text-gray-600">Zaad: {b.zaadNumber}</p>}
              {b.edahabNumber && <p className="text-gray-600">eDahab: {b.edahabNumber}</p>}
            </div>
          ))}
        </div>
        {company.data && <p className="mt-4 text-center text-xs text-gray-500">{company.data.slogans.join(' · ')}</p>}
      </footer>
    </div>
  );
}
