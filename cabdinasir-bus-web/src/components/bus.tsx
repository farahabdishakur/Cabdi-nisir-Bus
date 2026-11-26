import { phone } from '@/lib/format';
import { cx } from '@/lib/format';

/** Lambarka baska (albaabka ku qoran: "02", "13", "3G") — calaamad cas */
export function BusNo({ no, size = 'md' }: { no?: string | null; size?: 'md' | 'lg' }) {
  if (!no) return null;
  return <span className={cx('inline-flex shrink-0 items-center justify-center rounded-lg bg-red-600 font-black text-white', size === 'lg' ? 'min-w-12 px-2 py-1 text-2xl' : 'min-w-9 px-1.5 py-0.5 text-sm')}>{no}</span>;
}

/** 🧑‍✈️ Darawalka + taleefankiisa (riix → wac) */
export function DriverLine({ name, phone: tel, extra, small }: { name: string; phone?: string | null; extra?: string; small?: boolean }) {
  return (
    <p className={cx('text-gray-600', small ? 'truncate text-xs' : 'text-sm')}>
      🧑‍✈️ <b className="text-gray-800">{name}</b>
      {tel && <> · <a href={`tel:${tel}`} className="font-semibold text-blue-700 hover:underline">📞 {phone(tel)}</a></>}
      {extra ? ` · ${extra}` : ''}
    </p>
  );
}
