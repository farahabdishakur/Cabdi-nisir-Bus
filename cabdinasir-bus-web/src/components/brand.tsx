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
    // logo la soo gelin → icon-ka app-ka (bas + boorsooyin)
    // eslint-disable-next-line @next/next/no-img-element
    return <img src="/icons/icon-192.png" alt="Cabdinasir Bus" width={size} height={size} className={cx('shrink-0 rounded-xl', className)} style={{ width: size, height: size }} />;
  }
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={url} alt="Cabdinasir Bus" width={size} height={size} onError={() => setFailed(true)} className={cx('shrink-0 rounded-lg bg-white object-contain', className)} style={{ width: size, height: size }} />;
}
