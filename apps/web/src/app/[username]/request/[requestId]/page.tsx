'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import {
  getPaymentRequest,
  lookupName,
  type PaymentRequestData,
} from '@/lib/gateway';
import { executeDeposit } from '@/lib/deposit';
import { TransactionStatus } from '@/components/TransactionStatus';
import { decodePubkey, isMockPubkey } from '@/lib/keys';
import { config } from '@/lib/config';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';

interface RequestPageProps {
  params: { username: string; requestId: string };
}

export default function PaymentRequestPage({ params }: RequestPageProps) {
  const { username, requestId } = params;
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

  const [request, setRequest] = useState<PaymentRequestData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [progressText, setProgressText] = useState('');

  useEffect(() => {
    getPaymentRequest(requestId)
      .then(setRequest)
      .catch(() => setError('Payment request not found'))
      .finally(() => setLoading(false));
  }, [requestId]);

  const handlePay = useCallback(async () => {
    if (!publicKey || !signTransaction || !request) return;

    setTxStatus('preparing');
    setError(null);

    try {
      const decimals = request.token === 'SOL' ? 9 : 6;
      const rawAmount = BigInt(Math.floor(request.amount * 10 ** decimals));

      const tiers = request.token === 'SOL'
        ? splitIntoTiers(rawAmount, [...DEPOSIT_TIERS_SOL])
        : splitIntoTiers(rawAmount, [...DEPOSIT_TIERS_USDC]);

      setProgressText(`Splitting into ${tiers.length} deposit${tiers.length > 1 ? 's' : ''}`);

      let recipientMeta: StealthMetaAddress;

      const nameData = await lookupName(username).catch(() => null);
      const meta = nameData?.stealthMetaAddress;
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

      const result = await executeDeposit(
        connection,
        publicKey,
        signTransaction,
        rawAmount,
        request.token as 'USDC' | 'SOL',
        recipientMeta,
        (step, current, total) => {
          setTxStatus(step as any);
          setProgressText(`Tier ${current}/${total}: ${step}`);
        },
      );

      try {
        await fetch(`${config.gatewayUrl}/requests/${requestId}/payment`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            txSignature: result.signatures[0],
            amount: request.amount,
          }),
        });
      } catch {
        // Non-critical: payment is on-chain regardless
      }

      setTxSignatures(result.signatures);
      setTxStatus('done');
    } catch (err: any) {
      setError(err.message || 'Payment failed');
      setTxStatus('error');
    }
  }, [publicKey, signTransaction, connection, request, username, requestId]);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-skaus-muted">Loading request...</div>
      </main>
    );
  }

  if (!request) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-white">Request Not Found</h1>
          <p className="text-skaus-muted">{error || 'This payment request does not exist.'}</p>
          <a href={`/${username}`} className="text-skaus-primary hover:underline text-sm">
            Visit @{username}
          </a>
        </div>
      </main>
    );
  }

  const isExpired = request.status === 'expired' || (request.expiresAt && Date.now() > request.expiresAt);
  const isPaid = request.status === 'paid';
  const isCancelled = request.status === 'cancelled';
  const canPay = !isExpired && !isPaid && !isCancelled;

  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="w-full max-w-md space-y-6">
        <div className="text-center space-y-2">
          <p className="text-sm text-skaus-muted uppercase tracking-wide">Payment Request</p>
          <h1 className="text-3xl font-bold">
            <span className="gradient-text">@{username}</span>
          </h1>
        </div>

        <div className="glass-card p-6 space-y-5">
          <div className="text-center">
            <p className="text-4xl font-bold text-white">
              {request.token === 'SOL' ? '◎' : '$'}{request.amount}
            </p>
            <p className="text-sm text-skaus-muted mt-1">{request.token}</p>
          </div>

          {request.memo && (
            <div className="p-3 bg-skaus-dark rounded-lg">
              <p className="text-xs text-skaus-muted uppercase mb-1">Memo</p>
              <p className="text-sm text-white">{request.memo}</p>
            </div>
          )}

          <div className="flex justify-center">
            <StatusBadge status={request.status} />
          </div>

          {request.expiresAt && (
            <p className="text-xs text-skaus-muted text-center">
              {isExpired
                ? 'This request has expired'
                : `Expires: ${new Date(request.expiresAt).toLocaleDateString()}`}
            </p>
          )}

          {canPay && (
            <>
              {!connected ? (
                <div className="flex flex-col items-center space-y-4">
                  <p className="text-skaus-muted text-sm">Connect your wallet to pay</p>
                  <WalletMultiButton />
                </div>
              ) : txStatus === 'idle' || txStatus === 'error' ? (
                <>
                  <button
                    onClick={handlePay}
                    className="w-full py-3 rounded-xl bg-skaus-primary hover:bg-skaus-primary/90 text-white font-semibold transition-all hover:shadow-lg hover:shadow-skaus-primary/25"
                  >
                    Pay {request.token === 'SOL' ? '◎' : '$'}{request.amount} {request.token}
                  </button>
                  {error && (
                    <div className="p-3 bg-skaus-error/10 border border-skaus-error/30 rounded-lg text-sm text-skaus-error">
                      {error}
                    </div>
                  )}
                </>
              ) : (
                <TransactionStatus
                  status={txStatus}
                  signature={txSignatures[0] || null}
                  progressText={progressText}
                  allSignatures={txSignatures}
                />
              )}
            </>
          )}
        </div>

        <div className="text-center">
          <p className="text-xs text-skaus-muted">
            Powered by{' '}
            <a href="/" className="text-skaus-primary hover:underline">SKAUS</a>
            {' '}— private payments on Solana
          </p>
        </div>
      </div>
    </main>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    pending: 'bg-yellow-500/10 text-yellow-400 border-yellow-500/30',
    partial: 'bg-blue-500/10 text-blue-400 border-blue-500/30',
    paid: 'bg-skaus-success/10 text-skaus-success border-skaus-success/30',
    expired: 'bg-skaus-muted/10 text-skaus-muted border-skaus-muted/30',
    cancelled: 'bg-skaus-error/10 text-skaus-error border-skaus-error/30',
  };

  return (
    <span className={`px-3 py-1 rounded-full text-xs font-medium border ${styles[status] || styles.pending}`}>
      {status.toUpperCase()}
    </span>
  );
}
