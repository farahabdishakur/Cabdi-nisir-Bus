'use client';

import { BrandMark } from '@/components/brand';
import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Alert, Button, Field, Input } from '@/components/ui';

export default function LoginPage() {
  const { t, err, lang, setLang } = useI18n();
  const { login, user, loading } = useAuth();
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [idle, setIdle] = useState(false);
  useEffect(() => setIdle(new URLSearchParams(window.location.search).has('idle')), []);

  useEffect(() => {
    if (!loading && user) router.replace(user.mustChangePassword ? '/change-password' : '/');
  }, [loading, user, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError('');
    try {
      const u = await login(phone.replace(/\s/g, ''), password);
      router.replace(u.mustChangePassword ? '/change-password' : '/');
    } catch (x) {
      setError(err(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center bg-navy p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow-xl">
        <div className="mb-6 text-center">
          <div className="mb-3 flex justify-center"><BrandMark size={64} /></div>
          <h1 className="text-xl font-black text-navy">{t('common.appName')}</h1>
          <p className="text-sm text-gray-500">Boorama · Wajaale</p>
        </div>
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('auth.phone')} required>
            {(id) => <Input id={id} inputMode="tel" autoComplete="username" value={phone} onChange={(e) => setPhone(e.target.value)} required autoFocus />}
          </Field>
          <Field label={t('auth.password')} required>
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} required />}
          </Field>
          {idle && !error && <Alert tone="yellow">{t('auth.idle')}</Alert>}
          {error && <Alert>{error}</Alert>}
          <Button type="submit" size="lg" loading={busy}>
            {t('auth.submit')}
          </Button>
        </form>
        <div className="mt-4 flex justify-center gap-4 text-sm">
          <a href="/track" className="text-navy hover:underline">📦 {t('public.track')}</a>
          <a href="/schedule" className="text-navy hover:underline">🚐 {t('public.schedule')}</a>
        </div>
        <button className="mt-2 w-full text-center text-sm text-gray-500 hover:underline" onClick={() => setLang(lang === 'so' ? 'en' : 'so')}>
          {t('common.language')}
        </button>
      </div>
    </main>
  );
}
