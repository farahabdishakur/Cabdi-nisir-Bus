'use client';

import { useEffect, useState } from 'react';
import { cx } from '@/lib/format';

/**
 * Logo-ga shirkadda (Admin → Shirkadda → Logo). `src` (bootstrap: `?v=` → cache weligeed) ama `/api/v1/public/logo`
 * (login/dadweyne — login la'aan). Haddii logo la gelin ama khalad → "CB" goobaabin casaan ah.
 */
export function BrandMark({ src, size = 36, className }: { src?: string | null; size?: number; className?: string }) {
  const url = src === undefined ? '/api/v1/public/logo' : src;
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [url]); // logo cusub → isku day mar kale
  if (!url || failed) {
    return (
      <span className={cx('flex shrink-0 items-center justify-center rounded-full bg-brand font-black text-white', className)} style={{ width: size, height: size, fontSize: size * 0.38 }}>
        CB
      </span>
    );
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Cabdinasir Bus" width={size} height={size} onError={() => setFailed(true)} className={cx('shrink-0 rounded-lg bg-white object-contain', className)} style={{ width: size, height: size }} />;
}
