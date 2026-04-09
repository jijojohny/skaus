'use client';

import { useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { PublicKey } from '@solana/web3.js';
import { fetchDeposits, getRelayStatus } from '@/lib/gateway';
import { executeWithdraw } from '@/lib/withdraw';
import { config } from '@/lib/config';
import { derivePoolPda } from '@/lib/stealth';

interface DepositEntry {
  id: string;
  commitment: string;
  leafIndex: number;
  amount: string;
  token: string;
  timestamp: number;
  txSignature: string;
  encryptedNote: string;
  status: 'available' | 'withdrawing' | 'withdrawn' | 'error';
  withdrawTx?: string;
  withdrawError?: string;
}

export default function DashboardPage() {
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [deposits, setDeposits] = useState<DepositEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [relayActive, setRelayActive] = useState<boolean | null>(null);
  const [withdrawAddress, setWithdrawAddress] = useState('');
  const [showWithdrawModal, setShowWithdrawModal] = useState<string | null>(null);

  const scanDeposits = useCallback(async () => {
    setScanning(true);
    setScanError(null);

    try {
      const [indexed, relayStatus] = await Promise.all([
        fetchDeposits(),
        getRelayStatus().catch(() => null),
      ]);

      setRelayActive(relayStatus?.active ?? null);

      const entries: DepositEntry[] = indexed.map((dep) => ({
        id: dep.commitment,
        commitment: dep.commitment,
        leafIndex: dep.leafIndex,
        amount: dep.amount,
        token: 'USDC',
        timestamp: dep.timestamp * 1000,
        txSignature: dep.txSignature,
        encryptedNote: dep.encryptedNote,
        status: 'available' as const,
      }));

      setDeposits(entries);

      if (entries.length === 0) {
        setScanError('No deposits found in the pool yet. Make a deposit first via the Pay page.');
      }
    } catch (err: any) {
      setScanError(err.message || 'Failed to scan deposits. Is the gateway running?');
    } finally {
      setScanning(false);
    }
  }, []);

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
      if (poolAccount && poolAccount.data.length >= 151) {
        // merkle_root offset: disc(8) + authority(32) + token_mint(32) + fee_bps(2) +
        // min_deposit(8) + max_deposit(8) + total_deposits(8) + total_withdrawals(8) +
        // deposit_count(8) + withdrawal_count(8) + current_merkle_index(4) + paused(1)
        // = 127
        merkleRoot = Buffer.from(poolAccount.data.slice(127, 159)).toString('hex');
      }

      const deposit = deposits.find(d => d.id === depositId)!;
      const result = await executeWithdraw(
        {
          id: deposit.id,
          commitment: deposit.commitment,
          leafIndex: deposit.leafIndex,
          amount: BigInt(deposit.amount || '0'),
          token: deposit.token,
          timestamp: deposit.timestamp,
          txSignature: deposit.txSignature,
          noteData: {
            secret: 0n,
            nullifier: BigInt('0x' + deposit.commitment.slice(0, 16)),
            amount: BigInt(deposit.amount || '0'),
            tokenMint: config.tokenMint,
            ephemeralPubkey: new Uint8Array(32),
          },
          status: 'available',
        },
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
                    <p className="font-medium font-mono text-sm">
                      {deposit.commitment.slice(0, 16)}...
                    </p>
                    <p className="text-xs text-skaus-muted">
                      {new Date(deposit.timestamp).toLocaleString()} | Leaf #{deposit.leafIndex}
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
