'use client';

import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from 'react';
import so from '@/messages/so';
import en from '@/messages/en';
import { ApiError } from './api';

export type Lang = 'so' | 'en';
const DICTS: Record<Lang, unknown> = { so, en };

function lookup(dict: unknown, key: string): string | undefined {
  let cur: unknown = dict;
  for (const part of key.split('.')) {
    if (cur && typeof cur === 'object' && part in (cur as Record<string, unknown>)) cur = (cur as Record<string, unknown>)[part];
    else return undefined;
  }
  return typeof cur === 'string' ? cur : undefined;
}

type T = (key: string, vars?: Record<string, string | number>) => string;

interface I18n {
  lang: Lang;
  setLang: (l: Lang) => void;
  t: T;
  /** Khalad API → fariin Af-Soomaali/English */
  err: (e: unknown) => string;
  /** Koodh khalad (tusaale natiijada bulk) → qoraal; haddii aan la aqoon → fallback */
  codeText: (code: string, fallback?: string) => string;
}

const Ctx = createContext<I18n | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<Lang>('so');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('lang');
      if (saved === 'en' || saved === 'so') setLangState(saved);
    } catch {
      /* private mode */
    }
  }, []);

  const setLang = useCallback((l: Lang) => {
    setLangState(l);
    try {
      localStorage.setItem('lang', l);
    } catch {
      /* ignore */
    }
    document.documentElement.lang = l;
  }, []);

  const t = useCallback<T>(
    (key, vars) => {
      const raw = lookup(DICTS[lang], key) ?? lookup(so, key) ?? key;
      return vars ? raw.replace(/\{(\w+)\}/g, (_, k: string) => String(vars[k] ?? '')) : raw;
    },
    [lang],
  );

  const err = useCallback(
    (e: unknown) => {
      if (e instanceof ApiError) {
        const known = lookup(DICTS[lang], `errors.${e.code}`) ?? lookup(so, `errors.${e.code}`);
        if (known) return known;
        return e.message || t('errors.UNKNOWN');
      }
      return t('errors.UNKNOWN');
    },
    [lang, t],
  );

  const codeText = useCallback(
    (code: string, fallback?: string) => lookup(DICTS[lang], `errors.${code}`) ?? lookup(so, `errors.${code}`) ?? fallback ?? code,
    [lang],
  );

  return <Ctx.Provider value={{ lang, setLang, t, err, codeText }}>{children}</Ctx.Provider>;
}

export function useI18n() {
  const c = useContext(Ctx);
  if (!c) throw new Error('useI18n outside provider');
  return c;
}
