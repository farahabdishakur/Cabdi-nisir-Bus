'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Furayaasha kumbuyuutarka (UI_RULES §1): F2 tigidh · F3 alaab dir · F4 wareeji · "/" raadi.
 * "/" kaliya marka aan la qorayn meel kale.
 */
export function useHotkeys(focusSearch: () => void, enabled: boolean) {
  const router = useRouter();
  useEffect(() => {
    if (!enabled) return;
    const h = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement | null;
      const typing = !!el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT' || el.isContentEditable);
      if (e.key === 'F2') { e.preventDefault(); router.push('/trips'); }
      else if (e.key === 'F3') { e.preventDefault(); router.push('/parcels/new'); }
      else if (e.key === 'F4') { e.preventDefault(); router.push('/parcels/deliver'); }
      else if (e.key === '/' && !typing) { e.preventDefault(); focusSearch(); }
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [router, focusSearch, enabled]);
}

/** Kombiyuutarada xafiiska waa la wadaagaa: hawl la'aan N daqiiqo → si toos ah uga bax (amni). */
export const IDLE_MINUTES = 30;

export function useIdleLogout(onIdle: () => void, enabled: boolean, minutes = IDLE_MINUTES) {
  const last = useRef(Date.now());
  useEffect(() => {
    if (!enabled) return;
    const bump = () => (last.current = Date.now());
    const events = ['mousemove', 'keydown', 'click', 'touchstart', 'scroll'];
    events.forEach((ev) => window.addEventListener(ev, bump, { passive: true }));
    const timer = setInterval(() => {
      if (Date.now() - last.current > minutes * 60_000) onIdle();
    }, 30_000);
    return () => {
      events.forEach((ev) => window.removeEventListener(ev, bump));
      clearInterval(timer);
    };
  }, [enabled, minutes, onIdle]);
}
