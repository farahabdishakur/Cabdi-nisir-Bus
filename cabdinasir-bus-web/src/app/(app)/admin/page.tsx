'use client';

import { ReactNode, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { isSuperAdmin } from '@/lib/permissions';
import { useBootstrap } from '@/lib/queries';
import { centsToInput, parseUsd, phone, usd } from '@/lib/format';
import type { Branch, Category, Company, Driver, Role, Route, Vehicle } from '@/lib/types';
import { Alert, Badge, Button, Card, Checkbox, Field, Input, Loading, Modal, PageHeader, Select, Table, Td, Textarea } from '@/components/ui';
import { BranchSelect } from '@/components/domain';

type Tab = 'branches' | 'routes' | 'vehicles' | 'drivers' | 'users' | 'categories' | 'settings';

export default function AdminPage() {
  const { t } = useI18n();
  const { user } = useAuth();
  const sa = isSuperAdmin(user);
  const tabs: [Tab, boolean][] = [
    ['users', true], ['drivers', true], ['branches', sa], ['routes', sa], ['vehicles', sa], ['categories', sa], ['settings', sa],
  ];
  const [tab, setTab] = useState<Tab>('users');
  return (
    <div>
      <PageHeader title={t('admin.title')} />
      <div className="mb-4 flex flex-wrap gap-2">
        {tabs.filter(([, show]) => show).map(([k]) => <Button key={k} size="sm" variant={tab === k ? 'navy' : 'secondary'} onClick={() => setTab(k)}>{t(`admin.${k}`)}</Button>)}
      </div>
      {tab === 'users' && <Users />}
      {tab === 'drivers' && <Drivers />}
      {tab === 'branches' && sa && <Branches />}
      {tab === 'routes' && sa && <Routes />}
      {tab === 'vehicles' && sa && <Vehicles />}
      {tab === 'categories' && sa && <Categories />}
      {tab === 'settings' && sa && <Settings />}
    </div>
  );
}

/** Foom guud: modal + kaydin + khalad */
function useSaver() {
  const { err } = useI18n();
  const qc = useQueryClient();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async (fn: () => Promise<unknown>, keys: string[][], after?: () => void) => {
    setBusy(true);
    setError('');
    try {
      await fn();
      keys.forEach((k) => qc.invalidateQueries({ queryKey: k }));
      after?.();
    } catch (e) {
      setError(err(e));
    } finally {
      setBusy(false);
    }
  };
  return { error, busy, run, setError };
}

function FormModal({ open, title, onClose, onSave, busy, error, children }: { open: boolean; title: string; onClose: () => void; onSave: () => void; busy: boolean; error: string; children: ReactNode }) {
  const { t } = useI18n();
  return (
    <Modal open={open} onClose={onClose} title={title}>
      <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); onSave(); }}>
        {children}
        {error && <Alert>{error}</Alert>}
        <Button type="submit" loading={busy}>{t('common.save')}</Button>
      </form>
    </Modal>
  );
}

// ------------------------------------------------------------------ users

interface UserRow { id: string; name: string; phone: string; role: Role; branchId: string | null; isActive: boolean; lastLoginAt: string | null }

function Users() {
  const { t } = useI18n();
  const { user } = useAuth();
  const sa = isSuperAdmin(user);
  const boot = useBootstrap();
  const list = useQuery({ queryKey: ['admin', 'users'], queryFn: () => api<UserRow[]>('/users') });
  const s = useSaver();
  const [open, setOpen] = useState(false);
  const [reset, setReset] = useState<UserRow | null>(null);
  const [form, setForm] = useState({ name: '', phone: '', password: '', role: 'CASHIER' as Role, branchId: user?.branchId ?? '' });
  const [pw, setPw] = useState('');
  const roles: Role[] = sa ? ['CASHIER', 'BRANCH_MANAGER', 'DRIVER', 'SUPER_ADMIN'] : ['CASHIER', 'DRIVER'];
  const branchName = (id: string | null) => boot.data?.branches.find((b) => b.id === id)?.name ?? '—';

  return (
    <Card title={t('admin.users')} actions={<Button size="sm" onClick={() => setOpen(true)}>+ {t('common.add')}</Button>}>
      {list.isLoading ? <Loading /> : (
        <Table head={[t('common.name'), t('common.phone'), t('admin.role'), t('common.branch'), t('common.status'), '']} empty={!list.data?.length}>
          {list.data?.map((u) => (
            <tr key={u.id}>
              <Td className="font-semibold">{u.name}</Td>
              <Td>{phone(u.phone)}</Td>
              <Td>{t(`roles.${u.role}`)}</Td>
              <Td>{branchName(u.branchId)}</Td>
              <Td>{u.isActive ? <Badge tone="green">{t('common.active')}</Badge> : <Badge tone="red">{t('common.inactive')}</Badge>}</Td>
              <Td>
                {u.id !== user?.id && (
                  <div className="flex gap-1">
                    <Button size="sm" variant="ghost" onClick={() => s.run(() => api(`/users/${u.id}`, { method: 'PATCH', body: { isActive: !u.isActive } }), [['admin', 'users']])}>{u.isActive ? t('common.inactive') : t('common.active')}</Button>
                    <Button size="sm" variant="ghost" onClick={() => { setReset(u); setPw(''); }}>{t('admin.resetPassword')}</Button>
                  </div>
                )}
              </Td>
            </tr>
          ))}
        </Table>
      )}
      {s.error && !open && !reset && <div className="mt-2"><Alert>{s.error}</Alert></div>}
      <FormModal open={open} title={t('admin.users')} onClose={() => setOpen(false)} busy={s.busy} error={s.error}
        onSave={() => s.run(() => api('/users', { method: 'POST', body: { ...form, branchId: form.role === 'SUPER_ADMIN' ? undefined : form.branchId } }), [['admin', 'users']], () => setOpen(false))}>
        <Field label={t('common.name')} required>{(id) => <Input id={id} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required />}</Field>
        <Field label={t('common.phone')} required>{(id) => <Input id={id} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} required />}</Field>
        <Field label={t('admin.password')} hint={t('auth.rule')} required>{(id) => <Input id={id} value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required />}</Field>
        <Field label={t('admin.role')}>{(id) => <Select id={id} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>{roles.map((r) => <option key={r} value={r}>{t(`roles.${r}`)}</option>)}</Select>}</Field>
        {sa && form.role !== 'SUPER_ADMIN' && <Field label={t('common.branch')}>{(id) => <BranchSelect id={id} value={form.branchId} onChange={(v) => setForm({ ...form, branchId: v })} branches={boot.data?.branches ?? []} allLabel="—" />}</Field>}
      </FormModal>
      <FormModal open={!!reset} title={`${t('admin.resetPassword')}: ${reset?.name ?? ''}`} onClose={() => setReset(null)} busy={s.busy} error={s.error}
        onSave={() => s.run(() => api(`/users/${reset!.id}/reset-password`, { method: 'POST', body: { password: pw } }), [['admin', 'users']], () => setReset(null))}>
        <Field label={t('admin.password')} hint={t('auth.rule')} required>{(id) => <Input id={id} value={pw} onChange={(e) => setPw(e.target.value)} required />}</Field>
      </FormModal>
    </Card>
  );
}

// ------------------------------------------------------------------ drivers

function Drivers() {
  const { t } = useI18n();
  const list = useQuery({ queryKey: ['drivers'], queryFn: () => api<Driver[]>('/drivers') });
  const s = useSaver();
  const [edit, setEdit] = useState<Partial<Driver> | null>(null);
  return (
    <Card title={t('admin.drivers')} actions={<Button size="sm" onClick={() => setEdit({ name: '', phone: '', licenseNo: '' })}>+ {t('common.add')}</Button>}>
      {list.isLoading ? <Loading /> : (
        <Table head={[t('common.name'), t('common.phone'), t('admin.license'), t('common.status'), '']} empty={!list.data?.length}>
          {list.data?.map((d) => (
            <tr key={d.id}>
              <Td className="font-semibold">{d.name}</Td><Td>{phone(d.phone)}</Td><Td>{d.licenseNo ?? '—'}</Td>
              <Td>{d.isActive ? <Badge tone="green">{t('common.active')}</Badge> : <Badge tone="red">{t('common.inactive')}</Badge>}</Td>
              <Td><Button size="sm" variant="ghost" onClick={() => setEdit(d)}>{t('common.edit')}</Button></Td>
            </tr>
          ))}
        </Table>
      )}
      <FormModal open={!!edit} title={t('admin.drivers')} onClose={() => setEdit(null)} busy={s.busy} error={s.error}
        onSave={() => s.run(() => edit?.id
          ? api(`/drivers/${edit.id}`, { method: 'PATCH', body: { name: edit.name, phone: edit.phone, licenseNo: edit.licenseNo || undefined, isActive: edit.isActive } })
          : api('/drivers', { method: 'POST', body: { name: edit?.name, phone: edit?.phone, licenseNo: edit?.licenseNo || undefined } }), [['drivers']], () => setEdit(null))}>
        <Field label={t('common.name')} required>{(id) => <Input id={id} value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />}</Field>
        <Field label={t('common.phone')} required>{(id) => <Input id={id} value={edit?.phone ?? ''} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} required />}</Field>
        <Field label={t('admin.license')}>{(id) => <Input id={id} value={edit?.licenseNo ?? ''} onChange={(e) => setEdit({ ...edit, licenseNo: e.target.value })} />}</Field>
        {edit?.id && <Checkbox label={t('common.active')} checked={!!edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} />}
      </FormModal>
    </Card>
  );
}

// ------------------------------------------------------------------ branches (incl. Zaad/eDahab numbers)

function Branches() {
  const { t } = useI18n();
  const list = useQuery({ queryKey: ['admin', 'branches'], queryFn: () => api<Branch[]>('/branches') });
  const s = useSaver();
  const [edit, setEdit] = useState<(Partial<Branch> & { phonesText?: string }) | null>(null);
  const save = () => {
    const body = { code: edit?.code, name: edit?.name, city: edit?.city, phones: (edit?.phonesText ?? '').split(',').map((x) => x.trim()).filter(Boolean), zaadNumber: edit?.zaadNumber || undefined, edahabNumber: edit?.edahabNumber || undefined };
    return s.run(() => (edit?.id ? api(`/branches/${edit.id}`, { method: 'PATCH', body }) : api('/branches', { method: 'POST', body })), [['admin', 'branches'], ['bootstrap']], () => setEdit(null));
  };
  return (
    <Card title={t('admin.branches')} actions={<Button size="sm" onClick={() => setEdit({ phonesText: '' })}>+ {t('common.add')}</Button>}>
      <Table head={[t('admin.code'), t('common.name'), t('admin.city'), t('common.phone'), t('admin.zaadNumber'), t('admin.edahabNumber'), '']} empty={!list.data?.length}>
        {list.data?.map((b) => (
          <tr key={b.id}>
            <Td className="font-mono font-bold">{b.code}</Td><Td className="font-semibold">{b.name}</Td><Td>{b.city}</Td><Td className="whitespace-normal">{b.phones.join(', ')}</Td>
            <Td>{b.zaadNumber ?? <span className="text-red-600">—</span>}</Td><Td>{b.edahabNumber ?? '—'}</Td>
            <Td><Button size="sm" variant="ghost" onClick={() => setEdit({ ...b, phonesText: b.phones.join(', ') })}>{t('common.edit')}</Button></Td>
          </tr>
        ))}
      </Table>
      <FormModal open={!!edit} title={t('admin.branches')} onClose={() => setEdit(null)} busy={s.busy} error={s.error} onSave={save}>
        <div className="grid grid-cols-3 gap-2">
          <Field label={t('admin.code')} required>{(id) => <Input id={id} value={edit?.code ?? ''} maxLength={3} onChange={(e) => setEdit({ ...edit, code: e.target.value.toUpperCase() })} required />}</Field>
          <div className="col-span-2"><Field label={t('common.name')} required>{(id) => <Input id={id} value={edit?.name ?? ''} onChange={(e) => setEdit({ ...edit, name: e.target.value })} required />}</Field></div>
        </div>
        <Field label={t('admin.city')} required>{(id) => <Input id={id} value={edit?.city ?? ''} onChange={(e) => setEdit({ ...edit, city: e.target.value })} required />}</Field>
        <Field label={t('common.phone')} hint="610700, 063-4500038">{(id) => <Input id={id} value={edit?.phonesText ?? ''} onChange={(e) => setEdit({ ...edit, phonesText: e.target.value })} />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('admin.zaadNumber')}>{(id) => <Input id={id} value={edit?.zaadNumber ?? ''} onChange={(e) => setEdit({ ...edit, zaadNumber: e.target.value })} />}</Field>
          <Field label={t('admin.edahabNumber')}>{(id) => <Input id={id} value={edit?.edahabNumber ?? ''} onChange={(e) => setEdit({ ...edit, edahabNumber: e.target.value })} />}</Field>
        </div>
      </FormModal>
    </Card>
  );
}

// ------------------------------------------------------------------ routes & prices

function Routes() {
  const { t } = useI18n();
  const boot = useBootstrap();
  const list = useQuery({ queryKey: ['admin', 'routes'], queryFn: () => api<Route[]>('/routes') });
  const s = useSaver();
  const [edit, setEdit] = useState<{ id?: string; fromBranchId: string; toBranchId: string; ticket: string; front: string; perKg: string; min: string; isActive?: boolean } | null>(null);
  const save = () => {
    const prices = { ticketPriceCents: parseUsd(edit!.ticket) ?? 0, frontSeatSurchargeCents: parseUsd(edit!.front || '0') ?? 0, parcelPerKgCents: parseUsd(edit!.perKg) ?? 0, parcelMinFeeCents: parseUsd(edit!.min || '0') ?? 0 };
    return s.run(() => (edit?.id ? api(`/routes/${edit.id}`, { method: 'PATCH', body: { ...prices, isActive: edit.isActive } }) : api('/routes', { method: 'POST', body: { fromBranchId: edit!.fromBranchId, toBranchId: edit!.toBranchId, ...prices } })), [['admin', 'routes'], ['bootstrap']], () => setEdit(null));
  };
  return (
    <Card title={t('admin.routes')} actions={<Button size="sm" onClick={() => setEdit({ fromBranchId: '', toBranchId: '', ticket: '', front: '0', perKg: '', min: '0' })}>+ {t('common.add')}</Button>}>
      <Table head={[t('trips.route'), t('admin.ticketPrice'), t('admin.frontSurcharge'), t('admin.perKg'), t('admin.minFee'), t('common.status'), '']} empty={!list.data?.length}>
        {list.data?.map((r) => (
          <tr key={r.id}>
            <Td className="font-semibold">{r.fromBranch?.name} → {r.toBranch?.name}</Td>
            <Td>{usd(r.ticketPriceCents)}</Td><Td>{usd(r.frontSeatSurchargeCents)}</Td><Td>{usd(r.parcelPerKgCents)}</Td><Td>{usd(r.parcelMinFeeCents)}</Td>
            <Td>{r.isActive ? <Badge tone="green">{t('common.active')}</Badge> : <Badge tone="red">{t('common.inactive')}</Badge>}</Td>
            <Td><Button size="sm" variant="ghost" onClick={() => setEdit({ id: r.id, fromBranchId: r.fromBranchId, toBranchId: r.toBranchId, ticket: centsToInput(r.ticketPriceCents), front: centsToInput(r.frontSeatSurchargeCents), perKg: centsToInput(r.parcelPerKgCents), min: centsToInput(r.parcelMinFeeCents), isActive: r.isActive })}>{t('common.edit')}</Button></Td>
          </tr>
        ))}
      </Table>
      <FormModal open={!!edit} title={t('admin.routes')} onClose={() => setEdit(null)} busy={s.busy} error={s.error} onSave={save}>
        {!edit?.id && (
          <div className="grid grid-cols-2 gap-2">
            <Field label={t('common.from')} required>{(id) => <BranchSelect id={id} value={edit?.fromBranchId ?? ''} onChange={(v) => setEdit({ ...edit!, fromBranchId: v })} branches={boot.data?.branches ?? []} allLabel="—" />}</Field>
            <Field label={t('common.to')} required>{(id) => <BranchSelect id={id} value={edit?.toBranchId ?? ''} onChange={(v) => setEdit({ ...edit!, toBranchId: v })} branches={boot.data?.branches ?? []} allLabel="—" />}</Field>
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('admin.ticketPrice')} required>{(id) => <Input id={id} inputMode="decimal" value={edit?.ticket ?? ''} onChange={(e) => setEdit({ ...edit!, ticket: e.target.value })} required />}</Field>
          <Field label={t('admin.frontSurcharge')}>{(id) => <Input id={id} inputMode="decimal" value={edit?.front ?? ''} onChange={(e) => setEdit({ ...edit!, front: e.target.value })} />}</Field>
          <Field label={t('admin.perKg')} required>{(id) => <Input id={id} inputMode="decimal" value={edit?.perKg ?? ''} onChange={(e) => setEdit({ ...edit!, perKg: e.target.value })} required />}</Field>
          <Field label={t('admin.minFee')}>{(id) => <Input id={id} inputMode="decimal" value={edit?.min ?? ''} onChange={(e) => setEdit({ ...edit!, min: e.target.value })} />}</Field>
        </div>
        {edit?.id && <Checkbox label={t('common.active')} checked={!!edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} />}
      </FormModal>
    </Card>
  );
}

// ------------------------------------------------------------------ vehicles (seat layout)

const HIACE_14 = { rows: [['D', null, '1', '2'], ['3', '4', null, '5'], ['6', '7', null, '8'], ['9', '10', null, '11'], ['12', '13', '14', null]], front: ['1', '2'] };

function Vehicles() {
  const { t } = useI18n();
  const list = useQuery({ queryKey: ['vehicles'], queryFn: () => api<Vehicle[]>('/vehicles') });
  const s = useSaver();
  const [edit, setEdit] = useState<{ id?: string; plate: string; model: string; layout: string; isActive?: boolean } | null>(null);
  const save = () => {
    let seatLayout: unknown;
    try {
      seatLayout = JSON.parse(edit!.layout);
    } catch {
      return s.setError(t('errors.VALIDATION_ERROR'));
    }
    return s.run(() => (edit?.id ? api(`/vehicles/${edit.id}`, { method: 'PATCH', body: { model: edit.model, seatLayout, isActive: edit.isActive } }) : api('/vehicles', { method: 'POST', body: { plate: edit!.plate, model: edit!.model, seatLayout } })), [['vehicles']], () => setEdit(null));
  };
  return (
    <Card title={t('admin.vehicles')} actions={<Button size="sm" onClick={() => setEdit({ plate: '', model: 'Toyota Hiace', layout: JSON.stringify(HIACE_14) })}>+ {t('common.add')}</Button>}>
      <Table head={[t('admin.plate'), t('admin.model'), t('admin.capacity'), t('common.status'), '']} empty={!list.data?.length}>
        {list.data?.map((v) => (
          <tr key={v.id}>
            <Td className="font-mono font-bold">{v.plate}</Td><Td>{v.model}</Td><Td>{v.capacity}</Td>
            <Td>{v.isActive ? <Badge tone="green">{t('common.active')}</Badge> : <Badge tone="red">{t('common.inactive')}</Badge>}</Td>
            <Td><Button size="sm" variant="ghost" onClick={() => setEdit({ id: v.id, plate: v.plate, model: v.model, layout: JSON.stringify(v.seatLayout), isActive: v.isActive })}>{t('common.edit')}</Button></Td>
          </tr>
        ))}
      </Table>
      <FormModal open={!!edit} title={t('admin.vehicles')} onClose={() => setEdit(null)} busy={s.busy} error={s.error} onSave={save}>
        <Field label={t('admin.plate')} required>{(id) => <Input id={id} value={edit?.plate ?? ''} disabled={!!edit?.id} onChange={(e) => setEdit({ ...edit!, plate: e.target.value })} required />}</Field>
        <Field label={t('admin.model')} required>{(id) => <Input id={id} value={edit?.model ?? ''} onChange={(e) => setEdit({ ...edit!, model: e.target.value })} required />}</Field>
        <Field label="Seat layout (JSON)" hint='"D" = darawal, null = marin'>{(id) => <Textarea id={id} rows={5} className="font-mono text-xs" value={edit?.layout ?? ''} onChange={(e) => setEdit({ ...edit!, layout: e.target.value })} />}</Field>
        {edit?.id && <Checkbox label={t('common.active')} checked={!!edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} />}
      </FormModal>
    </Card>
  );
}

// ------------------------------------------------------------------ parcel categories

function Categories() {
  const { t } = useI18n();
  const list = useQuery({ queryKey: ['admin', 'categories'], queryFn: () => api<Category[]>('/parcel-categories') });
  const s = useSaver();
  const [edit, setEdit] = useState<{ id?: string; nameSo: string; nameEn: string; base: string; mult: string; isProhibited: boolean; isActive?: boolean } | null>(null);
  const save = () => {
    const body = { nameSo: edit!.nameSo, nameEn: edit!.nameEn, baseFeeCents: parseUsd(edit!.base) ?? 0, perKgMultiplier: Number(edit!.mult), isProhibited: edit!.isProhibited, ...(edit?.id && { isActive: edit.isActive }) };
    return s.run(() => (edit?.id ? api(`/parcel-categories/${edit.id}`, { method: 'PATCH', body }) : api('/parcel-categories', { method: 'POST', body })), [['admin', 'categories'], ['bootstrap']], () => setEdit(null));
  };
  return (
    <Card title={t('admin.categories')} actions={<Button size="sm" onClick={() => setEdit({ nameSo: '', nameEn: '', base: '1.00', mult: '1', isProhibited: false })}>+ {t('common.add')}</Button>}>
      <Table head={[t('common.name'), 'English', t('admin.baseFee'), t('admin.multiplier'), '', '']} empty={!list.data?.length}>
        {list.data?.map((c) => (
          <tr key={c.id}>
            <Td className="font-semibold">{c.nameSo}</Td><Td>{c.nameEn}</Td><Td>{usd(c.baseFeeCents)}</Td><Td>×{String(c.perKgMultiplier)}</Td>
            <Td>{c.isProhibited && <Badge tone="red">⛔ {t('admin.prohibited')}</Badge>}{!c.isActive && <Badge>{t('common.inactive')}</Badge>}</Td>
            <Td><Button size="sm" variant="ghost" onClick={() => setEdit({ id: c.id, nameSo: c.nameSo, nameEn: c.nameEn, base: centsToInput(c.baseFeeCents), mult: String(c.perKgMultiplier), isProhibited: c.isProhibited, isActive: c.isActive })}>{t('common.edit')}</Button></Td>
          </tr>
        ))}
      </Table>
      <FormModal open={!!edit} title={t('admin.categories')} onClose={() => setEdit(null)} busy={s.busy} error={s.error} onSave={save}>
        <Field label={t('common.name')} required>{(id) => <Input id={id} value={edit?.nameSo ?? ''} onChange={(e) => setEdit({ ...edit!, nameSo: e.target.value })} required />}</Field>
        <Field label="English" required>{(id) => <Input id={id} value={edit?.nameEn ?? ''} onChange={(e) => setEdit({ ...edit!, nameEn: e.target.value })} required />}</Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label={t('admin.baseFee')}>{(id) => <Input id={id} inputMode="decimal" value={edit?.base ?? ''} onChange={(e) => setEdit({ ...edit!, base: e.target.value })} />}</Field>
          <Field label={t('admin.multiplier')}>{(id) => <Input id={id} inputMode="decimal" value={edit?.mult ?? ''} onChange={(e) => setEdit({ ...edit!, mult: e.target.value })} />}</Field>
        </div>
        <Checkbox label={`⛔ ${t('admin.prohibited')}`} checked={!!edit?.isProhibited} onChange={(v) => setEdit({ ...edit!, isProhibited: v })} />
        {edit?.id && <Checkbox label={t('common.active')} checked={!!edit.isActive} onChange={(v) => setEdit({ ...edit, isActive: v })} />}
      </FormModal>
    </Card>
  );
}

// ------------------------------------------------------------------ settings: rate, pricing, company

function Settings() {
  const { t } = useI18n();
  const boot = useBootstrap();
  const s = useSaver();
  const [rate, setRate] = useState('');
  const [p, setP] = useState<Record<string, string>>({});
  const [company, setCompany] = useState<Company | null>(null);
  const [ok, setOk] = useState('');

  useEffect(() => {
    if (!boot.data) return;
    setRate(String(boot.data.exchangeRate?.usdToSlsh ?? ''));
    const st = boot.data.settings as Record<string, number>;
    setP(Object.fromEntries(Object.entries(st).map(([k, v]) => [k, String(v)])));
    setCompany(boot.data.company);
  }, [boot.data]);

  const done = () => setOk(t('common.saved'));
  if (!boot.data || !company) return <Loading />;
  const NUM_FIELDS = ['fragileSurchargeCents', 'insuranceBps', 'maxDiscountBps', 'seatHoldSeconds', 'uncollectedDays', 'storageFeePerDayCents', 'shareTripsWithinCity', 'reservationCutoffMinutes', 'maxReservationsPerPhone'];

  return (
    <div className="flex flex-col gap-4">
      {ok && <Alert tone="green">{ok}</Alert>}
      {s.error && <Alert>{s.error}</Alert>}
      <Card title={t('admin.rate')}>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); s.run(() => api('/exchange-rates/today', { method: 'PUT', body: { usdToSlsh: Number(rate) } }), [['bootstrap']], done); }}>
          <Input inputMode="numeric" value={rate} onChange={(e) => setRate(e.target.value)} className="max-w-48" />
          <Button type="submit" loading={s.busy}>{t('common.save')}</Button>
        </form>
      </Card>
      <Card title={t('admin.settings')}>
        <form className="grid gap-3 sm:grid-cols-3" onSubmit={(e) => { e.preventDefault(); s.run(() => api('/pricing-settings', { method: 'PUT', body: Object.fromEntries(NUM_FIELDS.filter((k) => p[k] !== undefined && p[k] !== '').map((k) => [k, Number(p[k])])) }), [['bootstrap']], done); }}>
          {NUM_FIELDS.map((k) => <Field key={k} label={k}>{(id) => <Input id={id} inputMode="numeric" value={p[k] ?? ''} onChange={(e) => setP({ ...p, [k]: e.target.value })} />}</Field>)}
          <div className="sm:col-span-3"><Button type="submit" loading={s.busy}>{t('common.save')}</Button></div>
        </form>
      </Card>
      <Card title={t('admin.company')}>
        <form className="flex flex-col gap-3" onSubmit={(e) => { e.preventDefault(); s.run(() => api('/company', { method: 'PUT', body: company }), [['bootstrap']], done); }}>
          <Field label={t('common.name')}>{(id) => <Input id={id} value={company.name} onChange={(e) => setCompany({ ...company, name: e.target.value })} />}</Field>
          <Field label="Tagline">{(id) => <Input id={id} value={company.tagline} onChange={(e) => setCompany({ ...company, tagline: e.target.value })} />}</Field>
          <Field label="Mission">{(id) => <Textarea id={id} value={company.mission} onChange={(e) => setCompany({ ...company, mission: e.target.value })} />}</Field>
          <Field label="Parcel rules (1 line = 1 rule)">{(id) => <Textarea id={id} rows={5} value={company.parcelRules.join('\n')} onChange={(e) => setCompany({ ...company, parcelRules: e.target.value.split('\n').filter(Boolean) })} />}</Field>
          <Field label="Receipt footer">{(id) => <Input id={id} value={company.receiptFooter} onChange={(e) => setCompany({ ...company, receiptFooter: e.target.value })} />}</Field>
          <Button type="submit" loading={s.busy}>{t('common.save')}</Button>
        </form>
      </Card>
    </div>
  );
}
