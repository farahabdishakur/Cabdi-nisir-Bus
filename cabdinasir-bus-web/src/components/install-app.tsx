'use client';

import { useEffect, useState } from 'react';
import { useI18n } from '@/lib/i18n';

/** Chrome/Edge: "beforeinstallprompt" → badhanka "Rakib app-ka" (kombiyuutarka/taleefanka icon iyo daaqad u gaar ah) */
interface InstallEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export function InstallAppButton() {
  const { t } = useI18n();
  const [evt, setEvt] = useState<InstallEvent | null>(null);
  useEffect(() => {
    const onPrompt = (e: Event) => {
      e.preventDefault();
      setEvt(e as InstallEvent);
    };
    const onInstalled = () => setEvt(null);
    window.addEventListener('beforeinstallprompt', onPrompt);
    window.addEventListener('appinstalled', onInstalled);
    return () => {
      window.removeEventListener('beforeinstallprompt', onPrompt);
      window.removeEventListener('appinstalled', onInstalled);
    };
  }, []);
  if (!evt) return null;
  return (
    <button
      type="button"
      className="hidden rounded-full bg-navy px-3 py-1 text-xs font-semibold text-white hover:opacity-90 sm:inline"
      onClick={async () => {
        await evt.prompt();
        await evt.userChoice;
        setEvt(null);
      }}
    >
      📲 {t('common.installApp')}
    </button>
  );
}
