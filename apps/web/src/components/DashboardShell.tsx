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
    label: 'Dashboard',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/links',
    label: 'Links',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.06a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
      </svg>
    ),
  },
  {
    href: '/dashboard/activities',
    label: 'Activities',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
      </svg>
    ),
  },
  {
    href: '/dashboard/settings',
    label: 'Settings',
    icon: (
      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
        <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
      </svg>
    ),
  },
];

type DashboardShellProps = {
  title: string;
  headerRight?: ReactNode;
  children: ReactNode;
};

export function DashboardShell({ title, headerRight, children }: DashboardShellProps) {
  const pathname = usePathname();
  const { logout } = usePrivy();
  const { wallets } = useWallets();
  const wallet = wallets[0];
  const walletAddress = wallet?.address;
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [registeredName, setRegisteredName] = useState<string | null>(null);

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

  return (
    <div className="min-h-screen bg-skaus-dark flex">
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
          aria-hidden
        />
      )}

      <aside
        className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-skaus-darker border-r border-skaus-border flex flex-col transition-transform duration-300 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        <div className="px-6 py-6 border-b border-skaus-border">
          <Link href="/" className="flex items-center gap-2" onClick={() => setSidebarOpen(false)}>
            <div className="w-8 h-8 rounded-lg bg-skaus-primary/20 flex items-center justify-center">
              <span className="text-sm font-black text-skaus-primary">S</span>
            </div>
            <span className="text-lg font-black tracking-tight">
              <span className="text-skaus-primary">S</span>KAUS
            </span>
            <span className="ml-1 text-[10px] font-bold uppercase tracking-wider text-skaus-muted bg-skaus-surface px-1.5 py-0.5 rounded">
              beta
            </span>
          </Link>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1">
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
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                  active ? 'bg-skaus-primary/10 text-skaus-primary' : 'text-skaus-muted hover:text-white hover:bg-skaus-surface'
                }`}
              >
                {item.icon}
                {item.label}
              </Link>
            );
          })}
        </nav>

        <div className="px-4 py-4 border-t border-skaus-border space-y-3">
          {walletAddress && (
            <div className="flex items-center gap-2 px-2">
              <div className="w-7 h-7 rounded-full bg-skaus-primary/20 flex items-center justify-center shrink-0">
                <span className="text-xs font-bold text-skaus-primary">
                  {(registeredName || walletAddress)[0].toUpperCase()}
                </span>
              </div>
              <div className="min-w-0 flex-1">
                {registeredName && (
                  <p className="text-xs font-semibold text-white truncate">@{registeredName}</p>
                )}
                <p className="text-[10px] font-mono text-skaus-muted truncate">
                  {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
                </p>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={logout}
            className="w-full flex items-center gap-2 px-3 py-2 rounded-lg text-xs text-skaus-muted hover:text-white hover:bg-skaus-surface transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 9V5.25A2.25 2.25 0 0013.5 3h-6a2.25 2.25 0 00-2.25 2.25v13.5A2.25 2.25 0 007.5 21h6a2.25 2.25 0 002.25-2.25V15m3 0l3-3m0 0l-3-3m3 3H9" />
            </svg>
            Logout
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 min-h-screen min-h-[100dvh] overflow-x-clip">
        <header className="sticky top-0 z-30 bg-skaus-dark/80 backdrop-blur-xl border-b border-skaus-border px-4 sm:px-6 lg:px-10 py-4 flex flex-wrap items-center justify-between gap-3 gap-y-2">
          <div className="flex items-center gap-4 min-w-0">
            <button
              type="button"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-skaus-surface transition-colors shrink-0"
            >
              <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h1 className="text-xl font-bold truncate">{title}</h1>
          </div>
          {headerRight ? <div className="flex items-center gap-3 shrink-0">{headerRight}</div> : null}
        </header>
        {children}
      </main>
    </div>
  );
}
