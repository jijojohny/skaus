'use client';

import { useState, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { DEPOSIT_TIERS_USDC, splitIntoTiers } from '@skaus/types';
import { DepositForm } from '@/components/DepositForm';
import { TransactionStatus } from '@/components/TransactionStatus';

interface PayPageProps {
  params: { username: string };
}

export default function PayPage({ params }: PayPageProps) {
  const { username } = params;
  const { connected, publicKey } = useWallet();
  const { connection } = useConnection();
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignature, setTxSignature] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const handleDeposit = useCallback(async (amount: bigint, token: string) => {
    if (!publicKey) return;

    setTxStatus('preparing');
    setError(null);

    try {
      const tiers = splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC]);

      setTxStatus('signing');

      // In production: for each tier, construct a deposit transaction
      // with commitment, encrypted note, and stealth address derivation.
      // For MVP demo, we simulate the flow.
      await new Promise(resolve => setTimeout(resolve, 1500));

      setTxStatus('confirming');
      await new Promise(resolve => setTimeout(resolve, 2000));

      setTxSignature('simulated_tx_' + Date.now().toString(36));
      setTxStatus('done');
    } catch (err: any) {
      setError(err.message || 'Transaction failed');
      setTxStatus('error');
    }
  }, [publicKey, connection]);

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <p className="text-sm text-skaus-muted uppercase tracking-wide">Sending to</p>
          <h1 className="text-4xl font-bold">
            <span className="gradient-text">@{username}</span>
          </h1>
          <p className="text-sm text-skaus-muted">
            Payment is private — recipient sees the amount, but the link between
            sender and recipient is cryptographically hidden.
          </p>
        </div>

        <div className="glass-card p-6 space-y-6">
          {!connected ? (
            <div className="flex flex-col items-center space-y-4">
              <p className="text-skaus-muted text-sm">Connect your wallet to send a payment</p>
              <WalletMultiButton />
            </div>
          ) : txStatus === 'idle' || txStatus === 'error' ? (
            <>
              <DepositForm onSubmit={handleDeposit} />
              {error && (
                <div className="p-3 bg-skaus-error/10 border border-skaus-error/30 rounded-lg text-sm text-skaus-error">
                  {error}
                </div>
              )}
            </>
          ) : (
            <TransactionStatus status={txStatus} signature={txSignature} />
          )}
        </div>

        <div className="text-center space-y-2">
          <p className="text-xs text-skaus-muted">
            Powered by SKAUS Stealth Pool on Solana
          </p>
          <div className="flex justify-center gap-4 text-xs text-skaus-muted">
            <span>0% deposit fee</span>
            <span>•</span>
            <span>0.3% withdrawal fee</span>
            <span>•</span>
            <span>~$0.001 network fee</span>
          </div>
        </div>
      </div>
    </main>
  );
}
