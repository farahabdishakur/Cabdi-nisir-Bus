'use client';

import { useEffect, useState } from 'react';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { Button, Input, Select, Spinner } from '@/components/ui';

/**
 * Buugga tigidhada warqadda (gacanta lagu qoro): A4, 4 tigidh boggii. Tigidh kasta:
 * - bidix: NUQULKA BUUGGA (stub) — buugga ayuu ku harayaa (xisaab celin: lambar kasta waa inuu nidaamka ku jiraa)
 * - midig: tigidhka rakaabka — lambar taxane ah (BO1-1001…), magaca, gaariga, kursiga, waqtiga, lacagta
 * Daabacaha (print shop) ama printer A4 xafiiska. Lambarka waxaa la geliyaa nidaamka marka la iibiyo.
 */
export default function BlankTicketsPage() {
  const { t } = useI18n();
  const { user, loading } = useAuth();
  const boot = useBootstrap();
  const [prefix, setPrefix] = useState('');
  const [from, setFrom] = useState(1001);
  const [count, setCount] = useState(40);
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    if (q.get('prefix')) setPrefix(q.get('prefix')!.toUpperCase());
    if (q.get('from')) setFrom(Math.max(1, Number(q.get('from')) || 1));
    if (q.get('count')) setCount(Math.min(400, Math.max(1, Number(q.get('count')) || 40)));
  }, []);
  const branches = boot.data?.branches ?? [];
  useEffect(() => {
    if (!prefix && branches.length) setPrefix((branches.find((b) => b.id === user?.branchId) ?? branches[0]).code);
  }, [prefix, branches, user?.branchId]);

  if (loading || !boot.data) return <div className="p-6"><Spinner /></div>;
  if (!user) return <p className="p-6">{t('errors.SESSION_REVOKED')}</p>;
  const c = boot.data.company;
  const branch = branches.find((b) => b.code === prefix);
  const cities = [...new Set(branches.map((b) => b.city))];
  const numbers = Array.from({ length: count }, (_, i) => `${prefix}-${from + i}`);

  return (
    <div className="bg-white">
      <style>{CSS}</style>
      <div className="no-print flex flex-wrap items-end gap-3 border-b border-gray-200 p-4">
        <label className="flex flex-col text-xs font-semibold text-gray-600">{t('common.branch')}
          <Select value={prefix} onChange={(e) => setPrefix(e.target.value)} className="mt-1 w-56">
            {branches.map((b) => <option key={b.id} value={b.code}>{b.name} ({b.code})</option>)}
          </Select>
        </label>
        <label className="flex flex-col text-xs font-semibold text-gray-600">{t('paper.from')}
          <Input type="number" min={1} value={from} onChange={(e) => setFrom(Math.max(1, Number(e.target.value) || 1))} className="mt-1 w-32" />
        </label>
        <label className="flex flex-col text-xs font-semibold text-gray-600">{t('paper.count')}
          <Input type="number" min={4} max={400} step={4} value={count} onChange={(e) => setCount(Math.min(400, Math.max(1, Number(e.target.value) || 4)))} className="mt-1 w-28" />
        </label>
        <Button onClick={() => window.print()}>🖨 {t('common.print')} ({Math.ceil(count / 4)} {t('paper.pages')})</Button>
        <p className="max-w-md text-xs text-gray-500">{t('paper.printHint', { first: numbers[0] ?? '', last: numbers[numbers.length - 1] ?? '' })}</p>
      </div>
      <div className="sheet">
        {numbers.map((no) => (
          <div key={no} className="pt">
            <div className="stub">
              <p className="stub-title">{t('paper.stub')}</p>
              <p className="no">№ {no}</p>
              <p className="f"><span>{t('voucher.date')}</span><i /></p>
              <p className="f"><span>{t('paper.nameShort')}</span><i /></p>
              <p className="f"><span>{t('voucher.vehicle')}</span><i /></p>
              <p className="f"><span>{t('voucher.seat')}</span><i /></p>
              <p className="f"><span>{t('voucher.amount')}</span><i /></p>
              <p className="f"><span>{t('paper.sys')}</span><i /></p>
            </div>
            <div className="cut" aria-hidden>✂</div>
            <div className="main">
              <div className="head">
                <div className="brand">
                  {c.logoUrl
                    // eslint-disable-next-line @next/next/no-img-element
                    ? <img src={c.logoUrl} alt="" className="logo" />
                    : <span className="logo badge">CB</span>}
                  <div>
                    <p className="bn">{c.name.toUpperCase()}</p>
                    <p className="tag">{(c.tagline || 'Transportation & Logistics').toUpperCase()}</p>
                    <p className="tel">Tel: {(branch?.phones ?? []).join(' / ')}</p>
                  </div>
                </div>
                <div className="title">
                  <p>{t('paper.ticketTitle')}</p>
                  <p className="sub">PASSENGER TICKET</p>
                  <p className="no big">№ {no}</p>
                </div>
              </div>
              <div className="body">
                <div className="fields">
                  <div className="row">
                    <p className="f"><span>{t('voucher.date')}</span><i /></p>
                    <p className="f"><span>{t('voucher.time')}</span><i /></p>
                  </div>
                  <p className="f"><span>{t('voucher.customer')}</span><i /></p>
                  <div className="row">
                    <p className="f"><span>{t('voucher.phone')}</span><i /></p>
                    <p className="f"><span>{t('voucher.vehicle')}</span><i /></p>
                  </div>
                  <div className="row">
                    <p className="f chk"><span>{t('voucher.from')}</span>{cities.map((x) => <b key={x}>☐ {x}</b>)}</p>
                    <p className="f chk"><span>{t('voucher.to')}</span>{cities.map((x) => <b key={x}>☐ {x}</b>)}</p>
                  </div>
                  <div className="row">
                    <p className="f chk"><span>{t('voucher.amount')}</span><i className="short" />$ <b>☐ Cash</b><b>☐ Zaad</b><b>☐ eDahab</b></p>
                  </div>
                  <p className="f"><span>{t('voucher.signature')}</span><i /></p>
                </div>
                <div className="seat">
                  <p>{t('voucher.seat').toUpperCase()}</p>
                  <div className="box" />
                </div>
              </div>
              <p className="rules">{c.passengerRules.slice(0, 3).map((r, i) => `${i + 1}. ${r}`).join('  ')} · {c.receiptFooter}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

const CSS = `
.sheet { padding: 8mm; display: flex; flex-direction: column; gap: 4mm; align-items: center; }
.pt { width: 194mm; height: 64mm; display: flex; border: 1.6px solid #0b2f7a; border-radius: 3mm; color: #0b2f7a; font-family: Arial, Helvetica, sans-serif; overflow: hidden; break-inside: avoid; background: #fff; }
.stub { width: 44mm; padding: 2.5mm 3mm; display: flex; flex-direction: column; gap: 1.2mm; background: #f3f6ff; }
.stub-title { font-size: 2.6mm; font-weight: 800; letter-spacing: .3mm; text-align: center; border-bottom: 1px solid #0b2f7a; padding-bottom: .8mm; }
.cut { width: 4mm; border-left: 1.4px dashed #0b2f7a; position: relative; font-size: 3.4mm; display: flex; align-items: center; justify-content: center; color: #0b2f7a; }
.main { flex: 1; padding: 2.5mm 4mm 2mm 2mm; display: flex; flex-direction: column; }
.head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 1.4px solid #0b2f7a; padding-bottom: 1.5mm; }
.brand { display: flex; gap: 2mm; align-items: center; }
.logo { width: 11mm; height: 11mm; object-fit: contain; }
.badge { display: flex; align-items: center; justify-content: center; border-radius: 50%; background: #c8102e; color: #fff; font-weight: 900; font-size: 4mm; }
.bn { font-family: Impact, 'Arial Black', sans-serif; font-weight: 900; font-size: 6mm; line-height: 1; letter-spacing: .2mm; }
.tag { font-size: 2.3mm; font-weight: 800; letter-spacing: .4mm; margin-top: .5mm; }
.tel { font-size: 2.4mm; font-weight: 700; margin-top: .4mm; }
.title { text-align: right; font-weight: 900; font-size: 3.4mm; }
.title .sub { font-size: 2.2mm; letter-spacing: .5mm; font-weight: 700; }
.no { font-family: 'Courier New', monospace; font-weight: 900; color: #c8102e; font-size: 3.6mm; }
.no.big { font-size: 5mm; margin-top: .6mm; }
.body { flex: 1; display: flex; gap: 3mm; padding-top: 1.5mm; }
.fields { flex: 1; display: flex; flex-direction: column; gap: 1.4mm; }
.row { display: flex; gap: 4mm; }
.row > .f { flex: 1; }
.f { display: flex; align-items: flex-end; gap: 1.5mm; font-size: 2.8mm; font-weight: 700; white-space: nowrap; }
.f > span::after { content: ':'; }
.f > i { flex: 1; border-bottom: 1px dotted #0b2f7a; height: 3.6mm; }
.f > i.short { flex: 0 0 14mm; }
.chk b { font-weight: 700; margin-left: 1.5mm; }
.seat { width: 22mm; display: flex; flex-direction: column; align-items: center; font-weight: 900; font-size: 3mm; }
.seat .box { margin-top: 1mm; width: 22mm; flex: 1; border: 2px solid #0b2f7a; border-radius: 2mm; }
.rules { font-size: 2.1mm; margin-top: 1.2mm; opacity: .85; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
@media print {
  @page { size: A4; margin: 6mm; }
  .sheet { padding: 0; gap: 3mm; }
  .pt { page-break-inside: avoid; }
  .pt:nth-child(4n) { break-after: page; }
  .stub { background: #f3f6ff; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .badge { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}
`;
