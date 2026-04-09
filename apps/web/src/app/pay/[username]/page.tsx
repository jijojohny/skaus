'use client';

import { useState, useCallback, useEffect } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';
import { DepositForm } from '@/components/DepositForm';
import { TransactionStatus } from '@/components/TransactionStatus';
import { resolvePayLink, type PayLinkData } from '@/lib/gateway';
import { executeDeposit } from '@/lib/deposit';

interface PayPageProps {
  params: { username: string };
}

export default function PayPage({ params }: PayPageProps) {
  const { username } = params;
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();
  const [txStatus, setTxStatus] = useState<'idle' | 'resolving' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payLinkData, setPayLinkData] = useState<PayLinkData | null>(null);
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    resolvePayLink(username)
      .then(setPayLinkData)
      .catch(() => {/* optional: user not registered yet, allow direct deposit */});
  }, [username]);

  const handleDeposit = useCallback(async (amount: bigint, token: string) => {
    if (!publicKey || !signTransaction) return;

    setTxStatus('resolving');
    setError(null);

    try {
      const tiers = token === 'USDC'
        ? splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC])
        : splitIntoTiers(amount, [...DEPOSIT_TIERS_SOL]);

      setProgressText(`Splitting into ${tiers.length} tier deposit${tiers.length > 1 ? 's' : ''}`);

      // Build a stealth meta-address from the paylink data or use a
      // self-deposit pattern (deposit to yourself for testing).
      let recipientMeta: StealthMetaAddress;
      if (payLinkData && payLinkData.recipientMetaAddress && !payLinkData.recipientMetaAddress.startsWith('mock_')) {
        const metaBytes = Buffer.from(payLinkData.recipientMetaAddress, 'hex');
        recipientMeta = {
          scanPubkey: metaBytes.slice(0, 32),
          spendPubkey: metaBytes.slice(32, 64),
          version: 1,
        };
      } else {
        // Self-deposit mode: generate ephemeral keys for testing.
        // In production, the recipient's meta-address would come from
        // the gateway pay-link resolution.
        const { generateStealthKeys } = await import('@skaus/crypto');
        const keys = generateStealthKeys();
        recipientMeta = {
          scanPubkey: keys.scanPubkey,
          spendPubkey: keys.spendPubkey,
          version: 1,
        };
      }

      const result = await executeDeposit(
        connection,
        publicKey,
        signTransaction,
        amount,
        token as 'USDC' | 'SOL',
        recipientMeta,
        (step, current, total) => {
          setTxStatus(step as any);
          setProgressText(`Tier ${current}/${total}: ${step}`);
        },
      );

      setTxSignatures(result.signatures);
      setTxStatus('done');
    } catch (err: any) {
      console.error('Deposit failed:', err);
      setError(err.message || 'Transaction failed');
      setTxStatus('error');
    }
  }, [publicKey, signTransaction, connection, payLinkData]);

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
          {payLinkData && (
            <p className="text-xs text-skaus-muted/60">
              Network: {payLinkData.network} | Pool: {payLinkData.pool.slice(0, 8)}...
            </p>
          )}
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
            <TransactionStatus
              status={txStatus === 'resolving' ? 'preparing' : txStatus}
              signature={txSignatures[0] || null}
              progressText={progressText}
              allSignatures={txSignatures}
            />
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
