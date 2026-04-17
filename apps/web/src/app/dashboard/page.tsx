'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignMessage } from '@privy-io/react-auth/solana';
import { useRouter } from 'next/navigation';
import { Connection, PublicKey } from '@solana/web3.js';
import { getRelayStatus, lookupByAuthority } from '@/lib/gateway';
import { scanForDeposits, scanDepositsOnChain, type ScannedDeposit } from '@/lib/scan';
import { executeWithdraw } from '@/lib/withdraw';
import { config, getPublicProfileUrl } from '@/lib/config';
import { derivePoolPda } from '@/lib/stealth';
import { deriveKeysFromPinAndSignature } from '@/lib/onboarding';
import Link from 'next/link';
import QRCode from 'react-qr-code';
import { DashboardShell } from '@/components/DashboardShell';

type DashboardDeposit = Omit<ScannedDeposit, 'status'> & {
  status: 'available' | 'withdrawing' | 'withdrawn' | 'error';
  withdrawTx?: string;
  withdrawError?: string;
};

type ActivityFilter = 'all' | 'incoming' | 'outgoing';

export default function DashboardPage() {
  const router = useRouter();
  const { ready, authenticated, user } = usePrivy();
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
  /** When non-null, withdraw modal is open for these deposit ids (length 1 = single, 2+ = bulk). */
  const [withdrawModalIds, setWithdrawModalIds] = useState<string[] | null>(null);
  const [withdrawRunning, setWithdrawRunning] = useState(false);
  const [withdrawProgress, setWithdrawProgress] = useState({ current: 0, total: 0 });
  const [selectedDepositIds, setSelectedDepositIds] = useState<Set<string>>(() => new Set());
  const [scanMode, setScanMode] = useState<'indexer' | 'onchain'>('indexer');
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>('all');
  const [registeredName, setRegisteredName] = useState<string | null>(null);
  const [linkCopied, setLinkCopied] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [showScanModal, setShowScanModal] = useState(false);
  const [modalPin, setModalPin] = useState<string[]>(['', '', '', '', '', '']);
  const [modalPinError, setModalPinError] = useState('');

  const scanKeyRef = useRef<Uint8Array | null>(null);
  const modalPinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const depositsRef = useRef<DashboardDeposit[]>([]);
  depositsRef.current = deposits;

  useEffect(() => {
    if (!ready || !authenticated) return;
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

  useEffect(() => {
    if (!showQrModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setShowQrModal(false);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showQrModal]);

  useEffect(() => {
    if (!showScanModal) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !scanning) {
        setShowScanModal(false);
        setModalPin(['', '', '', '', '', '']);
        setModalPinError('');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showScanModal, scanning]);

  const handleModalPinInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const next = [...modalPin];
    next[index] = value.slice(-1);
    setModalPin(next);
    setModalPinError('');
    if (value && index < 5) modalPinRefs.current[index + 1]?.focus();
  };

  const handleModalPinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !modalPin[index] && index > 0) {
      const next = [...modalPin];
      next[index - 1] = '';
      setModalPin(next);
      modalPinRefs.current[index - 1]?.focus();
    }
  };

  const handleScanFromModal = async () => {
    const pin = modalPin.join('');
    if (pin.length !== 6) {
      setModalPinError('Enter your full 6-digit PIN.');
      return;
    }
    setModalPinError('');
    const success = await scanDeposits(pin);
    if (success) {
      setShowScanModal(false);
      setModalPin(['', '', '', '', '', '']);
    }
  };

  const verifyNameFromGateway = async (address: string) => {
    try {
      // Fast path: verify the locally cached name still belongs to this wallet
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

    // Fallback: resolve username from the gateway (covers new devices / cleared storage)
    try {
      const result = await lookupByAuthority(address);
      const username = result.names[0]?.username;
      if (username) {
        setRegisteredName(username);
        try {
          localStorage.setItem('skaus_username', username);
          localStorage.setItem('skaus_wallet', address);
        } catch {}
      }
    } catch {}
  };

  const deriveScanKey = useCallback(async (pin: string): Promise<Uint8Array> => {
    if (scanKeyRef.current) return scanKeyRef.current;
    if (!wallet) throw new Error('No wallet connected');
    if (!pin) throw new Error('PIN is required to derive your scan key.');

    // Must match onboarding exactly: same message, same PIN-based derivation
    const messageText = `SKAUS | Deterministic Meta Keys | Solana\nPIN: ${pin}\nWallet: ${wallet.address}`;
    const messageBytes = new TextEncoder().encode(messageText);
    const { signature } = await signMessage({ message: messageBytes, wallet });

    const { scanPrivkey } = deriveKeysFromPinAndSignature(pin, signature);

    scanKeyRef.current = scanPrivkey;
    return scanPrivkey;
  }, [signMessage, wallet]);

  const scanDeposits = useCallback(async (pin: string): Promise<boolean> => {
    setScanning(true);
    setScanError(null);

    try {
      const scanPrivkey = await deriveScanKey(pin);

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
      return true;
    } catch (err: any) {
      if (err.message?.includes('rejected') || err.message?.includes('cancelled')) {
        setScanError('Signature required to derive your scan key.');
      } else {
        setScanError(err.message || 'Failed to scan. Is the gateway running?');
      }
      return false;
    } finally {
      setScanning(false);
    }
  }, [deriveScanKey, scanMode, connection]);

  const fetchMerkleRootHex = useCallback(async (): Promise<string> => {
    const tokenMint = new PublicKey(config.tokenMint);
    const [poolPda] = derivePoolPda(tokenMint);
    const poolAccount = await connection.getAccountInfo(poolPda);
    if (poolAccount && poolAccount.data.length >= 159) {
      return Buffer.from(poolAccount.data.slice(127, 159)).toString('hex');
    }
    return '0'.repeat(64);
  }, [connection]);

  const [withdrawAddressError, setWithdrawAddressError] = useState<string | null>(null);

  const confirmWithdraw = useCallback(async () => {
    if (!withdrawModalIds?.length || !withdrawAddress.trim()) return;

    try {
      new PublicKey(withdrawAddress.trim());
    } catch {
      setWithdrawAddressError('Invalid Solana address');
      return;
    }
    setWithdrawAddressError(null);

    const ids = withdrawModalIds.filter(id => {
      const d = depositsRef.current.find(x => x.id === id);
      return d?.status === 'available';
    });
    if (ids.length === 0) {
      setWithdrawModalIds(null);
      return;
    }

    setWithdrawRunning(true);
    setWithdrawProgress({ current: 0, total: ids.length });

    for (let i = 0; i < ids.length; i++) {
      const id = ids[i];
      setWithdrawProgress({ current: i + 1, total: ids.length });

      const snapshot = depositsRef.current.find(d => d.id === id);
      if (!snapshot || snapshot.status !== 'available') {
        continue;
      }

      setDeposits(prev =>
        prev.map(d => (d.id === id ? { ...d, status: 'withdrawing' as const, withdrawError: undefined } : d)),
      );

      try {
        const merkleRoot = await fetchMerkleRootHex();
        const result = await executeWithdraw(
          { ...snapshot, status: 'available' as const },
          withdrawAddress.trim(),
          merkleRoot,
        );
        setDeposits(prev =>
          prev.map(d =>
            d.id === id ? { ...d, status: 'withdrawn' as const, withdrawTx: result.txSignature, withdrawError: undefined } : d,
          ),
        );
        setSelectedDepositIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      } catch (err: any) {
        console.error('Withdrawal failed:', err);
        setDeposits(prev =>
          prev.map(d =>
            d.id === id ? { ...d, status: 'error' as const, withdrawError: err.message || 'Withdraw failed' } : d,
          ),
        );
      }
    }

    setWithdrawRunning(false);
    setWithdrawModalIds(null);
  }, [withdrawAddress, withdrawModalIds, fetchMerkleRootHex]);

  const openWithdrawModal = useCallback((ids: string[]) => {
    const available = ids.filter(id => depositsRef.current.some(d => d.id === id && d.status === 'available'));
    if (available.length === 0) return;
    setWithdrawModalIds(available);
  }, []);

  const toggleDepositSelected = useCallback((id: string) => {
    setSelectedDepositIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

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

  const availableInFilter = filteredDeposits.filter(d => d.status === 'available');
  const selectedAvailableIds = [...selectedDepositIds].filter(id =>
    deposits.some(d => d.id === id && d.status === 'available'),
  );

  const copyLink = () => {
    if (!registeredName) return;
    navigator.clipboard.writeText(getPublicProfileUrl(registeredName));
    setLinkCopied(true);
    setTimeout(() => setLinkCopied(false), 2000);
  };

  if (!ready || !authenticated) {
    return null;
  }

  return (
    <>
      <DashboardShell
        networkStatus={
          relayActive === null ? 'SYNCING' : relayActive ? 'OPTIMIZED' : 'DEGRADED'
        }
      >
        <div className="mx-auto min-w-0 max-w-6xl space-y-4 px-4 py-6 sm:px-6 lg:px-10">
          {scanError && (
            <div className="flex items-center gap-3 border border-skaus-warning/30 bg-skaus-warning/5 p-3 text-xs text-skaus-warning">
              <svg className="h-4 w-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
              </svg>
              {scanError}
            </div>
          )}

          {/* Asset overview + quick actions */}
          <div className="border border-neutral-800 bg-[#0a0a0a] lg:grid lg:grid-cols-2 lg:divide-x lg:divide-neutral-800">
            <div className="space-y-6 p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div>
                  <p className="text-[10px] font-bold tracking-[0.2em] text-skaus-primary">TOTAL_SECURED_ASSETS</p>
                  <p className="mt-3 text-4xl font-black tracking-tight text-white md:text-5xl">
                    <span className="text-white">$</span>
                    {deposits.length > 0 ? (
                      (() => {
                        const s = formatAmount(totalBalance);
                        const parts = s.split('.');
                        return parts.length > 1 ? (
                          <>
                            {parts[0]}
                            <span className="text-neutral-500">.{parts[1]}</span>
                          </>
                        ) : (
                          s
                        );
                      })()
                    ) : (
                      <>
                        0<span className="text-neutral-500">.00</span>
                      </>
                    )}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setScanError(null);
                    setShowScanModal(true);
                    setTimeout(() => modalPinRefs.current[0]?.focus(), 100);
                  }}
                  disabled={scanning}
                  className="inline-flex items-center gap-2 border border-skaus-primary bg-skaus-primary px-3 py-2 text-[10px] font-bold tracking-[0.15em] text-white transition-opacity hover:opacity-90 disabled:opacity-40"
                >
                  <BarcodeIcon className={`h-4 w-4 ${scanning ? 'animate-pulse' : ''}`} />
                  SCAN_LEDGER
                </button>
              </div>
              <p className="flex flex-wrap items-center gap-2 text-[10px] font-medium tracking-wide text-neutral-500">
                <span className="inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-skaus-primary" aria-hidden />
                LIVE ENCRYPTED_WALLET_LINKED
              </p>
              {deposits.filter(d => d.status === 'available').length > 0 ? (
                <div className="space-y-1 border-t border-neutral-800 pt-4 text-[10px] text-neutral-400">
                  {(() => {
                    const tokenMap = new Map<string, bigint>();
                    deposits.filter(d => d.status === 'available').forEach(d => {
                      const prev = tokenMap.get(d.token) || 0n;
                      tokenMap.set(d.token, prev + d.amount);
                    });
                    return Array.from(tokenMap.entries()).map(([token, amount]) => (
                      <div key={token} className="flex justify-between font-mono">
                        <span className="text-neutral-500">{token}</span>
                        <span className="text-white">{formatAmount(amount)}</span>
                      </div>
                    ));
                  })()}
                </div>
              ) : null}
            </div>

            <div className="border-t border-neutral-800 p-5 sm:p-6 lg:border-t-0">
              <p className="text-xs font-bold tracking-[0.18em] text-white">QUICK_ACTION</p>
              <p className="mt-2 max-w-sm text-[11px] leading-relaxed text-neutral-500">
                Access private liquidity pools or execute stealth-order routing.
              </p>
              <div className="mt-6 flex flex-col gap-3">
                <Link
                  href="/dashboard/activities"
                  className="inline-flex items-center justify-center border border-skaus-primary bg-skaus-primary px-4 py-3 text-center text-[11px] font-bold tracking-[0.18em] text-white transition-opacity hover:opacity-90"
                >
                  SWAP_ASSETS
                </Link>
                <Link
                  href="/dashboard/links/personal"
                  className="inline-flex items-center justify-center border border-neutral-600 bg-transparent px-4 py-3 text-center text-[11px] font-bold tracking-[0.18em] text-white transition-colors hover:border-neutral-400"
                >
                  GENERATE_ADDRESS
                </Link>
              </div>
            </div>
          </div>

          {/* Personal link */}
          <div className="border border-neutral-800 bg-[#0a0a0a] p-5 sm:p-6">
            <div className="flex items-center gap-2 text-xs font-bold tracking-[0.15em] text-white">
              <LinkGlyph className="h-4 w-4 text-neutral-400" />
              YOUR_PERSONAL_LINK
            </div>
            <p className="mt-2 max-w-2xl text-[11px] leading-relaxed text-neutral-500">
              Unique identifier for peer-to-peer settlement and encrypted handshakes.
            </p>

            {!registeredName ? (
              <div className="mt-5 border-b-2 border-skaus-primary bg-black/40 px-4 py-4">
                <p className="text-[10px] font-bold tracking-[0.2em] text-skaus-primary">PENDING_VERIFICATION</p>
                <p className="mt-2 text-xs text-white">Complete onboarding to get your link</p>
              </div>
            ) : (
              <div className="mt-5 flex flex-col gap-3 sm:flex-row sm:items-center">
                <div className="flex min-w-0 flex-1 items-center gap-3 border border-neutral-800 bg-black/50 px-3 py-2.5">
                  <input
                    id="dashboard-personalised-link"
                    readOnly
                    value={getPublicProfileUrl(registeredName)}
                    className="min-w-0 flex-1 bg-transparent font-mono text-xs text-white focus:outline-none"
                  />
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={copyLink}
                    className="border border-neutral-700 px-3 py-2 text-[10px] font-bold tracking-wider text-neutral-300 hover:border-neutral-500 hover:text-white"
                  >
                    {linkCopied ? 'COPIED' : 'COPY'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowQrModal(true)}
                    className="border border-neutral-700 px-3 py-2 text-[10px] font-bold tracking-wider text-neutral-300 hover:border-neutral-500 hover:text-white"
                  >
                    QR
                  </button>
                  <Link
                    href={`/${registeredName}`}
                    className="border border-skaus-primary bg-skaus-primary px-3 py-2 text-[10px] font-bold tracking-wider text-white hover:opacity-90"
                  >
                    OPEN
                  </Link>
                </div>
              </div>
            )}
          </div>

          {/* Transaction ledger */}
          <div id="transaction-ledger" className="border border-neutral-800 bg-[#0a0a0a]">
            <div className="flex flex-col gap-4 border-b border-neutral-800 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <h2 className="text-xs font-bold tracking-[0.18em] text-white">TRANSACTION_LEDGER</h2>
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'incoming', 'outgoing'] as ActivityFilter[]).map(filter => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setActivityFilter(filter)}
                    className={`px-3 py-1.5 text-[10px] font-bold tracking-[0.15em] transition-colors ${
                      activityFilter === filter
                        ? 'bg-skaus-primary text-white'
                        : 'border border-neutral-700 text-neutral-400 hover:border-neutral-500 hover:text-white'
                    }`}
                  >
                    {filter.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 border-b border-neutral-800 px-4 py-3 sm:px-5">
              {availableInFilter.length > 0 && activityFilter !== 'outgoing' && (
                <>
                  <button
                    type="button"
                    onClick={() => setSelectedDepositIds(new Set(availableInFilter.map(d => d.id)))}
                    className="border border-neutral-700 px-2.5 py-1 text-[9px] font-bold tracking-wider text-neutral-400 hover:text-white"
                  >
                    SELECT_ALL
                  </button>
                  <button
                    type="button"
                    onClick={() => setSelectedDepositIds(new Set())}
                    disabled={selectedDepositIds.size === 0}
                    className="border border-neutral-700 px-2.5 py-1 text-[9px] font-bold tracking-wider text-neutral-400 hover:text-white disabled:opacity-40"
                  >
                    CLEAR
                  </button>
                  <button
                    type="button"
                    onClick={() => openWithdrawModal(selectedAvailableIds)}
                    disabled={selectedAvailableIds.length === 0}
                    className="border border-skaus-primary/50 bg-skaus-primary/10 px-2.5 py-1 text-[9px] font-bold tracking-wider text-skaus-primary hover:bg-skaus-primary/20 disabled:opacity-40"
                  >
                    WITHDRAW_SEL
                    {selectedAvailableIds.length > 0 ? ` (${selectedAvailableIds.length})` : ''}
                  </button>
                </>
              )}
              <select
                value={scanMode}
                onChange={e => setScanMode(e.target.value as 'indexer' | 'onchain')}
                className="border border-neutral-700 bg-black px-2 py-1 text-[9px] font-mono text-neutral-400 focus:outline-none focus:ring-1 focus:ring-skaus-primary"
              >
                <option value="indexer">INDEXER</option>
                <option value="onchain">ONCHAIN</option>
              </select>
              <span className="text-[9px] text-neutral-600">CSV_EXPORT_SOON</span>
            </div>

            {filteredDeposits.length === 0 && deposits.length === 0 ? (
              <div className="divide-y divide-neutral-800">
                <LedgerDemoRow
                  icon="in"
                  title="ENCRYPTED_INBOUND_SESSION"
                  id="#ST-882-QX"
                  amount="+$0.00"
                  amountClass="text-skaus-primary"
                  status="STALE_DATA"
                />
                <LedgerDemoRow
                  icon="lock"
                  title="SYSTEM_CALIBRATION_FEE"
                  id="#SYS-001-ALPHA"
                  amount="-$0.00"
                  amountClass="text-white"
                  status="VOIDED"
                />
                <div className="px-5 py-10 text-center">
                  <p className="text-[11px] text-neutral-500">
                    Scan the ledger or share your link to populate live entries.
                  </p>
                </div>
              </div>
            ) : filteredDeposits.length === 0 ? (
              <div className="px-6 py-14 text-center">
                <p className="text-[11px] font-bold tracking-wider text-neutral-500">NO_ENTRIES_FOR_FILTER</p>
              </div>
            ) : (
              <div className="divide-y divide-neutral-800">
                {filteredDeposits.map(deposit => (
                  <div key={deposit.id} className="px-4 py-4 transition-colors hover:bg-white/[0.02] sm:px-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex min-w-0 items-start gap-3">
                        {deposit.status === 'available' && activityFilter !== 'outgoing' && (
                          <input
                            type="checkbox"
                            checked={selectedDepositIds.has(deposit.id)}
                            onChange={() => toggleDepositSelected(deposit.id)}
                            className="mt-1 h-3.5 w-3.5 shrink-0 rounded border-neutral-600 bg-black text-skaus-primary focus:ring-skaus-primary"
                            aria-label={`Select deposit ${deposit.commitment.slice(0, 8)}`}
                          />
                        )}
                        <div
                          className={`flex h-10 w-10 shrink-0 items-center justify-center border border-neutral-700 bg-neutral-950 ${
                            deposit.status === 'available' ? 'text-skaus-primary' : 'text-neutral-400'
                          }`}
                        >
                          {deposit.status === 'available' ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                            </svg>
                          ) : deposit.status === 'withdrawn' ? (
                            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M5 10l7-7m0 0l7 7m-7-7v18" />
                            </svg>
                          ) : deposit.status === 'withdrawing' ? (
                            <div className="h-4 w-4 animate-spin border-2 border-skaus-primary border-t-transparent" />
                          ) : (
                            <svg className="h-5 w-5 text-skaus-error" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
                            </svg>
                          )}
                        </div>
                        <div className="min-w-0">
                          <p className="text-[11px] font-bold uppercase tracking-wide text-white">
                            {deposit.status === 'available' ? 'INBOUND_COMMIT' : 'OUTBOUND_SETTLEMENT'}{' '}
                            <span className="font-mono font-normal text-neutral-500 normal-case tracking-normal">
                              {deposit.commitment.slice(0, 6)}…{deposit.commitment.slice(-4)}
                            </span>
                          </p>
                          <p className="mt-1 font-mono text-[10px] text-neutral-500">
                            {deposit.token} · {new Date(deposit.timestamp * 1000).toLocaleDateString()} · LEAF_{deposit.leafIndex}
                          </p>
                          {deposit.status === 'available' && (
                            <span className="mt-2 inline-block border border-skaus-primary/40 px-1.5 py-0.5 text-[9px] font-bold tracking-wider text-skaus-primary">
                              STEALTH
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-wrap items-center justify-end gap-3">
                        <div className="text-right">
                          <p
                            className={`text-sm font-bold ${
                              deposit.status === 'available' ? 'text-skaus-primary' : 'text-white'
                            }`}
                          >
                            {deposit.status === 'available' ? '+' : ''}
                            {formatAmount(deposit.amount)} {deposit.token}
                          </p>
                        </div>
                        {deposit.status === 'available' && (
                          <button
                            type="button"
                            onClick={() => openWithdrawModal([deposit.id])}
                            className="border border-skaus-primary/50 bg-skaus-primary/10 px-3 py-1.5 text-[10px] font-bold tracking-wider text-skaus-primary hover:bg-skaus-primary/20"
                          >
                            WITHDRAW
                          </button>
                        )}
                      </div>
                    </div>

                    {deposit.withdrawTx && (
                      <a
                        href={`https://explorer.solana.com/tx/${deposit.withdrawTx}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="mt-3 block font-mono text-[10px] text-skaus-success hover:underline sm:ml-[3.25rem]"
                      >
                        TX:{deposit.withdrawTx.slice(0, 24)}…
                      </a>
                    )}
                    {deposit.withdrawError && (
                      <p className="mt-2 font-mono text-[10px] text-skaus-error sm:ml-[3.25rem]">{deposit.withdrawError}</p>
                    )}
                  </div>
                ))}
              </div>
            )}

            <div className="flex flex-col items-center justify-between gap-3 border-t border-neutral-800 px-4 py-4 text-[10px] text-neutral-600 sm:flex-row sm:px-5">
              <span className="font-mono tracking-widest">END_OF_LEDGER</span>
              <button
                type="button"
                onClick={() => {
                  setScanError(null);
                  setShowScanModal(true);
                  setTimeout(() => modalPinRefs.current[0]?.focus(), 100);
                }}
                disabled={scanning}
                className="inline-flex items-center gap-2 font-bold tracking-[0.2em] text-neutral-400 hover:text-white disabled:opacity-40"
              >
                <svg className="h-3.5 w-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0l3.181 3.183a8.25 8.25 0 0013.803-3.7M4.031 9.865a8.25 8.25 0 0113.803-3.7l3.181 3.182" />
                </svg>
                SYNC_FULL_HISTORY
              </button>
            </div>
          </div>
        </div>
      </DashboardShell>

      {/* Scan PIN modal */}
      {showScanModal && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 pb-safe-modal sm:pb-4 overflow-y-auto"
          onClick={() => { if (!scanning) { setShowScanModal(false); setModalPin(['', '', '', '', '', '']); setModalPinError(''); } }}
          role="presentation"
        >
          <div
            className="bg-skaus-surface border border-skaus-border rounded-2xl p-5 sm:p-6 max-w-sm w-full max-h-[min(32rem,85dvh)] overflow-y-auto space-y-5 animate-scale-in shadow-xl my-auto"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="scan-modal-title"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 id="scan-modal-title" className="text-lg font-bold">Scan for deposits</h3>
                <p className="text-xs text-skaus-muted mt-0.5">Enter your PIN to derive your scan key.</p>
              </div>
              <button
                type="button"
                onClick={() => { setShowScanModal(false); setModalPin(['', '', '', '', '', '']); setModalPinError(''); }}
                disabled={scanning}
                className="p-1 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
                aria-label="Close"
              >
                <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="flex items-center justify-center gap-1.5 sm:gap-2 flex-wrap">
              {modalPin.map((digit, i) => (
                <div key={i} className="flex items-center">
                  <input
                    ref={el => { modalPinRefs.current[i] = el; }}
                    type="password"
                    inputMode="numeric"
                    maxLength={1}
                    value={digit}
                    disabled={scanning}
                    onChange={e => handleModalPinInput(i, e.target.value)}
                    onKeyDown={e => handleModalPinKeyDown(i, e)}
                    onKeyUp={e => { if (e.key === 'Enter' && modalPin.join('').length === 6) void handleScanFromModal(); }}
                    className={`w-9 h-12 sm:w-11 sm:h-[3.25rem] text-center text-lg sm:text-xl font-bold rounded-lg border transition-all duration-200 bg-skaus-darker focus:outline-none disabled:opacity-50 ${
                      digit ? 'border-skaus-primary text-white' : 'border-skaus-border text-skaus-muted'
                    } focus:border-skaus-primary focus:ring-1 focus:ring-skaus-primary/30`}
                  />
                  {i === 2 && <span className="mx-1.5 text-skaus-muted font-bold">-</span>}
                </div>
              ))}
            </div>

            {(modalPinError || scanError) && (
              <p className="text-xs text-skaus-error text-center">{modalPinError || scanError}</p>
            )}

            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => { setShowScanModal(false); setModalPin(['', '', '', '', '', '']); setModalPinError(''); setScanError(null); }}
                disabled={scanning}
                className="flex-1 py-2.5 rounded-xl border border-skaus-border text-sm text-skaus-muted hover:text-white hover:border-skaus-border-hover transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void handleScanFromModal()}
                disabled={modalPin.join('').length !== 6 || scanning}
                className="flex-1 py-2.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary-hover text-white text-sm font-bold transition-all disabled:opacity-50 flex items-center justify-center gap-2"
              >
                {scanning ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Scanning...
                  </>
                ) : 'Scan'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR code for personalised pay link */}
      {showQrModal && registeredName && (
        <div
          className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 pb-safe-modal sm:pb-4 overflow-y-auto"
          onClick={() => setShowQrModal(false)}
          role="presentation"
        >
          <div
            className="bg-skaus-surface border border-skaus-border rounded-2xl p-5 sm:p-6 max-w-sm w-full max-h-[min(36rem,90dvh)] overflow-y-auto space-y-4 animate-scale-in shadow-xl my-auto"
            onClick={e => e.stopPropagation()}
            role="dialog"
            aria-labelledby="qr-modal-title"
          >
            <div className="flex items-center justify-between">
              <h3 id="qr-modal-title" className="text-lg font-bold">Pay link QR</h3>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="p-1 rounded-lg hover:bg-white/5 transition-colors"
                aria-label="Close"
              >
                <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <p className="text-xs text-skaus-muted">Scan to open your public pay page.</p>
            <div className="flex justify-center p-3 sm:p-4 rounded-xl bg-white">
              <div className="w-full max-w-[200px] aspect-square [&_svg]:h-auto [&_svg]:w-full">
                <QRCode
                  value={getPublicProfileUrl(registeredName)}
                  size={200}
                  level="M"
                  fgColor="#0f172a"
                  bgColor="#ffffff"
                />
              </div>
            </div>
            <p className="text-[11px] font-mono text-skaus-muted break-all text-center">
              {getPublicProfileUrl(registeredName)}
            </p>
            <button
              type="button"
              onClick={() => copyLink()}
              className="w-full py-2.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary-hover text-white text-sm font-bold transition-all"
            >
              Copy link
            </button>
          </div>
        </div>
      )}

      {/* Withdraw modal (single or bulk — one relay tx per deposit) */}
      {withdrawModalIds && withdrawModalIds.length > 0 && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-end sm:items-center justify-center z-50 p-4 pb-safe-modal sm:pb-4 overflow-y-auto">
          <div className="bg-skaus-surface border border-skaus-border rounded-2xl p-5 sm:p-6 max-w-md w-full max-h-[min(36rem,90dvh)] overflow-y-auto space-y-4 animate-scale-in my-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-bold">
                {withdrawModalIds.length > 1 ? `Withdraw ${withdrawModalIds.length} deposits` : 'Withdraw'}
              </h3>
              <button
                type="button"
                onClick={() => !withdrawRunning && setWithdrawModalIds(null)}
                disabled={withdrawRunning}
                className="p-1 rounded-lg hover:bg-white/5 transition-colors disabled:opacity-40"
              >
                <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {withdrawModalIds.length > 1 && (
              <p className="text-xs text-skaus-muted bg-skaus-darker/80 border border-skaus-border rounded-lg px-3 py-2">
                Each deposit is withdrawn in a separate on-chain transaction (same recipient for all). The relayer submits them one after another.
              </p>
            )}
            <p className="text-sm text-skaus-muted">
              Enter the destination address. Use a <span className="text-white font-semibold">fresh address</span> for maximum privacy.
            </p>
            <input
              type="text"
              value={withdrawAddress}
              onChange={(e) => {
                setWithdrawAddress(e.target.value);
                setWithdrawAddressError(null);
              }}
              placeholder="Recipient Solana address..."
              disabled={withdrawRunning}
              className="input-field font-mono text-sm disabled:opacity-50"
            />
            {withdrawAddressError && (
              <p className="text-xs text-skaus-error">{withdrawAddressError}</p>
            )}
            {withdrawRunning && withdrawProgress.total > 0 && (
              <p className="text-xs text-skaus-muted text-center">
                Processing deposit {withdrawProgress.current} of {withdrawProgress.total}…
              </p>
            )}
            <div className="flex gap-3 pt-1">
              <button
                type="button"
                onClick={() => !withdrawRunning && setWithdrawModalIds(null)}
                disabled={withdrawRunning}
                className="flex-1 py-2.5 rounded-xl border border-skaus-border text-sm text-skaus-muted hover:text-white hover:border-skaus-border-hover transition-all disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void confirmWithdraw()}
                disabled={!withdrawAddress.trim() || withdrawRunning}
                className="flex-1 py-2.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary-hover text-white text-sm font-bold transition-all disabled:opacity-50"
              >
                {withdrawRunning
                  ? 'Working…'
                  : withdrawModalIds.length > 1
                    ? `Withdraw ${withdrawModalIds.length} via relay`
                    : 'Withdraw via relay'}
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
    </>
  );
}

function BarcodeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden>
      <rect x="3" y="4" width="1.5" height="16" rx="0.5" />
      <rect x="6" y="4" width="2.5" height="16" rx="0.5" />
      <rect x="10" y="4" width="1.5" height="16" rx="0.5" />
      <rect x="13" y="4" width="3" height="16" rx="0.5" />
      <rect x="17.5" y="4" width="1.5" height="16" rx="0.5" />
      <rect x="20" y="4" width="2" height="16" rx="0.5" />
    </svg>
  );
}

function LinkGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5} aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M13.19 8.688a4.5 4.5 0 011.242 7.244l-4.5 4.5a4.5 4.5 0 01-6.364-6.364l1.757-1.757m9.86-3.06a4.5 4.5 0 00-1.242-7.244l4.5-4.5a4.5 4.5 0 016.364 6.364l-1.757 1.757" />
    </svg>
  );
}

function LedgerDemoRow({
  icon,
  title,
  id,
  amount,
  amountClass,
  status,
}: {
  icon: 'in' | 'lock';
  title: string;
  id: string;
  amount: string;
  amountClass: string;
  status: string;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4 px-4 py-4 sm:px-5">
      <div className="flex items-start gap-3">
        <div
          className={`flex h-10 w-10 shrink-0 items-center justify-center border border-neutral-700 bg-neutral-950 ${
            icon === 'in' ? 'text-skaus-primary' : 'text-neutral-300'
          }`}
        >
          {icon === 'in' ? (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" />
            </svg>
          ) : (
            <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
          )}
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-bold uppercase tracking-wide text-white">{title}</p>
          <p className="mt-1 font-mono text-[10px] text-neutral-500">{id}</p>
        </div>
      </div>
      <div className="text-right">
        <p className={`text-sm font-bold ${amountClass}`}>{amount}</p>
        <p className="mt-1 text-[9px] font-bold tracking-wider text-neutral-500">{status}</p>
      </div>
    </div>
  );
}
