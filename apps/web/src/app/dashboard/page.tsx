'use client';

import { useState } from 'react';
import { useWallet } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';

interface DepositEntry {
  id: string;
  amount: string;
  token: string;
  timestamp: number;
  status: 'pending' | 'available' | 'withdrawn';
}

export default function DashboardPage() {
  const { connected } = useWallet();
  const [deposits, setDeposits] = useState<DepositEntry[]>([]);
  const [scanning, setScanning] = useState(false);

  const scanDeposits = async () => {
    setScanning(true);
    // In production: scan DepositNote accounts, try decrypting with scan key
    await new Promise(resolve => setTimeout(resolve, 2000));

    setDeposits([
      {
        id: 'dep_1',
        amount: '100.00',
        token: 'USDC',
        timestamp: Date.now() - 3600_000,
        status: 'available',
      },
      {
        id: 'dep_2',
        amount: '10.00',
        token: 'USDC',
        timestamp: Date.now() - 7200_000,
        status: 'available',
      },
    ]);

    setScanning(false);
  };

  const handleWithdraw = async (depositId: string) => {
    // In production: generate ZK proof, submit via relayer or self-relay
    setDeposits(prev =>
      prev.map(d => d.id === depositId ? { ...d, status: 'withdrawn' as const } : d)
    );
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
        <button
          onClick={scanDeposits}
          disabled={scanning}
          className="px-5 py-2.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary/90 text-white font-medium text-sm transition-all disabled:opacity-50"
        >
          {scanning ? 'Scanning...' : 'Scan for Deposits'}
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <StatCard label="Total Available" value={`$${deposits.filter(d => d.status === 'available').reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2)}`} />
        <StatCard label="Total Withdrawn" value={`$${deposits.filter(d => d.status === 'withdrawn').reduce((sum, d) => sum + parseFloat(d.amount), 0).toFixed(2)}`} />
        <StatCard label="Deposits Found" value={deposits.length.toString()} />
      </div>

      <div className="glass-card overflow-hidden">
        <div className="px-6 py-4 border-b border-skaus-border">
          <h2 className="font-semibold">Deposits</h2>
        </div>
        {deposits.length === 0 ? (
          <div className="px-6 py-12 text-center text-skaus-muted text-sm">
            No deposits found. Click "Scan for Deposits" to check the pool.
          </div>
        ) : (
          <div className="divide-y divide-skaus-border">
            {deposits.map(deposit => (
              <div key={deposit.id} className="px-6 py-4 flex items-center justify-between">
                <div className="space-y-1">
                  <p className="font-medium">
                    {deposit.amount} {deposit.token}
                  </p>
                  <p className="text-xs text-skaus-muted">
                    {new Date(deposit.timestamp).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3">
                  <span className={`text-xs px-2 py-1 rounded-full ${
                    deposit.status === 'available'
                      ? 'bg-skaus-success/10 text-skaus-success'
                      : deposit.status === 'withdrawn'
                        ? 'bg-skaus-muted/10 text-skaus-muted'
                        : 'bg-yellow-500/10 text-yellow-500'
                  }`}>
                    {deposit.status}
                  </span>
                  {deposit.status === 'available' && (
                    <button
                      onClick={() => handleWithdraw(deposit.id)}
                      className="px-4 py-1.5 rounded-lg bg-skaus-primary/10 text-skaus-primary text-sm font-medium hover:bg-skaus-primary/20 transition-all"
                    >
                      Withdraw
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
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
