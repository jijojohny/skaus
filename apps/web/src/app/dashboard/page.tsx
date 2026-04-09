'use client';

import { useState, useCallback, useRef } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { fetchDeposits, getRelayStatus } from '@/lib/gateway';
import { scanForDeposits, scanDepositsOnChain, type ScannedDeposit } from '@/lib/scan';
import { executeWithdraw } from '@/lib/withdraw';
import { config } from '@/lib/config';
import { derivePoolPda } from '@/lib/stealth';

export default function DashboardPage() {
  const { connected, publicKey, signMessage } = useWallet();
  const { connection } = useConnection();
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

  const deriveScanKey = useCallback(async (): Promise<Uint8Array> => {
    if (scanKeyRef.current) return scanKeyRef.current;

    if (!signMessage) {
      throw new Error(
        'Your wallet does not support message signing. ' +
        'This is required to derive your scan key for detecting deposits.'
      );
    }

    const message = new TextEncoder().encode(
      'SKAUS: Derive stealth scan key\n' +
      `Wallet: ${publicKey!.toBase58()}`
    );
    const signature = await signMessage(message);

    const { sha256 } = await import('@noble/hashes/sha256');
    const { hkdf } = await import('@noble/hashes/hkdf');
    const masterSeed = sha256(signature);
    const scanPrivkey = hkdf(sha256, masterSeed, 'skaus-v1', 'skaus-scan-key', 32);

    scanKeyRef.current = scanPrivkey;
    return scanPrivkey;
  }, [signMessage, publicKey]);

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
        setScanError(
          'No deposits found for your wallet. ' +
          'Make sure someone has sent you a payment first.'
        );
      }
    } catch (err: any) {
      if (err.message?.includes('User rejected')) {
        setScanError('Signature required to derive your scan key. Please approve the message signing request.');
      } else {
        setScanError(err.message || 'Failed to scan deposits. Is the gateway running?');
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

  if (!connected) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="glass-card p-8 text-center space-y-4 max-w-md">
          <h1 className="text-2xl font-bold">Recipient Dashboard</h1>
          <p className="text-skaus-muted text-sm">
            Connect your wallet to scan for incoming deposits and manage withdrawals.
          </p>
          <WalletMultiButton />
        </div>
      </main>
    );
  }

  return (
    <main className="max-w-4xl mx-auto px-6 py-12 space-y-8">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Dashboard</h1>
          <p className="text-skaus-muted text-sm mt-1">
            Scan for deposits and withdraw to a fresh wallet
          </p>
        </div>
        <div className="flex items-center gap-3">
          {relayActive !== null && (
            <span className={`text-xs px-2 py-1 rounded-full ${
              relayActive
                ? 'bg-skaus-success/10 text-skaus-success'
                : 'bg-yellow-500/10 text-yellow-500'
            }`}>
              Relay {relayActive ? 'Active' : 'Offline'}
            </span>
          )}
          <select
            value={scanMode}
            onChange={(e) => setScanMode(e.target.value as 'indexer' | 'onchain')}
            className="px-3 py-2 rounded-lg bg-skaus-dark border border-skaus-border text-xs text-white"
          >
            <option value="indexer">Via Indexer</option>
            <option value="onchain">On-chain</option>
          </select>
          <button
            onClick={scanDeposits}
            disabled={scanning}
            className="px-5 py-2.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary/90 text-white font-medium text-sm transition-all disabled:opacity-50"
          >
            {scanning ? 'Scanning...' : 'Scan for Deposits'}
          </button>
        </div>
      </div>

      {scanError && (
        <div className="p-3 bg-yellow-500/10 border border-yellow-500/30 rounded-lg text-sm text-yellow-500">
          {scanError}
        </div>
      )}

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Deposits" value={deposits.length.toString()} />
        <StatCard label="Available" value={deposits.filter(d => d.status === 'available').length.toString()} />
        <StatCard label="Withdrawn" value={deposits.filter(d => d.status === 'withdrawn').length.toString()} />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-skaus-border">
          <h2 className="font-semibold">Deposits</h2>
        </div>
        {deposits.length === 0 ? (
          <div className="px-6 py-12 text-center text-skaus-muted text-sm">
            No deposits found. Click &quot;Scan for Deposits&quot; to check the pool.
          </div>
        ) : (
          <div className="divide-y divide-skaus-border">
            {deposits.map(deposit => (
              <div key={deposit.id} className="px-6 py-4 space-y-2">
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <p className="font-medium text-sm">
                      {formatAmount(deposit.amount)} {deposit.token}
                    </p>
                    <p className="text-xs text-skaus-muted font-mono">
                      {deposit.commitment.slice(0, 16)}...
                    </p>
                    <p className="text-xs text-skaus-muted">
                      {new Date(deposit.timestamp * 1000).toLocaleString()} | Leaf #{deposit.leafIndex}
                    </p>
                    {deposit.txSignature && (
                      <a
                        href={`https://explorer.solana.com/tx/${deposit.txSignature}?cluster=devnet`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="text-xs text-skaus-primary hover:underline"
                      >
                        View on Explorer
                      </a>
                    )}
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs px-2 py-1 rounded-full ${
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
                        className="px-4 py-1.5 rounded-lg bg-skaus-primary/10 text-skaus-primary text-sm font-medium hover:bg-skaus-primary/20 transition-all"
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
                    className="text-xs text-skaus-success hover:underline block"
                  >
                    Withdrawal TX: {deposit.withdrawTx.slice(0, 32)}...
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

      {showWithdrawModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50">
          <div className="glass-card p-6 max-w-md w-full mx-4 space-y-4">
            <h3 className="text-lg font-semibold">Withdraw Deposit</h3>
            <p className="text-sm text-skaus-muted">
              Enter the Solana address where you want to receive the tokens.
              Use a fresh address for maximum privacy.
            </p>
            <input
              type="text"
              value={withdrawAddress}
              onChange={(e) => setWithdrawAddress(e.target.value)}
              placeholder="Recipient Solana address..."
              className="w-full px-4 py-3 bg-skaus-dark border border-skaus-border rounded-lg text-sm font-mono text-white placeholder:text-skaus-muted/50 focus:outline-none focus:border-skaus-primary transition-colors"
            />
            <div className="flex gap-3">
              <button
                onClick={() => setShowWithdrawModal(null)}
                className="flex-1 py-2.5 rounded-lg bg-skaus-dark text-skaus-muted text-sm font-medium hover:text-white transition-all"
              >
                Cancel
              </button>
              <button
                onClick={() => handleWithdraw(showWithdrawModal)}
                disabled={!withdrawAddress}
                className="flex-1 py-2.5 rounded-lg bg-skaus-primary hover:bg-skaus-primary/90 text-white text-sm font-medium transition-all disabled:opacity-50"
              >
                Withdraw via Relay
              </button>
            </div>
            {relayActive === false && (
              <p className="text-xs text-yellow-500 text-center">
                Relay is currently offline. The relayer needs a funded private key to process withdrawals.
              </p>
            )}
          </div>
        </div>
      )}
    </main>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="glass-card p-5 space-y-1">
      <p className="text-xs text-skaus-muted uppercase tracking-wide">{label}</p>
      <p className="text-2xl font-bold">{value}</p>
    </div>
  );
}
