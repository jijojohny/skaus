'use client';

import { useState, useEffect, type ReactNode } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets } from '@privy-io/react-auth/solana';
import { config } from '@/lib/config';

const nav = [
  {
    href: '/dashboard',
    label: 'DASHBOARD',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 6h12v12H6V6zM9 9h6v6H9V9z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/links',
    label: 'LINKS',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.06a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
      </svg>
    ),
  },
  {
    href: '/dashboard/activities',
    label: 'ACTIVITIES',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/settings',
    label: 'SETTINGS',
    icon: (
      <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

function formatUtcTime(d: Date) {
  return `${d.toISOString().split('T')[1].slice(0, 8)}_UTC`;
}

type DashboardShellProps = {
  /** When set, shown as a narrow route label under the top bar (uppercased). */
  title?: string;
  headerRight?: ReactNode;
  /** Short status token for the footer strip (e.g. OPTIMIZED, DEGRADED). */
  networkStatus?: string;
  children: ReactNode;
};

export function DashboardShell({ title, headerRight, networkStatus = 'OPTIMIZED', children }: DashboardShellProps) {
  const pathname = usePathname();
  const { logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const walletAddress = wallet?.address;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [clock, setClock] = useState(formatUtcTime(new Date()));

  useEffect(() => {
    const id = window.setInterval(() => setClock(formatUtcTime(new Date())), 1000);
    return () => window.clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      const savedName = localStorage.getItem('skaus_username');
      const savedWallet = localStorage.getItem('skaus_wallet');
      if (savedName && savedWallet === walletAddress) {
        setRegisteredName(savedName);
      } else if (savedName && walletAddress) {
        fetch(`${config.gatewayUrl}/names/${savedName}`)
          .then(res => (res.ok ? res.json() : null))
          .then(data => {
            if (data?.authority === walletAddress) {
              setRegisteredName(savedName);
              localStorage.setItem('skaus_wallet', walletAddress);
            }
          })
          .catch(() => {});
      }
    } catch {
      /* ignore */
    }
  }, [walletAddress]);

  const operatorId = registeredName
    ? `OPERATOR_${registeredName.toUpperCase().replace(/[^A-Z0-9]/g, '_').slice(0, 24)}`
    : 'OPERATOR_01';

  return (
    <div className="flex min-h-screen min-h-[100dvh] flex-col bg-black font-mono text-white antialiased">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      {/* Top bar */}
      <header className="sticky top-0 z-30 flex shrink-0 items-center justify-between gap-4 border-b border-neutral-800 bg-black px-4 py-3 sm:px-6">
        <div className="flex min-w-0 items-center gap-3">
          <button
            type="button"
            onClick={() => setSidebarOpen(true)}
            className="shrink-0 rounded p-1.5 hover:bg-white/5 lg:hidden"
            aria-label="Open menu"
          >
            <svg className="h-5 w-5 text-neutral-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
            </svg>
          </button>
          <Link href="/dashboard" className="shrink-0 text-lg font-black tracking-tighter text-skaus-primary">
            SKAUS
          </Link>
          {title ? (
            <span className="hidden truncate text-[10px] font-bold tracking-[0.2em] text-neutral-600 sm:inline">
              // {title.toUpperCase()}
            </span>
          ) : null}
        </div>

        <div className="flex shrink-0 items-center gap-1 sm:gap-2">
          {headerRight ? <div className="mr-1 flex flex-wrap items-center justify-end gap-2 sm:mr-2">{headerRight}</div> : null}
          <button type="button" className="rounded p-2 text-white hover:bg-white/5" aria-label="Notifications">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M14.857 17.082a23.848 23.848 0 005.454-1.082A2.918 2.918 0 0118 14.429V11a6 6 0 10-12 0v3.429c0 1.026-.83 1.857-1.857 1.857h-.086M18 18v.75M6 18v.75m12 0a2.25 2.25 0 01-2.25 2.25h-9a2.25 2.25 0 01-2.25-2.25V15a3 3 0 013-3h9a3 3 0 013 3v3.75z" />
            </svg>
          </button>
          <Link href="/dashboard/settings" className="rounded p-2 text-white hover:bg-white/5" aria-label="Settings">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
            </svg>
          </Link>
          <Link href="/dashboard/settings" className="rounded p-2 text-white hover:bg-white/5" aria-label="Profile">
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </Link>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <aside
          className={`fixed left-0 top-0 z-50 flex h-screen w-[17rem] flex-col border-r border-neutral-800 bg-[#080808] transition-transform duration-300 lg:sticky lg:top-0 lg:z-20 lg:h-auto lg:min-h-screen lg:translate-x-0 ${
            sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
          }`}
        >
          <div className="border-b border-neutral-800 px-5 pb-5 pt-6">
            <p className="text-xs font-bold tracking-wide text-skaus-primary">{operatorId}</p>
            <p className="mt-1 text-[9px] font-medium tracking-[0.18em] text-neutral-500">ENCRYPTED_SESSION</p>
          </div>

          <nav className="flex flex-1 flex-col gap-0.5 px-3 py-4">
            {nav.map(item => {
              const active =
                item.href === '/dashboard'
                  ? pathname === '/dashboard'
                  : pathname === item.href || pathname.startsWith(`${item.href}/`);
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  onClick={() => setSidebarOpen(false)}
                  className={`flex items-center gap-3 px-3 py-2.5 text-[11px] font-bold tracking-[0.15em] transition-colors ${
                    active ? 'bg-skaus-primary text-white' : 'text-neutral-300 hover:bg-white/[0.06] hover:text-white'
                  }`}
                >
                  {item.icon}
                  {item.label}
                </Link>
              );
            })}
          </nav>

          <div className="mt-auto border-t border-neutral-800 px-4 py-5 space-y-4">
            <Link
              href="/dashboard#transaction-ledger"
              onClick={() => setSidebarOpen(false)}
              className="flex w-full items-center justify-center border border-skaus-primary bg-skaus-primary px-4 py-3.5 text-[11px] font-bold tracking-[0.2em] text-white transition-opacity hover:opacity-90"
            >
              INITIATE_TRANSFER
            </Link>
            <button
              type="button"
              onClick={() => {
                setSidebarOpen(false);
                void logout();
              }}
              className="flex w-full items-center justify-center gap-2 py-2 text-[11px] font-bold tracking-[0.15em] text-neutral-400 transition-colors hover:text-white"
            >
              <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
              </svg>
              LOGOUT
            </button>
          </div>
        </aside>

        <div className="flex min-h-0 min-w-0 flex-1 flex-col">
          <main className="flex-1 pb-14">{children}</main>

          <footer className="fixed bottom-0 left-0 right-0 z-30 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 border-t border-neutral-800 bg-black px-4 py-2 text-[9px] tracking-wide text-neutral-500 sm:px-6 lg:left-[17rem]">
            <span>
              NETWORK_STATUS:{' '}
              <span className="font-bold text-skaus-primary">{networkStatus}</span>
            </span>
            <span className="hidden sm:inline">LAST_SYNC: {clock}</span>
            <span>VER: 1.0.4-BETA</span>
          </footer>
        </div>
      </div>
    </div>
  );
}
