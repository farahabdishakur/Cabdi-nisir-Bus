'use client';

import { BrandMark } from './brand';
import { PaperCopyHost } from './paper-ticket';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ReactNode, useCallback, useEffect, useRef, useState } from 'react';
import { useHotkeys, useIdleLogout } from '@/lib/hotkeys';
import { loadQueue, pruneSynced, syncQueue, useOfflineQueue, useOnline } from '@/lib/offline';
import { useQueryClient } from '@tanstack/react-query';
import { useAuth } from '@/lib/auth';
import { useI18n } from '@/lib/i18n';
import { useLiveEvents } from '@/lib/live';
import { can, isManager } from '@/lib/permissions';
import { useBootstrap, useCashSession, useMyBranch } from '@/lib/queries';
import { cx } from '@/lib/format';
import { Spinner } from './ui';

interface NavItem {
  href: string;
  key: string;
  icon: string;
  show: boolean;
}

/** Qaab-dhismeedka bogagga gudaha: sidebar (desktop) / menu (taleefan), topbar: laanta, sanduuqa, live, luqadda. */
export function AppShell({ children }: { children: ReactNode }) {
  const { user, loading, logout } = useAuth();
  const { t, lang, setLang } = useI18n();
  const router = useRouter();
  const path = usePathname();
  const branch = useMyBranch();
  const boot = useBootstrap();
  const session = useCashSession();
  const live = useLiveEvents(!!user && !user.mustChangePassword);
  const [menu, setMenu] = useState(false);
  const [q, setQ] = useState('');
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearch = useCallback(() => searchRef.current?.focus(), []);
  const active_ = !!user && !user.mustChangePassword;
  useHotkeys(focusSearch, active_);
  const onIdle = useCallback(() => {
    void logout().then(() => router.replace('/login?idle=1'));
  }, [logout, router]);
  useIdleLogout(onIdle, active_);

  // offline: alaabta sugaysa → si toos ah u dir marka internet-ku soo noqdo (+ daqiiqad kasta)
  const online = useOnline();
  const queue = useOfflineQueue();
  const pending = queue.filter((i) => i.status !== 'synced').length;
  const qc = useQueryClient();
  useEffect(() => {
    if (!active_) return;
    void loadQueue().then(() => pruneSynced());
  }, [active_]);
  useEffect(() => {
    if (!active_ || !online) return;
    const run = () =>
      syncQueue()
        .then((r) => {
          if (r?.synced) void qc.invalidateQueries({ queryKey: ['parcels'] });
        })
        .catch(() => undefined);
    void run();
    const h = setInterval(run, 60_000);
    return () => clearInterval(h);
  }, [active_, online, qc]);

  useEffect(() => {
    if (loading) return;
    if (!user) router.replace('/login');
    else if (user.mustChangePassword) router.replace('/change-password');
  }, [loading, user, router]);

  useEffect(() => setMenu(false), [path]);

  if (loading || !user || user.mustChangePassword) {
    return (
      <div className="flex min-h-screen items-center justify-center text-navy">
        <Spinner />
      </div>
    );
  }

  const staff = user.role !== 'DRIVER';
  const items: NavItem[] = [
    { href: '/', key: 'nav.dashboard', icon: '🏠', show: true },
    { href: '/search', key: 'common.search', icon: '🔎', show: staff },
    { href: '/dispatch', key: 'nav.dispatch', icon: '🚏', show: staff },
    { href: '/trips', key: 'nav.trips', icon: '🚐', show: true },
    { href: '/bookings', key: 'nav.bookings', icon: '🎫', show: staff },
    // Super Admin laan ma laha (sanduuq ma haysto) → hawlaha alaabta laanta lagama qabto
    { href: '/parcels/new', key: 'nav.parcelsNew', icon: '📦', show: staff && !!user.branchId },
    { href: '/parcels/incoming', key: 'nav.incoming', icon: '📥', show: staff && !!user.branchId },
    { href: '/parcels/outgoing', key: 'nav.outgoing', icon: '📤', show: staff && !!user.branchId },
    { href: '/parcels/deliver', key: 'nav.deliver', icon: '🤝', show: staff && !!user.branchId },
    { href: '/parcels', key: 'nav.parcels', icon: '🔎', show: staff },
    { href: '/offline', key: 'nav.offline', icon: '📴', show: staff && !!user.branchId },
    { href: '/cash', key: 'nav.cash', icon: '💵', show: staff && !!user.branchId },
    { href: '/void-requests', key: 'nav.voidRequests', icon: '↩️', show: staff },
    { href: '/claims', key: 'nav.claims', icon: '⚖️', show: staff },
    { href: '/zaad', key: 'nav.zaad', icon: '📱', show: can(user, 'reconcileZaad') },
    { href: '/books', key: 'nav.books', icon: '📒', show: can(user, 'reports') },
    { href: '/reports', key: 'nav.reports', icon: '📊', show: can(user, 'reports') },
    { href: '/system', key: 'nav.system', icon: '🛡', show: isManager(user) },
    { href: '/admin', key: 'nav.admin', icon: '⚙️', show: isManager(user) },
  ];
  const active = (href: string) => (href === '/' ? path === '/' : path === href || (path.startsWith(href + '/') && !items.some((i) => i.href !== href && i.href.startsWith(href + '/') && path.startsWith(i.href))));

  const nav = (
    <nav className="flex flex-col gap-1 p-3">
      {items
        .filter((i) => i.show)
        .map((i) => (
          <Link
            key={i.href}
            href={i.href}
            className={cx('flex min-h-11 items-center gap-3 rounded-lg px-3 text-sm font-medium', active(i.href) ? 'bg-white/15 text-white' : 'text-indigo-100 hover:bg-white/10')}
          >
            <span aria-hidden>{i.icon}</span>
            {t(i.key)}
          </Link>
        ))}
    </nav>
  );

  return (
    <div className="flex min-h-screen">
      <aside className="no-print hidden w-60 shrink-0 bg-navy lg:block">
        <div className="flex h-16 items-center gap-2 border-b border-white/10 px-4">
          <BrandMark src={boot.data?.company.logoUrl ?? null} size={36} />
          <span className="font-black text-white">{t('common.appName')}</span>
        </div>
        {nav}
      </aside>

      {menu && (
        <div className="no-print fixed inset-0 z-40 bg-black/40 lg:hidden" onClick={() => setMenu(false)}>
          <aside className="h-full w-72 bg-navy" onClick={(e) => e.stopPropagation()}>
            <div className="flex h-16 items-center px-4 font-black text-white">{t('common.appName')}</div>
            {nav}
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="no-print sticky top-0 z-30 flex h-16 items-center gap-3 border-b border-gray-200 bg-white px-3 sm:px-4">
          <button className="rounded-lg p-2 text-2xl lg:hidden" onClick={() => setMenu(true)} aria-label="menu">
            ☰
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-navy">{branch?.name ?? t(`roles.${user.role}`)}</p>
            <p className="truncate text-xs text-gray-500">
              {user.name} · {t(`roles.${user.role}`)}
            </p>
          </div>
          {staff && (
            <form
              className="hidden md:block"
              onSubmit={(e) => {
                e.preventDefault();
                if (q.trim().length >= 2) router.push(`/search?q=${encodeURIComponent(q.trim())}`);
              }}
            >
              <input
                ref={searchRef}
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={`🔎 ${t('search.short')}`}
                aria-label={t('common.search')}
                className="h-9 w-56 rounded-lg border border-gray-300 px-3 text-sm focus:border-navy focus:outline-none"
              />
            </form>
          )}
          {user.branchId && staff && (
            <Link
              href="/cash"
              className={cx('hidden rounded-full px-3 py-1 text-xs font-semibold sm:inline-block', session.data ? 'bg-emerald-100 text-emerald-800' : 'bg-red-100 text-red-800')}
            >
              💵 {session.data ? t('dashboard.sessionOpen') : t('dashboard.openSession')}
            </Link>
          )}
          {(!online || pending > 0) && (
            <Link href="/offline" className={cx('rounded-full px-3 py-1 text-xs font-semibold', online ? 'bg-amber-100 text-amber-900' : 'bg-red-600 text-white')}>
              {online ? `⏳ ${pending}` : `📴 ${t('common.offline')}${pending ? ` · ${pending}` : ''}`}
            </Link>
          )}
          <span className={cx('hidden items-center gap-1 text-xs sm:flex', live ? 'text-emerald-700' : 'text-gray-400')} title="live">
            <span className={cx('h-2 w-2 rounded-full', live ? 'bg-emerald-500' : 'bg-gray-300')} />
            {live ? t('common.online') : t('common.offline')}
          </span>
          <button className="rounded-lg px-2 py-1 text-xs font-semibold text-gray-600 hover:bg-gray-100" onClick={() => setLang(lang === 'so' ? 'en' : 'so')}>
            {lang === 'so' ? 'EN' : 'SO'}
          </button>
          <Link href="/change-password" className="hidden rounded-lg px-2 py-1 text-xs text-gray-600 hover:bg-gray-100 sm:inline">
            {t('nav.profile')}
          </Link>
          <button className="rounded-lg px-2 py-1 text-xs font-semibold text-brand hover:bg-red-50" onClick={() => logout().then(() => router.replace('/login'))}>
            {t('nav.logout')}
          </button>
        </header>
        <main className="mx-auto w-full max-w-7xl flex-1 p-3 sm:p-6">{children}</main>
        <PaperCopyHost />
      </div>
    </div>
  );
}
