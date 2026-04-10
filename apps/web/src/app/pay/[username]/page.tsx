'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import { createPrivySolanaSigner } from '@/lib/privy-solana-signer';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';
import { DepositForm } from '@/components/DepositForm';
import { TransactionStatus } from '@/components/TransactionStatus';
import { resolvePayLink, type PayLinkData } from '@/lib/gateway';
import { executeDeposit } from '@/lib/deposit';
import Link from 'next/link';

interface PayPageProps {
  params: { username: string };
}

export default function PayPage({ params }: PayPageProps) {
  const { username } = params;
  const { authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const solWallet = wallets[0];
  const { signTransaction: privySignTransaction } = useSignTransaction();

  const walletAddress = user?.wallet?.address || solWallet?.address;

  const signTransaction = useMemo(
    () => createPrivySolanaSigner(solWallet, privySignTransaction),
    [solWallet, privySignTransaction],
  );
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  );

  const [txStatus, setTxStatus] = useState<'idle' | 'resolving' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [payLinkData, setPayLinkData] = useState<PayLinkData | null>(null);
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    resolvePayLink(username)
      .then(setPayLinkData)
      .catch(() => {});
  }, [username]);

  const handleDeposit = useCallback(async (amount: bigint, token: string) => {
    if (!walletAddress || !solWallet) return;

    setTxStatus('resolving');
    setError(null);

    try {
      const tiers = token === 'USDC'
        ? splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC])
        : splitIntoTiers(amount, [...DEPOSIT_TIERS_SOL]);

      setProgressText(`Splitting into ${tiers.length} tier deposit${tiers.length > 1 ? 's' : ''}`);

      const { decodePubkey, isMockPubkey } = await import('@/lib/keys');

      let recipientMeta: StealthMetaAddress;
      const meta = payLinkData?.recipientMetaAddress;
      if (meta && !isMockPubkey(meta.scanPubkey) && !isMockPubkey(meta.spendPubkey)) {
        recipientMeta = {
          scanPubkey: decodePubkey(meta.scanPubkey),
          spendPubkey: decodePubkey(meta.spendPubkey),
          version: meta.version || 1,
        };
      } else {
        const { generateStealthKeys } = await import('@skaus/crypto');
        const keys = generateStealthKeys();
        recipientMeta = {
          scanPubkey: keys.scanPubkey,
          spendPubkey: keys.spendPubkey,
          version: 1,
        };
      }

      const publicKey = new PublicKey(walletAddress);

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
  }, [walletAddress, connection, payLinkData, signTransaction, solWallet]);

  return (
    <main className="relative flex flex-col items-center justify-center min-h-screen px-6">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-skaus-primary/5 blur-[150px] rounded-full" />

      <div className="relative z-10 w-full max-w-md space-y-8">
        <div className="text-center space-y-2">
          <p className="section-label">Sending to</p>
          <h1 className="text-display-md">
            <span className="gradient-text">@{username}</span>
          </h1>
          <p className="text-sm text-skaus-muted">
            Payment is private — the link between sender and recipient is cryptographically hidden.
          </p>
          {payLinkData && (
            <p className="text-xs text-skaus-muted/60 font-mono">
              Pool: {payLinkData.pool.slice(0, 8)}... | {payLinkData.network}
            </p>
          )}
        </div>

        <div className="glass-card p-6 space-y-6">
          {!authenticated ? (
            <div className="flex flex-col items-center space-y-4 py-4">
              <p className="text-skaus-muted text-sm">Connect your wallet to send a payment</p>
              <button onClick={() => login()} className="btn-primary text-xs py-2.5 px-6">
                LOGIN TO PAY
              </button>
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
            Powered by <Link href="/" className="text-skaus-primary hover:underline font-semibold">SKAUS</Link> on Solana
          </p>
          <div className="flex justify-center gap-4 text-xs text-skaus-muted">
            <span>0% deposit fee</span>
            <span className="text-skaus-border">|</span>
            <span>0.3% withdrawal fee</span>
            <span className="text-skaus-border">|</span>
            <span>~$0.001 network fee</span>
          </div>
        </div>
      </div>
    </main>
  );
}
