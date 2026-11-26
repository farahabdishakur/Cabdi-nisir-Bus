'use client';

import { FormEvent, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { phone } from '@/lib/format';
import { Alert, Button, Card, Field, Input, PageHeader } from '@/components/ui';

const STRONG = /^(?=.*[A-Za-z])(?=.*\d).{8,128}$/;

/**
 * Akoonkayga: qof kasta (Super Admin, maamule, karraani) wuxuu beddeli karaa password-kiisa iyo
 * lambarka taleefanka uu ku galo (username). Labadaba password-ka hadda ayaa xaqiijiya;
 * qalabka kale oo dhan waa laga saarayaa (kan hadda wuu sii jiraa).
 */
export default function AccountPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const me = useQuery({ queryKey: ['auth', 'me'], queryFn: () => api<{ phone: string; name: string }>('/auth/me'), enabled: !!user });
  if (!user) return null;
  const branch = boot.data?.branches.find((b) => b.id === user.branchId)?.name;
  return (
    <div className="mx-auto flex max-w-xl flex-col gap-4">
      <PageHeader title={`👤 ${t('account.title')}`} />
      <Card>
        <p className="text-lg font-bold text-navy">{user.name}</p>
        <p className="text-sm text-gray-600">{t(`roles.${user.role}`)}{branch ? ` · ${branch}` : ''}</p>
        {me.data && <p className="mt-1 text-sm">📱 {t('account.loginPhone')}: <b className="font-mono">{phone(me.data.phone)}</b></p>}
      </Card>
      <PasswordForm />
      <PhoneForm current={me.data?.phone} />
    </div>
  );
}

function PasswordForm() {
  const { t, err } = useI18n();
  const { changePassword } = useAuth();
  const [f, setF] = useState({ current: '', next: '', repeat: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    if (!STRONG.test(f.next)) return setMsg({ ok: false, text: t('auth.rule') });
    if (f.next !== f.repeat) return setMsg({ ok: false, text: t('auth.mismatch') });
    setBusy(true);
    try {
      await changePassword(f.current, f.next);
      setF({ current: '', next: '', repeat: '' });
      setMsg({ ok: true, text: t('account.passwordDone') });
    } catch (x) {
      setMsg({ ok: false, text: err(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={`🔑 ${t('account.changePassword')}`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <Field label={t('auth.current')} required>{(id) => <Input id={id} type="password" autoComplete="current-password" value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} required />}</Field>
        <Field label={t('auth.new')} hint={t('auth.rule')} required>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} required />}</Field>
        <Field label={t('auth.repeat')} required>{(id) => <Input id={id} type="password" autoComplete="new-password" value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value })} required />}</Field>
        {msg && <Alert tone={msg.ok ? 'green' : 'red'}>{msg.text}</Alert>}
        <Button type="submit" loading={busy}>{t('account.savePassword')}</Button>
      </form>
    </Card>
  );
}

function PhoneForm({ current }: { current?: string }) {
  const { t, err } = useI18n();
  const { changePhone } = useAuth();
  const qc = useQueryClient();
  const [f, setF] = useState({ phone: '', password: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setMsg(null);
    setBusy(true);
    try {
      await changePhone(f.password, f.phone.trim());
      await qc.invalidateQueries({ queryKey: ['auth', 'me'] });
      setMsg({ ok: true, text: t('account.phoneDone', { phone: phone(f.phone.replace(/\s/g, '')) }) });
      setF({ phone: '', password: '' });
    } catch (x) {
      setMsg({ ok: false, text: err(x) });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Card title={`📱 ${t('account.changePhone')}`}>
      <form onSubmit={submit} className="flex flex-col gap-3">
        <p className="text-sm text-gray-600">{t('account.phoneHint')}{current ? ` (${phone(current)})` : ''}</p>
        <Field label={t('account.newPhone')} required>{(id) => <Input id={id} inputMode="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} required />}</Field>
        <Field label={t('auth.current')} required>{(id) => <Input id={id} type="password" autoComplete="current-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required />}</Field>
        {msg && <Alert tone={msg.ok ? 'green' : 'red'}>{msg.text}</Alert>}
        <Button type="submit" loading={busy} disabled={f.phone.replace(/\s/g, '').length < 4 || !f.password}>{t('account.savePhone')}</Button>
      </form>
    </Card>
  );
}
