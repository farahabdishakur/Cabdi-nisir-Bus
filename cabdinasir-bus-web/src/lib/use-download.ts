'use client';

import { useCallback } from 'react';
import { download, type RequestOptions } from './api';
import { useI18n } from './i18n';

/** Soo dejinta (CSV / biil) oo khaladka la tuso — haddii kale badhanku "waxba ma qabto" */
export function useDownload() {
  const { err } = useI18n();
  return useCallback(
    (path: string, query: RequestOptions['query'], filename: string) => {
      download(path, query, filename).catch((e) => window.alert(err(e)));
    },
    [err],
  );
}
