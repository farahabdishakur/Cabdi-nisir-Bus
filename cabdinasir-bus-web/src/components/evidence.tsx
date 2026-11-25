'use client';

import { useEffect, useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, fetchBlobUrl, uploadWithProgress } from '@/lib/api';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useBootstrap } from '@/lib/queries';
import { cx, dateTime } from '@/lib/format';
import type { MediaStage, ParcelMedia, ParcelStatus } from '@/lib/types';
import { Alert, Badge, Modal, Select, Spinner } from './ui';

export const STAGES: MediaStage[] = ['REGISTER', 'LOAD', 'ARRIVE', 'DELIVER', 'DAMAGE', 'CLAIM', 'OTHER'];
const STAGE_FOR: Partial<Record<ParcelStatus, MediaStage>> = { REGISTERED: 'REGISTER', LOADED: 'LOAD', IN_TRANSIT: 'LOAD', ARRIVED: 'ARRIVE', DELIVERED: 'DELIVER', DAMAGED: 'DAMAGE' };
const MAX_VIDEO_MB = 40;
const STAGE_TONE: Record<MediaStage, 'gray' | 'blue' | 'green' | 'yellow' | 'red' | 'navy'> = {
  REGISTER: 'navy', LOAD: 'blue', ARRIVE: 'blue', DELIVER: 'green', DAMAGE: 'red', CLAIM: 'yellow', OTHER: 'gray',
};

export const mediaQueryKey = (parcelId: string) => ['evidence', parcelId];
export const useParcelMedia = (parcelId: string | undefined) =>
  useQuery({ queryKey: mediaQueryKey(parcelId ?? ''), queryFn: () => api<ParcelMedia[]>(`/parcels/${parcelId}/media`), enabled: !!parcelId });

/**
 * Sawirka: la yareeyo (1600px, JPEG) si internet gaabis ah ugu shaqeeyo + calaamad (koodhka, waqtiga, laanta, cidda)
 * lagu daabaco hoosta — sawir kale looma isticmaali karo alaab kale.
 */
async function prepareImage(file: File, stamp: string[]): Promise<Blob> {
  try {
    const bmp = await createImageBitmap(file);
    const scale = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
    const w = Math.round(bmp.width * scale);
    const h = Math.round(bmp.height * scale);
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d');
    if (!ctx) return file;
    ctx.drawImage(bmp, 0, 0, w, h);
    const fs = Math.max(14, Math.round(w / 45));
    const bar = fs * (stamp.length + 0.8);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, h - bar, w, bar);
    ctx.fillStyle = '#fff';
    ctx.font = `bold ${fs}px Arial, sans-serif`;
    stamp.forEach((line, i) => ctx.fillText(line, fs * 0.6, h - bar + fs * (i + 1.1)));
    const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, 'image/jpeg', 0.82));
    return blob ?? file;
  } catch {
    return file;
  }
}

/** Badhamada 📷 / 🎥 (taleefanka: kamaradda ayaa toos u furanta) + horumarka soo gelinta */
export function EvidenceCapture({ parcelId, trackingCode, stage, claimId, onDone, compact }: { parcelId: string; trackingCode: string; stage: MediaStage; claimId?: string; onDone?: (m: ParcelMedia) => void; compact?: boolean }) {
  const { t, err } = useI18n();
  const { user } = useAuth();
  const boot = useBootstrap();
  const qc = useQueryClient();
  const [pct, setPct] = useState<number | null>(null);
  const [error, setError] = useState('');
  const [note, setNote] = useState('');
  const branch = boot.data?.branches.find((b) => b.id === user?.branchId);

  const send = async (files: FileList | null, kind: 'PHOTO' | 'VIDEO') => {
    if (!files?.length) return;
    setError('');
    for (const file of Array.from(files)) {
      if (kind === 'VIDEO' && file.size > MAX_VIDEO_MB * 1024 * 1024) {
        setError(t('evidence.videoTooBig', { mb: MAX_VIDEO_MB }));
        continue;
      }
      const body = kind === 'PHOTO'
        ? await prepareImage(file, [`${trackingCode} · ${t(`evidence.stage.${stage}`)}`, `${dateTime(new Date())} · ${branch?.code ?? ''} · ${user?.name ?? ''}`])
        : file;
      const form = new FormData();
      form.append('stage', stage);
      if (claimId) form.append('claimId', claimId);
      if (note.trim()) form.append('note', note.trim());
      form.append('file', body, kind === 'PHOTO' ? `${trackingCode}.jpg` : file.name);
      setPct(0);
      try {
        const m = await uploadWithProgress<ParcelMedia>(`/parcels/${parcelId}/media`, form, setPct);
        onDone?.(m);
        qc.invalidateQueries({ queryKey: mediaQueryKey(parcelId) });
        qc.invalidateQueries({ queryKey: ['claims'] });
      } catch (e) {
        setError(err(e));
      } finally {
        setPct(null);
      }
    }
    setNote('');
  };

  const btn = 'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg border px-4 text-sm font-semibold';
  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <label className={cx(btn, 'border-navy bg-navy text-white hover:opacity-90', pct !== null && 'pointer-events-none opacity-50')}>
          📷 {t('evidence.takePhoto')}
          <input type="file" accept="image/*" capture="environment" multiple className="hidden" onChange={(e) => { void send(e.target.files, 'PHOTO'); e.target.value = ''; }} />
        </label>
        <label className={cx(btn, 'border-gray-300 bg-white hover:bg-gray-50', pct !== null && 'pointer-events-none opacity-50')}>
          🎥 {t('evidence.takeVideo')}
          <input type="file" accept="video/*" capture="environment" className="hidden" onChange={(e) => { void send(e.target.files, 'VIDEO'); e.target.value = ''; }} />
        </label>
        {!compact && <input className="min-h-11 flex-1 rounded-lg border border-gray-300 px-3 text-sm" placeholder={t('evidence.notePlaceholder')} value={note} onChange={(e) => setNote(e.target.value)} />}
      </div>
      {pct !== null && (
        <div className="flex items-center gap-2 text-xs text-gray-600">
          <div className="h-2 flex-1 overflow-hidden rounded-full bg-gray-200"><div className="h-full bg-navy transition-all" style={{ width: `${pct}%` }} /></div>
          <span>{pct}%</span>
        </div>
      )}
      {error && <Alert>{error}</Alert>}
    </div>
  );
}

function Thumb({ m, onOpen }: { m: ParcelMedia; onOpen: () => void }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    if (m.kind !== 'PHOTO') return;
    let url = '';
    let alive = true;
    fetchBlobUrl(`/media/${m.id}`).then((u) => (alive ? setSrc((url = u)) : URL.revokeObjectURL(u))).catch(() => undefined);
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [m.id, m.kind]);
  return (
    <button onClick={onOpen} className="group relative aspect-square w-full overflow-hidden rounded-lg border border-gray-200 bg-gray-100 text-left" title={m.note ?? ''}>
      {m.kind === 'PHOTO'
        // eslint-disable-next-line @next/next/no-img-element
        ? src ? <img src={src} alt={t(`evidence.stage.${m.stage}`)} className="h-full w-full object-cover transition group-hover:scale-105" /> : <span className="flex h-full items-center justify-center"><Spinner small /></span>
        : <span className="flex h-full flex-col items-center justify-center bg-gray-900 text-white"><span className="text-3xl">▶</span><span className="text-[10px]">{(m.sizeBytes / 1048576).toFixed(1)} MB</span></span>}
      <span className="absolute inset-x-0 bottom-0 bg-black/55 px-1.5 py-0.5 text-[10px] text-white">{dateTime(m.createdAt)}</span>
    </button>
  );
}

/** Daawade: sawir/video weyn + xogta caddaynta (waqti, cid, laan, sha256) */
function Viewer({ m, onClose }: { m: ParcelMedia | null; onClose: () => void }) {
  const { t } = useI18n();
  const [src, setSrc] = useState<string | null>(null);
  const prev = useRef('');
  useEffect(() => {
    setSrc(null);
    if (!m) return;
    fetchBlobUrl(`/media/${m.id}`).then((u) => {
      if (prev.current) URL.revokeObjectURL(prev.current);
      prev.current = u;
      setSrc(u);
    }).catch(() => undefined);
  }, [m]);
  useEffect(() => () => { if (prev.current) URL.revokeObjectURL(prev.current); }, []);
  if (!m) return null;
  return (
    <Modal open onClose={onClose} title={`${t(`evidence.stage.${m.stage}`)} · ${dateTime(m.createdAt)}`} wide>
      <div className="flex flex-col gap-3">
        <div className="flex min-h-48 items-center justify-center rounded-lg bg-gray-900">
          {!src ? <Spinner /> : m.kind === 'PHOTO'
            // eslint-disable-next-line @next/next/no-img-element
            ? <img src={src} alt="" className="max-h-[70vh] max-w-full rounded" />
            : <video src={src} controls autoPlay playsInline className="max-h-[70vh] max-w-full rounded" />}
        </div>
        <dl className="grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
          <dt className="text-gray-500">{t('evidence.takenBy')}</dt><dd>{m.takenBy ?? '—'} {m.branchCode && <span className="text-gray-500">({m.branchCode})</span>}</dd>
          <dt className="text-gray-500">{t('evidence.kind')}</dt><dd>{m.kind === 'PHOTO' ? '📷' : '🎥'} {(m.sizeBytes / 1024).toFixed(0)} KB</dd>
          {m.note && <><dt className="text-gray-500">{t('common.note')}</dt><dd className="col-span-1 sm:col-span-3">{m.note}</dd></>}
          <dt className="text-gray-500">{t('evidence.fingerprint')}</dt><dd className="col-span-1 truncate font-mono text-xs sm:col-span-3" title={m.sha256}>{m.sha256}</dd>
        </dl>
        <p className="text-xs text-gray-500">{t('evidence.integrityNote')}</p>
      </div>
    </Modal>
  );
}

/** Sawirada/video-yada oo loo kala qaybiyay marxalad kasta (diiwaangelin → rar → gaadhay → dhiibid) */
export function EvidenceGallery({ media, empty }: { media: ParcelMedia[]; empty?: string }) {
  const { t } = useI18n();
  const [open, setOpen] = useState<ParcelMedia | null>(null);
  const groups = STAGES.map((s) => [s, media.filter((m) => m.stage === s)] as const).filter(([, l]) => l.length);
  if (!media.length) return <p className="text-sm text-gray-500">{empty ?? t('evidence.none')}</p>;
  return (
    <div className="flex flex-col gap-3">
      {groups.map(([s, list]) => (
        <div key={s}>
          <p className="mb-1.5 flex items-center gap-2 text-xs font-semibold uppercase text-gray-500"><Badge tone={STAGE_TONE[s]}>{t(`evidence.stage.${s}`)}</Badge> {list.length}</p>
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4 lg:grid-cols-6">
            {list.map((m) => <Thumb key={m.id} m={m} onOpen={() => setOpen(m)} />)}
          </div>
        </div>
      ))}
      <Viewer m={open} onClose={() => setOpen(null)} />
    </div>
  );
}

/** Qaybta bogga alaabta: marxaladda (default: xaaladda hadda) + soo gelin + gallery */
export function EvidencePanel({ parcel }: { parcel: { id: string; trackingCode: string; status: ParcelStatus } }) {
  const { t } = useI18n();
  const media = useParcelMedia(parcel.id);
  const [stage, setStage] = useState<MediaStage>(STAGE_FOR[parcel.status] ?? 'OTHER');
  useEffect(() => setStage(STAGE_FOR[parcel.status] ?? 'OTHER'), [parcel.status]);
  const has = new Set(media.data?.map((m) => m.stage));
  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-1.5 text-xs">
        {(['REGISTER', 'LOAD', 'ARRIVE', 'DELIVER'] as MediaStage[]).map((s) => (
          <span key={s} className={cx('rounded-full px-2 py-0.5 font-semibold', has.has(s) ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500')}>
            {has.has(s) ? '✓' : '○'} {t(`evidence.stage.${s}`)}
          </span>
        ))}
      </div>
      {parcel.status !== 'VOIDED' && (
        <div className="flex flex-col gap-2 rounded-lg bg-gray-50 p-3">
          <label className="flex items-center gap-2 text-sm">
            <span className="text-gray-600">{t('evidence.stageLabel')}</span>
            <Select value={stage} onChange={(e) => setStage(e.target.value as MediaStage)} className="max-w-52">
              {STAGES.filter((s) => s !== 'CLAIM').map((s) => <option key={s} value={s}>{t(`evidence.stage.${s}`)}</option>)}
            </Select>
          </label>
          <EvidenceCapture parcelId={parcel.id} trackingCode={parcel.trackingCode} stage={stage} />
        </div>
      )}
      {media.isLoading ? <Spinner /> : <EvidenceGallery media={media.data ?? []} />}
    </div>
  );
}

