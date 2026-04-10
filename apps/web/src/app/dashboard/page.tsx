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

  type DashboardDeposit = Omit<ScannedDeposit, 'status'> & {
    status: 'available' | 'withdrawing' | 'withdrawn' | 'error';
    withdrawTx?: string;
    withdrawError?: string;
  };

  const [deposits, setDeposits] = useState<DashboardDeposit[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [relayActive, setRelayActive] = useState<boolean | null>(null);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState<string | null>(null);
  const [scanMode, setScanMode] = useState<'indexer' | 'onchain'>('indexer');

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
    }
  }, [ready, authenticated, walletAddress, router]);

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

  if (!ready) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (!authenticated) return null;

  return (
    <div className="relative min-h-screen">
      <div className="absolute inset-0 grid-bg" />

      {/* Nav */}
      <nav className="relative z-10 flex items-center justify-between px-6 lg:px-12 py-6 border-b border-skaus-border">
        <Link href="/" className="text-xl font-black tracking-tight">
          <span className="text-skaus-primary">S</span>KAUS
        </Link>
        <div className="flex items-center gap-4">
          {walletAddress && (
            <span className="text-xs font-mono text-skaus-muted bg-skaus-surface px-3 py-1.5 rounded-lg border border-skaus-border">
              {walletAddress.slice(0, 4)}...{walletAddress.slice(-4)}
            </span>
          )}
          <button onClick={logout} className="text-xs text-skaus-muted hover:text-white transition-colors">
            Logout
          </button>
        </div>
      </nav>

      <main className="relative z-10 max-w-4xl mx-auto px-6 py-10 space-y-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-display-sm">Dashboard</h1>
            <p className="text-sm text-skaus-muted mt-1">Scan for deposits and withdraw to a fresh wallet</p>
          </div>
          <div className="flex items-center gap-3">
            {relayActive !== null && (
              <span className={`text-xs px-3 py-1 rounded-full font-semibold uppercase tracking-wider ${
                relayActive
                  ? 'bg-skaus-success/10 text-skaus-success border border-skaus-success/20'
                  : 'bg-skaus-warning/10 text-skaus-warning border border-skaus-warning/20'
              }`}>
                Relay {relayActive ? 'Active' : 'Offline'}
              </span>
            )}
            <select
              value={scanMode}
              onChange={(e) => setScanMode(e.target.value as 'indexer' | 'onchain')}
              className="px-3 py-2 rounded-lg bg-skaus-darker border border-skaus-border text-xs text-white focus:outline-none focus:border-skaus-primary"
            >
              <option value="indexer">Via Indexer</option>
              <option value="onchain">On-chain</option>
            </select>
            <button
              onClick={scanDeposits}
              disabled={scanning}
              className="btn-primary text-xs py-2.5 px-5 disabled:opacity-50"
            >
              {scanning ? 'SCANNING...' : 'SCAN DEPOSITS'}
            </button>
          </div>
        </div>

        {scanError && (
          <div className="p-3 bg-skaus-warning/10 border border-skaus-warning/30 rounded-lg text-sm text-skaus-warning">
            {scanError}
          </div>
        )}

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          <StatCard label="Total" value={deposits.length.toString()} />
          <StatCard label="Available" value={deposits.filter(d => d.status === 'available').length.toString()} accent />
          <StatCard label="Withdrawn" value={deposits.filter(d => d.status === 'withdrawn').length.toString()} />
        </div>

        {/* Deposit List */}
        <div className="glass-card overflow-hidden">
          <div className="px-6 py-4 border-b border-skaus-border flex items-center justify-between">
            <h2 className="font-bold text-sm uppercase tracking-wider">Deposits</h2>
          </div>

          {deposits.length === 0 ? (
            <div className="px-6 py-16 text-center">
              <p className="text-skaus-muted text-sm">No deposits found.</p>
              <p className="text-skaus-muted/60 text-xs mt-1">Click &quot;Scan Deposits&quot; to check the pool.</p>
            </div>
          ) : (
            <div className="divide-y divide-skaus-border">
              {deposits.map(deposit => (
                <div key={deposit.id} className="px-6 py-4 space-y-2 hover:bg-skaus-surface/50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="space-y-1">
                      <p className="font-bold text-sm">
                        {formatAmount(deposit.amount)} {deposit.token}
                      </p>
                      <p className="text-xs text-skaus-muted font-mono">
                        {deposit.commitment.slice(0, 16)}...
                      </p>
                      <p className="text-xs text-skaus-muted">
                        {new Date(deposit.timestamp * 1000).toLocaleString()} | Leaf #{deposit.leafIndex}
                      </p>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase tracking-wider ${
                        deposit.status === 'available'
                          ? 'bg-skaus-success/10 text-skaus-success'
                          : deposit.status === 'withdrawn'
                            ? 'bg-skaus-muted/10 text-skaus-muted'
                            : deposit.status === 'withdrawing'
                              ? 'bg-skaus-primary/10 text-skaus-primary'
                              : 'bg-skaus-error/10 text-skaus-error'
                      }`}>
                        {deposit.status}
                      </span>
                      {deposit.status === 'available' && (
                        <button
                          onClick={() => setShowWithdrawModal(deposit.id)}
                          className="btn-primary text-xs py-1.5 px-4"
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
                      className="text-xs text-skaus-success hover:underline block font-mono"
                    >
                      TX: {deposit.withdrawTx.slice(0, 32)}...
                    </a>
                  )}
                  {deposit.withdrawError && (
                    <p className="text-xs text-skaus-error">{deposit.withdrawError}</p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Withdraw Modal */}
        {showWithdrawModal && (
          <div className="fixed inset-0 bg-black/70 backdrop-blur-sm flex items-center justify-center z-50">
            <div className="glass-card p-6 max-w-md w-full mx-4 space-y-4 animate-scale-in">
              <h3 className="text-lg font-bold">Withdraw Deposit</h3>
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
              <div className="flex gap-3">
                <button
                  onClick={() => setShowWithdrawModal(null)}
                  className="flex-1 btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={() => handleWithdraw(showWithdrawModal)}
                  disabled={!withdrawAddress}
                  className="flex-1 btn-primary disabled:opacity-50"
                >
                  WITHDRAW VIA RELAY
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
      </main>
    </div>
  );
}

function StatCard({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="glass-card p-5 space-y-1">
      <p className="section-label">{label}</p>
      <p className={`text-2xl font-black ${accent ? 'text-skaus-primary' : 'text-white'}`}>{value}</p>
    </div>
  );
}
