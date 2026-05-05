'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignTransaction, useSignMessage } from '@privy-io/react-auth/solana';
import { Connection, PublicKey } from '@solana/web3.js';
import bs58 from 'bs58';
import { createPrivySolanaSigner } from '@/lib/privy-solana-signer';
import { lookupName, fetchProfile, unlockGatedContent, type NameLookupResult } from '@/lib/gateway';
import { WalletBalanceWidget } from '@/components/WalletBalanceWidget';
import { DepositForm } from '@/components/DepositForm';
import { TransactionStatus } from '@/components/TransactionStatus';
import { executeDeposit } from '@/lib/deposit';
import { decodePubkey, isMockPubkey } from '@/lib/keys';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';
import type { CompressedProfile } from '@skaus/types';
import Link from 'next/link';

interface ProfilePageProps {
  params: { username: string };
}

const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === 'true';

const DEMO_PROFILES: Record<string, CompressedProfile> = {
  alice: {
    displayName: 'Alice Creator',
    bio: 'Building cool stuff on Solana',
    avatarUri: '',
    links: [
      { platform: 'twitter', url: 'https://twitter.com/alice', verified: true },
      { platform: 'github', url: 'https://github.com/alice', verified: false },
    ],
    paymentConfig: {
      acceptedTokens: ['USDC', 'SOL'],
      suggestedAmounts: [5, 10, 25, 50],
      customAmountEnabled: true,
      thankYouMessage: 'Thanks for the support!',
    },
    tiers: [
      {
        id: 'supporter',
        name: 'Supporter',
        amount: 5,
        currency: 'USDC',
        benefits: ['Shoutout on Twitter', 'Access to private updates'],
        gateType: 'one-time',
      },
      {
        id: 'vip',
        name: 'VIP',
        amount: 25,
        currency: 'USDC',
        benefits: ['All Supporter benefits', 'Private Discord access', 'Monthly AMA'],
        gateType: 'recurring-hint',
      },
    ],
    gatedContent: [
      {
        contentId: '1',
        encryptedUri: '',
        accessCondition: 'tier:vip',
        previewText: 'Exclusive Market Analysis Report',
      },
    ],
    version: 1,
    updatedAt: Date.now(),
  },
};

const MOCK_PROFILES: Record<string, CompressedProfile> = DEMO_MODE ? DEMO_PROFILES : {};

interface UnlockItemState {
  txSig: string;
  unlocking: boolean;
  result: string | null;
  error: string | null;
}

export default function ProfilePage({ params }: ProfilePageProps) {
  const { username } = params;
  const { authenticated, user, login } = usePrivy();
  const { wallets } = useWallets();
  const solWallet = wallets[0];
  const { signTransaction: privySignTransaction } = useSignTransaction();
  const { signMessage } = useSignMessage();

  const walletAddress = user?.wallet?.address || solWallet?.address;

  const signTransaction = useMemo(
    () => createPrivySolanaSigner(solWallet, privySignTransaction),
    [solWallet, privySignTransaction],
  );
  const connection = new Connection(
    process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
  );

  const [nameData, setNameData] = useState<NameLookupResult | null>(null);
  const [profile, setProfile] = useState<CompressedProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);
  const [showPayment, setShowPayment] = useState(false);
  const [selectedTier, setSelectedTier] = useState<string | null>(null);

  const [txStatus, setTxStatus] = useState<'idle' | 'preparing' | 'signing' | 'confirming' | 'done' | 'error'>('idle');
  const [txSignatures, setTxSignatures] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [progressText, setProgressText] = useState('');
  const [unlockItems, setUnlockItems] = useState<Record<string, UnlockItemState>>({});

  useEffect(() => {
    async function load() {
      try {
        const [data, gatewayProfile] = await Promise.all([
          lookupName(username).catch(() => null),
          fetchProfile(username).catch(() => null),
        ]);

        if (data && !data.available) {
          setNameData(data);
        }

        if (gatewayProfile) {
          setProfile(gatewayProfile);
        } else {
          const fallback = MOCK_PROFILES[username.toLowerCase()] || buildDefaultProfile(username);
          setProfile(fallback);
        }

        if (!data?.available === false && !gatewayProfile && !MOCK_PROFILES[username.toLowerCase()]) {
          setNotFound(true);
        }
      } catch {
        const fallback = MOCK_PROFILES[username.toLowerCase()];
        if (fallback) {
          setProfile(fallback);
        } else {
          setNotFound(true);
        }
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [username]);

  const handleDeposit = useCallback(async (amount: bigint, token: string) => {
    if (!walletAddress || !solWallet) return;

    setTxStatus('preparing');
    setError(null);

    try {
      const tiers = token === 'USDC'
        ? splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC])
        : splitIntoTiers(amount, [...DEPOSIT_TIERS_SOL]);

      setProgressText(`Splitting into ${tiers.length} deposit${tiers.length > 1 ? 's' : ''}`);

      let recipientMeta: StealthMetaAddress;
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
        recipientMeta = { scanPubkey: keys.scanPubkey, spendPubkey: keys.spendPubkey, version: 1 };
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
      setError(err.message || 'Transaction failed');
      setTxStatus('error');
    }
  }, [walletAddress, connection, nameData, signTransaction, solWallet]);

  const handleUnlock = useCallback(async (contentId: string) => {
    if (!authenticated || !walletAddress || !solWallet) {
      login();
      return;
    }
    const txSig = (unlockItems[contentId]?.txSig || '').trim();
    if (!txSig) return;

    setUnlockItems(prev => ({ ...prev, [contentId]: { ...prev[contentId], unlocking: true, error: null, result: null } }));

    try {
      const challenge = `skaus-unlock-v1:${contentId}:${txSig}`;
      const { signature } = await signMessage({
        message: new TextEncoder().encode(challenge),
        wallet: solWallet,
      });
      const challengeSignature = bs58.encode(signature);
      const plainUri = await unlockGatedContent(username, contentId, txSig, walletAddress, challengeSignature);
      setUnlockItems(prev => ({ ...prev, [contentId]: { ...prev[contentId], unlocking: false, result: plainUri } }));
    } catch (err: any) {
      setUnlockItems(prev => ({ ...prev, [contentId]: { ...prev[contentId], unlocking: false, error: err.message || 'Unlock failed' } }));
    }
  }, [authenticated, walletAddress, solWallet, signMessage, unlockItems, username, login]);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen min-h-[100dvh] overflow-x-clip px-4">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen min-h-[100dvh] overflow-x-clip px-4 sm:px-6">
        <div className="absolute inset-0 grid-bg" />
        <div className="relative z-10 text-center space-y-4">
          <h1 className="text-display-md text-white">@{username}</h1>
          <p className="text-skaus-muted">This name is not registered yet.</p>
          <Link href="/" className="text-skaus-primary hover:underline text-sm font-semibold">
            Go to SKAUS home
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="relative flex flex-col items-center min-h-screen min-h-[100dvh] overflow-x-clip px-4 sm:px-6 py-10 sm:py-12">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(37.5rem,calc(100vw-1.5rem))] h-[min(25rem,45vh)] bg-skaus-primary/5 blur-[150px] rounded-full" />

      <div className="relative z-10 w-full max-w-md min-w-0 space-y-6">
        {/* Avatar + Identity */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-2xl bg-skaus-primary/20 border border-skaus-primary/30 overflow-hidden flex items-center justify-center">
            {profile?.avatarUri ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={profile.avatarUri} alt={profile.displayName || username} className="w-full h-full object-cover" />
            ) : (
              <span className="text-3xl font-black text-skaus-primary">{(profile?.displayName || username)[0].toUpperCase()}</span>
            )}
          </div>
          <h1 className="text-display-sm text-white">{profile?.displayName || username}</h1>
          <p className="text-sm text-skaus-muted max-w-xs mx-auto">{profile?.bio}</p>
        </div>

        {/* Social Links */}
        {profile?.links && profile.links.length > 0 && (
          <div className="flex justify-center gap-3">
            {profile.links.map((link) => (
              <a
                key={link.platform}
                href={link.url}
                target="_blank"
                rel="noopener noreferrer"
                className="px-4 py-2 glass-card-hover text-sm text-skaus-text flex items-center gap-1.5"
              >
                <PlatformIcon platform={link.platform} />
                <span className="capitalize">{link.platform}</span>
                {link.verified && <VerifiedBadge />}
              </a>
            ))}
          </div>
        )}

        {/* Payment Section */}
        {!showPayment ? (
          <div className="space-y-4">
            <button
              onClick={() => setShowPayment(true)}
              className="w-full btn-primary py-3.5 rounded-xl text-sm"
            >
              PAY @{username.toUpperCase()}
            </button>

            {profile?.paymentConfig?.suggestedAmounts && (
              <div className="flex gap-2 justify-center">
                {profile.paymentConfig.suggestedAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      setShowPayment(true);
                      setSelectedTier(`${amt}`);
                    }}
                    className="px-4 py-2 bg-skaus-darker rounded-lg text-sm text-skaus-muted hover:text-white hover:bg-skaus-border transition-all border border-skaus-border"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card p-6 space-y-4 animate-scale-in">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-bold text-white">Send Payment</h2>
              <button
                onClick={() => { setShowPayment(false); setTxStatus('idle'); setError(null); }}
                className="text-skaus-muted hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>

            {!authenticated ? (
              <div className="flex flex-col items-center space-y-4 py-4">
                <p className="text-skaus-muted text-sm">Connect your wallet to pay</p>
                <Link href={`/login?redirect=/${username}`} className="btn-primary text-xs py-2 px-6">
                  LOGIN
                </Link>
              </div>
            ) : txStatus === 'idle' || txStatus === 'error' ? (
              <>
                {walletAddress && (
                  <div className="pb-1 space-y-1">
                    <p className="text-[10px] font-semibold tracking-wider text-skaus-muted">YOUR MAINNET BALANCE</p>
                    <WalletBalanceWidget
                      address={walletAddress}
                      highlight={profile?.paymentConfig?.acceptedTokens}
                      compact
                    />
                  </div>
                )}
                <DepositForm onSubmit={handleDeposit} />
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

            {txStatus === 'done' && profile?.paymentConfig?.thankYouMessage && (
              <div className="p-4 bg-skaus-success/10 border border-skaus-success/30 rounded-lg text-center">
                <p className="text-sm text-skaus-success">{profile.paymentConfig.thankYouMessage}</p>
              </div>
            )}
          </div>
        )}

        {/* Tiers */}
        {profile?.tiers && profile.tiers.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-label text-center">SUPPORT TIERS</h2>
            {profile.tiers.map((tier) => (
              <button
                key={tier.id}
                onClick={() => {
                  setShowPayment(true);
                  setSelectedTier(`${tier.amount}`);
                }}
                className="w-full glass-card-hover p-4 text-left group"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <span className="font-bold text-white group-hover:text-skaus-primary transition-colors">
                      {tier.name}
                    </span>
                    <ul className="text-xs text-skaus-muted space-y-0.5">
                      {tier.benefits.map((b, i) => (
                        <li key={i}>• {b}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-black text-white">${tier.amount}</span>
                    <span className="block text-xs text-skaus-muted">
                      {tier.gateType === 'recurring-hint' ? '/mo' : 'one-time'}
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}

        {/* Gated Content */}
        {profile?.gatedContent && profile.gatedContent.length > 0 && (
          <div className="space-y-3">
            <h2 className="section-label text-center">EXCLUSIVE CONTENT</h2>
            {profile.gatedContent.map((item) => {
              const state = unlockItems[item.contentId];
              return (
                <div key={item.contentId} className="glass-card p-4 space-y-3">
                  <div className="flex items-start gap-3">
                    <svg className="w-5 h-5 text-skaus-primary shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
                    </svg>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white">{item.previewText}</p>
                      {item.accessCondition && (
                        <p className="text-xs text-skaus-muted mt-0.5">
                          {item.accessCondition.startsWith('tier:')
                            ? `Requires: ${profile.tiers?.find(t => t.id === item.accessCondition?.slice(5))?.name || item.accessCondition}`
                            : item.accessCondition}
                        </p>
                      )}
                    </div>
                  </div>

                  {state?.result ? (
                    <div className="p-3 bg-skaus-success/10 border border-skaus-success/30 rounded-lg space-y-1">
                      <p className="text-xs text-skaus-success font-semibold">UNLOCKED</p>
                      <a
                        href={state.result}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="block text-xs text-skaus-primary hover:underline break-all"
                      >
                        {state.result}
                      </a>
                    </div>
                  ) : (
                    <div className="space-y-2">
                      <p className="text-xs text-skaus-muted">Paste your payment transaction signature to unlock:</p>
                      <input
                        type="text"
                        value={state?.txSig || ''}
                        onChange={e => {
                          const cid = item.contentId;
                          const val = e.target.value;
                          setUnlockItems(prev => {
                            const existing = prev[cid] || { txSig: '', unlocking: false, result: null, error: null };
                            return { ...prev, [cid]: { ...existing, txSig: val } };
                          });
                        }}
                        placeholder="Transaction signature…"
                        className="w-full bg-skaus-darker border border-skaus-border rounded-lg px-3 py-2 text-xs text-white placeholder-skaus-muted focus:outline-none focus:border-skaus-primary font-mono"
                      />
                      <button
                        onClick={() => void handleUnlock(item.contentId)}
                        disabled={!state?.txSig?.trim() || state?.unlocking}
                        className="w-full btn-primary py-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        {!authenticated ? 'LOGIN TO UNLOCK' : state?.unlocking ? 'VERIFYING…' : 'UNLOCK'}
                      </button>
                      {state?.error && (
                        <p className="text-xs text-skaus-error">{state.error}</p>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 space-y-2">
          <p className="text-xs text-skaus-muted">
            Powered by <Link href="/" className="text-skaus-primary hover:underline font-semibold">SKAUS</Link>
          </p>
          <div className="flex justify-center gap-4 text-xs text-skaus-muted">
            <span>0% deposit fee</span>
            <span className="text-skaus-border">|</span>
            <span>0.3% withdrawal fee</span>
          </div>
        </div>
      </div>
    </main>
  );
}

function buildDefaultProfile(username: string): CompressedProfile {
  return {
    displayName: username,
    bio: '',
    avatarUri: '',
    links: [],
    paymentConfig: {
      acceptedTokens: ['USDC', 'SOL'],
      suggestedAmounts: [5, 10, 25, 50],
      customAmountEnabled: true,
      thankYouMessage: 'Thank you for your payment!',
    },
    tiers: [],
    gatedContent: [],
    version: 1,
    updatedAt: Date.now(),
  };
}

function PlatformIcon({ platform }: { platform: string }) {
  const icons: Record<string, string> = {
    twitter: '𝕏',
    github: '⌥',
    website: '🌐',
    discord: '💬',
    youtube: '▶',
    instagram: '📷',
  };
  return <span className="text-xs">{icons[platform] || '🔗'}</span>;
}

function VerifiedBadge() {
  return (
    <span className="inline-flex items-center justify-center w-3.5 h-3.5 rounded-full bg-skaus-primary text-[8px] text-white">
      ✓
    </span>
  );
}
