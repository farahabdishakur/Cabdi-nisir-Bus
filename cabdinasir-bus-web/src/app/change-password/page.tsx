'use client';

import { FormEvent, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { Alert, Button, Field, Input } from '@/components/ui';

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

export default function ChangePasswordPage() {
  const { t, err } = useI18n();
  const { user, loading, changePassword, logout } = useAuth();
  const router = useRouter();
  const [current, setCurrent] = useState('');
  const [next, setNext] = useState('');
  const [repeat, setRepeat] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!loading && !user) router.replace('/login');
  }, [loading, user, router]);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    if (!STRONG.test(next)) return setError(t('auth.rule'));
    if (next !== repeat) return setError(t('auth.mismatch'));
    setBusy(true);
    try {
      await changePassword(current, next);
      router.replace('/');
    } catch (x) {
      setError(err(x));
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flex min-h-screen items-center justify-center p-4">
      <div className="w-full max-w-sm rounded-2xl bg-white p-6 shadow">
        <h1 className="mb-2 text-xl font-bold text-navy">{t('auth.changeTitle')}</h1>
        {user?.mustChangePassword && (
          <div className="mb-4">
            <Alert tone="yellow">{t('auth.changeHint')}</Alert>
          </div>
        )}
        <form onSubmit={submit} className="flex flex-col gap-4">
          <Field label={t('auth.current')} required>
            {(id) => <Input id={id} type="password" autoComplete="current-password" value={current} onChange={(e) => setCurrent(e.target.value)} required />}
          </Field>
          <Field label={t('auth.new')} hint={t('auth.rule')} required>
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} required />}
          </Field>
          <Field label={t('auth.repeat')} required>
            {(id) => <Input id={id} type="password" autoComplete="new-password" value={repeat} onChange={(e) => setRepeat(e.target.value)} required />}
          </Field>
          {error && <Alert>{error}</Alert>}
          <Button type="submit" size="lg" loading={busy}>
            {t('common.save')}
          </Button>
          <Button type="button" variant="ghost" onClick={() => logout().then(() => router.replace('/login'))}>
            {t('nav.logout')}
          </Button>
        </form>
      </div>
    </main>
  );
}
