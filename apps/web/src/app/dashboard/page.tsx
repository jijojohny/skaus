'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignMessage } from '@privy-io/react-auth/solana';
import { useRouter } from 'next/navigation';
import { Connection, PublicKey } from '@solana/web3.js';
import { fetchDeposits, getRelayStatus, lookupByAuthority } from '@/lib/gateway';
import { scanForDeposits, scanDepositsOnChain, type ScannedDeposit } from '@/lib/scan';
import { executeWithdraw } from '@/lib/withdraw';
import { config } from '@/lib/config';
import { derivePoolPda } from '@/lib/stealth';
import Link from 'next/link';

type DashboardDeposit = Omit<ScannedDeposit, 'status'> & {
  status: 'available' | 'withdrawing' | 'withdrawn' | 'error';
  withdrawTx?: string;
  withdrawError?: string;
};

type ActivityFilter = 'all' | 'incoming' | 'outgoing';
type SidebarTab = 'dashboard' | 'links' | 'activities' | 'settings';

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();

  const wallet = wallets[0];
  const walletAddress = wallet?.address || user?.wallet?.address;
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  );

  const [deposits, setDeposits] = useState<DashboardDeposit[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [relayActive, setRelayActive] = useState<boolean | null>(null);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'indexer' | 'onchain'>('indexer');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [activeTab, setActiveTab] = useState<SidebarTab>('dashboard');
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const scanKeyRef = useRef<Uint8Array | null>(null);

  useEffect(() => {
    if (!ready) return;
    if (!authenticated) {
      router.push('/login?redirect=/dashboard');
      return;
    }
    if (walletAddress) {
      lookupByAuthority(walletAddress)
        .then((result) => {
          if (!result.registered) {
            router.push('/onboarding');
          }
        })
        .catch(() => {});

      try {
        const savedName = localStorage.getItem('skaus_username');
        const savedWallet = localStorage.getItem('skaus_wallet');
        if (savedName && savedWallet === walletAddress) {
          setRegisteredName(savedName);
        } else {
          verifyNameFromGateway(walletAddress);
        }
      } catch {
        verifyNameFromGateway(walletAddress);
      }
    }
  }, [ready, authenticated, walletAddress, router]);

  const verifyNameFromGateway = async (address: string) => {
    try {
      const savedName = localStorage.getItem('skaus_username');
      if (savedName) {
        const res = await fetch(`${config.gatewayUrl}/names/${savedName}`);
        if (res.ok) {
          const data = await res.json();
          if (data.authority === address) {
            setRegisteredName(savedName);
            localStorage.setItem('skaus_wallet', address);
            return;
          }
        }
      }
    } catch {}
  };

  const deriveScanKey = useCallback(async (): Promise<Uint8Array> => {
    if (scanKeyRef.current) return scanKeyRef.current;
    if (!wallet) throw new Error('No wallet connected');

    const message = new TextEncoder().encode(
      `SKAUS: Derive stealth scan key\nWallet: ${wallet.address}`,
    );
    const { signature: sig } = await signMessage({ message, wallet });

    const { sha256 } = await import('@noble/hashes/sha256');
    const { hkdf } = await import('@noble/hashes/hkdf');
    const masterSeed = sha256(sig);
    const scanPrivkey = hkdf(sha256, masterSeed, 'skaus-v1', 'skaus-scan-key', 32);

    scanKeyRef.current = scanPrivkey;
    return scanPrivkey;
  }, [signMessage, wallet]);

  const scanDeposits = useCallback(async () => {
    setScanning(true);
    setScanError(null);

    try {
      const scanPrivkey = await deriveScanKey();

      const relayStatus = await getRelayStatus().catch(() => null);
      setRelayActive(relayStatus?.active ?? null);

      let found: ScannedDeposit[];

      if (scanMode === 'onchain') {
        const tokenMint = new PublicKey(config.tokenMint);
        const [poolPda] = derivePoolPda(tokenMint);
        found = await scanDepositsOnChain(connection, scanPrivkey, poolPda);
      } else {
        found = await scanForDeposits(scanPrivkey);
      }

      const entries = found.map(dep => ({
        ...dep,
        status: 'available' as const,
      }));

      setDeposits(entries);

      if (entries.length === 0) {
        setScanError('No deposits found. Make sure someone has sent you a payment first.');
      }
    } catch (err: any) {
      if (err.message?.includes('rejected') || err.message?.includes('cancelled')) {
        setScanError('Signature required to derive your scan key.');
      } else {
        setScanError(err.message || 'Failed to scan. Is the gateway running?');
      }
    } finally {
      setScanning(false);
    }
  }, [deriveScanKey, scanMode, connection]);

  const handleWithdraw = useCallback(async (depositId: string) => {
    if (!withdrawAddress) return;

    try {
      new PublicKey(withdrawAddress);
    } catch {
      setDeposits(prev =>
        prev.map(d => d.id === depositId
          ? { ...d, status: 'error' as const, withdrawError: 'Invalid Solana address' }
          : d
        )
      );
      return;
    }

    setDeposits(prev =>
      prev.map(d => d.id === depositId ? { ...d, status: 'withdrawing' as const } : d)
    );
    setShowWithdrawModal(null);

    try {
      const tokenMint = new PublicKey(config.tokenMint);
      const [poolPda] = derivePoolPda(tokenMint);

      const poolAccount = await connection.getAccountInfo(poolPda);
      let merkleRoot = '0'.repeat(64);
      if (poolAccount && poolAccount.data.length >= 159) {
        merkleRoot = Buffer.from(poolAccount.data.slice(127, 159)).toString('hex');
      }

      const deposit = deposits.find(d => d.id === depositId)!;
      const result = await executeWithdraw(
        { ...deposit, status: 'available' as const },
        withdrawAddress,
        merkleRoot,
      );

      setDeposits(prev =>
        prev.map(d => d.id === depositId
          ? { ...d, status: 'withdrawn' as const, withdrawTx: result.txSignature }
          : d
        )
      );
    } catch (err: any) {
      console.error('Withdrawal failed:', err);
      setDeposits(prev =>
        prev.map(d => d.id === depositId
          ? { ...d, status: 'error' as const, withdrawError: err.message }
          : d
        )
      );
    }
  }, [withdrawAddress, deposits, connection]);

  const formatAmount = (amount: bigint) => {
    const decimals = 6;
    const str = amount.toString().padStart(decimals + 1, '0');
    const whole = str.slice(0, str.length - decimals);
    const frac = str.slice(str.length - decimals).replace(/0+$/, '');
    return frac ? `${whole}.${frac}` : whole;
  };

  const totalBalance = deposits
    .filter(d => d.status === 'available')
    .reduce((sum, d) => sum + d.amount, 0n);

  const filteredDeposits = deposits.filter(d => {
    if (activityFilter === 'incoming') return d.status === 'available';
    if (activityFilter === 'outgoing') return d.status === 'withdrawn';
    return true;
  });

  const copyLink = () => {
    const link = registeredName ? `skaus.me/${registeredName}` : '';
    if (!link) return;
    navigator.clipboard.writeText(link);
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-skaus-dark">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) return null;

  const sidebarItems: { id: SidebarTab; label: string; icon: JSX.Element }[] = [
    {
      id: 'dashboard',
      label: 'Dashboard',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6A2.25 2.25 0 016 3.75h2.25A2.25 2.25 0 0110.5 6v2.25a2.25 2.25 0 01-2.25 2.25H6a2.25 2.25 0 01-2.25-2.25V6zM3.75 15.75A2.25 2.25 0 016 13.5h2.25a2.25 2.25 0 012.25 2.25V18a2.25 2.25 0 01-2.25 2.25H6A2.25 2.25 0 013.75 18v-2.25zM13.5 6a2.25 2.25 0 012.25-2.25H18A2.25 2.25 0 0120.25 6v2.25A2.25 2.25 0 0118 10.5h-2.25a2.25 2.25 0 01-2.25-2.25V6zM13.5 15.75a2.25 2.25 0 012.25-2.25H18a2.25 2.25 0 012.25 2.25V18A2.25 2.25 0 0118 20.25h-2.25A2.25 2.25 0 0113.5 18v-2.25z" />
        </svg>
      ),
    },
    {
      id: 'links',
      label: 'Links',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.06a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
        </svg>
      ),
    },
    {
      id: 'activities',
      label: 'Activities',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6v6h4.5m4.5 0a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
      ),
    },
    {
      id: 'settings',
      label: 'Settings',
      icon: (
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.594 3.94c.09-.542.56-.94 1.11-.94h2.593c.55 0 1.02.398 1.11.94l.213 1.281c.063.374.313.686.645.87.074.04.147.083.22.127.324.196.72.257 1.075.124l1.217-.456a1.125 1.125 0 011.37.49l1.296 2.247a1.125 1.125 0 01-.26 1.431l-1.003.827c-.293.24-.438.613-.431.992a6.759 6.759 0 010 .255c-.007.378.138.75.43.99l1.005.828c.424.35.534.954.26 1.43l-1.298 2.247a1.125 1.125 0 01-1.369.491l-1.217-.456c-.355-.133-.75-.072-1.076.124a6.57 6.57 0 01-.22.128c-.331.183-.581.495-.644.869l-.213 1.28c-.09.543-.56.941-1.11.941h-2.594c-.55 0-1.02-.398-1.11-.94l-.213-1.281c-.062-.374-.312-.686-.644-.87a6.52 6.52 0 01-.22-.127c-.325-.196-.72-.257-1.076-.124l-1.217.456a1.125 1.125 0 01-1.369-.49l-1.297-2.247a1.125 1.125 0 01.26-1.431l1.004-.827c.292-.24.437-.613.43-.992a6.932 6.932 0 010-.255c.007-.378-.138-.75-.43-.99l-1.004-.828a1.125 1.125 0 01-.26-1.43l1.297-2.247a1.125 1.125 0 011.37-.491l1.216.456c.356.133.751.072 1.076-.124.072-.044.146-.087.22-.128.332-.183.582-.495.644-.869l.214-1.281z" />
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      ),
    },
  ];

  return (
    <div className="min-h-screen bg-skaus-dark flex">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={`fixed lg:sticky top-0 left-0 z-50 h-screen w-64 bg-skaus-darker border-r border-skaus-border flex flex-col transition-transform duration-300 ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
      }`}>
        {/* Logo */}
        <div className="px-6 py-6 border-b border-skaus-border">
          <Link href="/" className="flex items-center gap-2">
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

        {/* Nav */}
        <nav className="flex-1 px-3 py-4 space-y-1">
          {sidebarItems.map(item => (
            <button
              key={item.id}
              onClick={() => {
                setActiveTab(item.id);
                setSidebarOpen(false);
              }}
              className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 ${
                activeTab === item.id
                  ? 'bg-skaus-primary/10 text-skaus-primary'
                  : 'text-skaus-muted hover:text-white hover:bg-skaus-surface'
              }`}
            >
              {item.icon}
              {item.label}
            </button>
          ))}
        </nav>

        {/* Sidebar footer */}
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

      {/* Main content */}
      <main className="flex-1 min-h-screen">
        {/* Top bar */}
        <header className="sticky top-0 z-30 bg-skaus-dark/80 backdrop-blur-xl border-b border-skaus-border px-6 lg:px-10 py-4 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden p-1.5 rounded-lg hover:bg-skaus-surface transition-colors"
            >
              <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 6.75h16.5M3.75 12h16.5m-16.5 5.25h16.5" />
              </svg>
            </button>
            <h1 className="text-xl font-bold">Dashboard</h1>
          </div>

          <div className="flex items-center gap-3">
            {relayActive !== null && (
              <span className={`hidden sm:inline-flex text-[10px] px-2.5 py-1 rounded-full font-bold uppercase tracking-wider ${
                relayActive
                  ? 'bg-skaus-success/10 text-skaus-success border border-skaus-success/20'
                  : 'bg-skaus-warning/10 text-skaus-warning border border-skaus-warning/20'
              }`}>
                Relay {relayActive ? 'Active' : 'Offline'}
              </span>
            )}
            <button
              onClick={scanDeposits}
              disabled={scanning}
              className="flex items-center gap-2 px-4 py-2 bg-skaus-primary hover:bg-skaus-primary-hover text-white text-xs font-bold rounded-lg transition-all disabled:opacity-50"
            >
              <svg className={`w-3.5 h-3.5 ${scanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
              </svg>
              {scanning ? 'Scanning...' : 'Scan'}
            </button>
          </div>
        </header>

        <div className="px-6 lg:px-10 py-8 space-y-6 max-w-5xl">
          {scanError && (
            <div className="flex items-center gap-3 p-3 bg-skaus-warning/5 border border-skaus-warning/20 rounded-xl text-sm text-skaus-warning">
              <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {scanError}
            </div>
          )}

          {/* Stealth Balances Card */}
          <div className="rounded-2xl border border-skaus-primary/30 bg-gradient-to-br from-skaus-surface via-skaus-darker to-skaus-surface p-6 space-y-5 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-48 h-48 bg-skaus-primary/5 rounded-full blur-3xl -translate-y-1/2 translate-x-1/2" />

            <div className="relative flex items-center justify-between">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold text-skaus-muted-light">Your Stealth Balances</h2>
                <svg className="w-3.5 h-3.5 text-skaus-muted cursor-help" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
                </svg>
              </div>
              <button
                onClick={scanDeposits}
                disabled={scanning}
                className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                title="Refresh balances"
              >
                <svg className={`w-4 h-4 text-skaus-muted ${scanning ? 'animate-spin' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
              </button>
            </div>

            {/* Balance display */}
            <div className="relative">
              <p className="text-4xl font-black text-white tracking-tight">
                {deposits.length > 0 ? formatAmount(totalBalance) : '$0.00'}
                <span className="text-lg font-medium text-skaus-muted ml-2">
                  {deposits.length > 0 ? 'USDC' : 'USD'}
                </span>
              </p>
            </div>

            {/* Token list */}
            <div className="relative">
              <p className="text-xs font-semibold text-skaus-muted uppercase tracking-wider mb-3">Tokens</p>
              {deposits.filter(d => d.status === 'available').length > 0 ? (
                <div className="space-y-2">
                  {(() => {
                    const tokenMap = new Map<string, bigint>();
                    deposits.filter(d => d.status === 'available').forEach(d => {
                      const prev = tokenMap.get(d.token) || 0n;
                      tokenMap.set(d.token, prev + d.amount);
                    });
                    return Array.from(tokenMap.entries()).map(([token, amount]) => (
                      <div key={token} className="flex items-center justify-between py-2.5 px-3 rounded-xl bg-white/[0.03] hover:bg-white/[0.05] transition-colors">
                        <div className="flex items-center gap-3">
                          <div className="w-9 h-9 rounded-full bg-skaus-primary/15 flex items-center justify-center">
                            <span className="text-xs font-black text-skaus-primary">{token[0]}</span>
                          </div>
                          <div>
                            <p className="text-sm font-bold text-white">{formatAmount(amount)} <span className="text-skaus-muted font-medium">{token}</span></p>
                            <p className="text-[10px] text-skaus-muted">Stealth Token</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-sm font-semibold text-skaus-muted">$0.00</p>
                          <svg className="w-3.5 h-3.5 text-skaus-muted/50 ml-auto" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M6 12L3.269 3.126A59.768 59.768 0 0121.485 12 59.77 59.77 0 013.27 20.876L5.999 12zm0 0h7.5" />
                          </svg>
                        </div>
                      </div>
                    ));
                  })()}
                </div>
              ) : (
                <div className="py-4 px-3 rounded-xl bg-white/[0.02] text-center">
                  <p className="text-xs text-skaus-muted">No tokens found. Click <span className="text-skaus-primary font-semibold">Scan</span> to check for deposits.</p>
                </div>
              )}
            </div>

            {/* Payments received banner */}
            <div className="relative pt-3 border-t border-white/5">
              <p className="text-xs text-center font-medium text-skaus-primary/80">
                Payments received privately through SKAUS
              </p>
            </div>
          </div>

          {/* Your Personal Link Card */}
          {registeredName && (
            <div className="rounded-2xl border border-skaus-border bg-skaus-surface/80 p-5">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-sm font-bold text-white">Your Personal Link</h3>
                  <p className="text-xs text-skaus-muted mt-0.5">Share to get paid</p>
                </div>
                <button className="p-1.5 rounded-lg hover:bg-white/5 transition-colors">
                  <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM12.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0zM18.75 12a.75.75 0 11-1.5 0 .75.75 0 011.5 0z" />
                  </svg>
                </button>
              </div>

              <div className="flex items-center justify-between bg-skaus-darker rounded-xl px-4 py-3 border border-skaus-border">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-skaus-primary/15 flex items-center justify-center">
                    <span className="text-xs font-black text-skaus-primary">S</span>
                  </div>
                  <span className="text-sm font-mono text-white">skaus.me/<span className="text-skaus-primary font-semibold">{registeredName}</span></span>
                </div>

                <div className="flex items-center gap-1">
                  {/* Copy */}
                  <button
                    onClick={copyLink}
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                    title="Copy link"
                  >
                    {linkCopied ? (
                      <svg className="w-4 h-4 text-skaus-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                      </svg>
                    ) : (
                      <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 17.25v3.375c0 .621-.504 1.125-1.125 1.125h-9.75a1.125 1.125 0 01-1.125-1.125V7.875c0-.621.504-1.125 1.125-1.125H6.75a9.06 9.06 0 011.5.124m7.5 10.376h3.375c.621 0 1.125-.504 1.125-1.125V11.25c0-4.46-3.243-8.161-7.5-8.876a9.06 9.06 0 00-1.5-.124H9.375c-.621 0-1.125.504-1.125 1.125v3.5m7.5 10.375H9.375a1.125 1.125 0 01-1.125-1.125v-9.25m12 6.625v-1.875a3.375 3.375 0 00-3.375-3.375h-1.5a1.125 1.125 0 01-1.125-1.125v-1.5a3.375 3.375 0 00-3.375-3.375H9.75" />
                      </svg>
                    )}
                  </button>
                  {/* QR Code */}
                  <button className="p-2 rounded-lg hover:bg-white/5 transition-colors" title="Show QR code">
                    <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 013.75 9.375v-4.5zM3.75 14.625c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5a1.125 1.125 0 01-1.125-1.125v-4.5zM13.5 4.875c0-.621.504-1.125 1.125-1.125h4.5c.621 0 1.125.504 1.125 1.125v4.5c0 .621-.504 1.125-1.125 1.125h-4.5A1.125 1.125 0 0113.5 9.375v-4.5z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.75 6.75h.75v.75h-.75v-.75zM6.75 16.5h.75v.75h-.75v-.75zM16.5 6.75h.75v.75h-.75v-.75zM13.5 13.5h.75v.75h-.75v-.75zM13.5 19.5h.75v.75h-.75v-.75zM19.5 13.5h.75v.75h-.75v-.75zM19.5 19.5h.75v.75h-.75v-.75zM16.5 16.5h.75v.75h-.75v-.75z" />
                    </svg>
                  </button>
                  {/* External link */}
                  <Link
                    href={`/${registeredName}`}
                    className="p-2 rounded-lg hover:bg-white/5 transition-colors"
                    title="View profile"
                  >
                    <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M13.5 6H5.25A2.25 2.25 0 003 8.25v10.5A2.25 2.25 0 005.25 21h10.5A2.25 2.25 0 0018 18.75V10.5m-10.5 6L21 3m0 0h-5.25M21 3v5.25" />
                    </svg>
                  </Link>
                </div>
              </div>
            </div>
          )}

          {/* Activity Section */}
          <div className="rounded-2xl border border-skaus-border bg-skaus-surface/80 overflow-hidden">
            {/* Activity header with tabs */}
            <div className="px-5 py-4 border-b border-skaus-border flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-1">
                {(['all', 'incoming', 'outgoing'] as ActivityFilter[]).map(filter => (
                  <button
                    key={filter}
                    onClick={() => setActivityFilter(filter)}
                    className={`px-3.5 py-1.5 rounded-full text-xs font-semibold transition-all ${
                      activityFilter === filter
                        ? 'bg-skaus-primary text-white'
                        : 'text-skaus-muted hover:text-white hover:bg-white/5'
                    }`}
                  >
                    {filter.charAt(0).toUpperCase() + filter.slice(1)}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={scanMode}
                  onChange={(e) => setScanMode(e.target.value as 'indexer' | 'onchain')}
                  className="px-2.5 py-1.5 rounded-lg bg-skaus-darker border border-skaus-border text-[10px] text-skaus-muted focus:outline-none focus:border-skaus-primary"
                >
                  <option value="indexer">Indexer</option>
                  <option value="onchain">On-chain</option>
                </select>
                <button className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-skaus-border text-xs text-skaus-muted hover:text-white hover:border-skaus-border-hover transition-colors">
                  <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5M16.5 12L12 16.5m0 0L7.5 12m4.5 4.5V3" />
                  </svg>
                  Export CSV
                </button>
              </div>
            </div>

            {/* Activity list */}
            {filteredDeposits.length === 0 ? (
              <div className="px-6 py-16 text-center space-y-2">
                <div className="w-12 h-12 mx-auto rounded-full bg-skaus-surface flex items-center justify-center mb-3">
                  <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M2.25 18.75a60.07 60.07 0 0115.797 2.101c.727.198 1.453-.342 1.453-1.096V18.75M3.75 4.5v.75A.75.75 0 013 6h-.75m0 0v-.375c0-.621.504-1.125 1.125-1.125H20.25M2.25 6v9m18-10.5v.75c0 .414.336.75.75.75h.75m-1.5-1.5h.375c.621 0 1.125.504 1.125 1.125v9.75c0 .621-.504 1.125-1.125 1.125h-.375m1.5-1.5H21a.75.75 0 00-.75.75v.75m0 0H3.75m0 0h-.375a1.125 1.125 0 01-1.125-1.125V15m1.5 1.5v-.75A.75.75 0 003 15h-.75M15 10.5a3 3 0 11-6 0 3 3 0 016 0zm3 0h.008v.008H18V10.5zm-12 0h.008v.008H6V10.5z" />
                  </svg>
                </div>
                <p className="text-sm text-skaus-muted">No activity yet</p>
                <p className="text-xs text-skaus-muted/60">
                  Scan for deposits or share your link to receive payments.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-skaus-border/50">
                {filteredDeposits.map(deposit => (
                  <div key={deposit.id} className="px-5 py-4 hover:bg-white/[0.02] transition-colors">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div className={`w-9 h-9 rounded-full flex items-center justify-center ${
                          deposit.status === 'available'
                            ? 'bg-skaus-success/10'
                            : deposit.status === 'withdrawn'
                              ? 'bg-skaus-muted/10'
                              : deposit.status === 'withdrawing'
                                ? 'bg-skaus-primary/10'
                                : 'bg-skaus-error/10'
                        }`}>
                          {deposit.status === 'available' ? (
                            <svg className="w-4 h-4 text-skaus-success" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 13.5L12 21m0 0l-7.5-7.5M12 21V3" />
                            </svg>
                          ) : deposit.status === 'withdrawn' ? (
                            <svg className="w-4 h-4 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 10.5L12 3m0 0l7.5 7.5M12 3v18" />
                            </svg>
                          ) : deposit.status === 'withdrawing' ? (
                            <div className="w-4 h-4 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
                          ) : (
                            <svg className="w-4 h-4 text-skaus-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                          )}
                        </div>

                        <div>
                          <p className="text-sm font-medium text-white">
                            {deposit.status === 'available' ? 'Received from ' : 'Withdrawn '}
                            <span className="text-skaus-muted font-mono text-xs">
                              {deposit.commitment.slice(0, 6)}...{deposit.commitment.slice(-4)}
                            </span>
                          </p>
                          <p className="text-[10px] text-skaus-muted mt-0.5">
                            {deposit.token} &middot; {new Date(deposit.timestamp * 1000).toLocaleDateString()} &middot; Leaf #{deposit.leafIndex}
                          </p>
                          {deposit.status === 'available' && (
                            <div className="flex items-center gap-1.5 mt-1">
                              <span className="inline-flex items-center px-1.5 py-0.5 rounded text-[9px] font-bold uppercase bg-skaus-primary/10 text-skaus-primary">
                                stealth
                              </span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div className="text-right flex items-center gap-3">
                        <div>
                          <p className={`text-sm font-bold ${
                            deposit.status === 'available' ? 'text-skaus-success' : 'text-white'
                          }`}>
                            {deposit.status === 'available' ? '+' : ''}{formatAmount(deposit.amount)} {deposit.token}
                          </p>
                        </div>
                        {deposit.status === 'available' && (
                          <button
                            onClick={() => setShowWithdrawModal(deposit.id)}
                            className="px-3 py-1.5 bg-skaus-primary/10 text-skaus-primary text-xs font-bold rounded-lg hover:bg-skaus-primary/20 transition-colors"
                          >
                            Withdraw
                          </button>
                        )}
                      </div>
                    </div>

                    {deposit.withdrawTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${deposit.withdrawTx}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-2 ml-12 text-[10px] text-skaus-success hover:underline block font-mono"
                      >
                        TX: {deposit.withdrawTx.slice(0, 32)}...
                      </a>
                    )}
                    {deposit.withdrawError && (
                      <p className="mt-2 ml-12 text-[10px] text-skaus-error">{deposit.withdrawError}</p>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>

      {/* Withdraw Modal */}
      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="bg-skaus-surface border border-skaus-border rounded-2xl p-6 max-w-md w-full mx-4 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">Withdraw</h3>
              <button onClick={() => setShowWithdrawModal(null)} className="p-1 rounded-lg hover:bg-white/5 transition-colors">
                <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-sm text-skaus-muted">
              Enter the destination address. Use a <span className="text-white font-semibold">fresh address</span> for maximum privacy.
            </p>
            <input
              type="text"
              value={withdrawAddress}
              onChange={(e) => setWithdrawAddress(e.target.value)}
              placeholder="Recipient Solana address..."
              className="input-field font-mono text-sm"
            />
            <div className="flex gap-3 pt-1">
              <button
                onClick={() => setShowWithdrawModal(null)}
                className="flex-1 py-2.5 rounded-xl border border-skaus-border text-sm text-skaus-muted hover:text-white hover:border-skaus-border-hover transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleWithdraw(showWithdrawModal)}
                disabled={!withdrawAddress}
                className="flex-1 py-2.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary-hover text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                Withdraw via Relay
              </button>
            </div>
            {relayActive === false && (
              <p className="text-xs text-skaus-warning text-center">
                Relay is currently offline.
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
