'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWallet, useConnection } from '@solana/wallet-adapter-react';
import { WalletMultiButton } from '@solana/wallet-adapter-react-ui';
import { lookupName, type NameLookupResult } from '@/lib/gateway';
import { DepositForm } from '@/components/DepositForm';
import { TransactionStatus } from '@/components/TransactionStatus';
import { executeDeposit } from '@/lib/deposit';
import { DEPOSIT_TIERS_USDC, DEPOSIT_TIERS_SOL, splitIntoTiers } from '@skaus/types';
import type { StealthMetaAddress } from '@skaus/crypto';
import type { CompressedProfile } from '@skaus/types';

interface ProfilePageProps {
  params: { username: string };
}

const MOCK_PROFILES: Record<string, CompressedProfile> = {
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
  bob: {
    displayName: 'Bob Developer',
    bio: 'Open-source Solana developer',
    avatarUri: '',
    links: [
      { platform: 'github', url: 'https://github.com/bob', verified: true },
      { platform: 'website', url: 'https://bob.dev', verified: false },
    ],
    paymentConfig: {
      acceptedTokens: ['USDC'],
      suggestedAmounts: [10, 25, 100],
      customAmountEnabled: true,
      thankYouMessage: 'Appreciate it!',
    },
    tiers: [],
    gatedContent: [],
    version: 1,
    updatedAt: Date.now(),
  },
};

export default function ProfilePage({ params }: ProfilePageProps) {
  const { username } = params;
  const { connected, publicKey, signTransaction } = useWallet();
  const { connection } = useConnection();

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

  useEffect(() => {
    async function load() {
      try {
        const data = await lookupName(username);
        if (data.available) {
          setNotFound(true);
        } else {
          setNameData(data);
          const profileData = MOCK_PROFILES[username.toLowerCase()] || buildDefaultProfile(username);
          setProfile(profileData);
        }
      } catch {
        const profileData = MOCK_PROFILES[username.toLowerCase()];
        if (profileData) {
          setProfile(profileData);
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
    if (!publicKey || !signTransaction) return;

    setTxStatus('preparing');
    setError(null);

    try {
      const tiers = token === 'USDC'
        ? splitIntoTiers(amount, [...DEPOSIT_TIERS_USDC])
        : splitIntoTiers(amount, [...DEPOSIT_TIERS_SOL]);

      setProgressText(`Splitting into ${tiers.length} deposit${tiers.length > 1 ? 's' : ''}`);

      let recipientMeta: StealthMetaAddress;
      if (nameData?.stealthMetaAddress && !nameData.stealthMetaAddress.scanPubkey.startsWith('mock_')) {
        const scanBytes = Buffer.from(nameData.stealthMetaAddress.scanPubkey, 'hex');
        const spendBytes = Buffer.from(nameData.stealthMetaAddress.spendPubkey, 'hex');
        recipientMeta = { scanPubkey: scanBytes, spendPubkey: spendBytes, version: 1 };
      } else {
        const { generateStealthKeys } = await import('@skaus/crypto');
        const keys = generateStealthKeys();
        recipientMeta = { scanPubkey: keys.scanPubkey, spendPubkey: keys.spendPubkey, version: 1 };
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
      setError(err.message || 'Transaction failed');
      setTxStatus('error');
    }
  }, [publicKey, signTransaction, connection, nameData]);

  if (loading) {
    return (
      <main className="flex items-center justify-center min-h-screen">
        <div className="animate-pulse text-skaus-muted">Loading profile...</div>
      </main>
    );
  }

  if (notFound) {
    return (
      <main className="flex flex-col items-center justify-center min-h-screen px-6">
        <div className="text-center space-y-4">
          <h1 className="text-4xl font-bold text-white">@{username}</h1>
          <p className="text-skaus-muted">This name is not registered yet.</p>
          <a href="/" className="text-skaus-primary hover:underline text-sm">
            Go to SKAUS home
          </a>
        </div>
      </main>
    );
  }

  return (
    <main className="flex flex-col items-center min-h-screen px-6 py-12">
      <div className="w-full max-w-md space-y-6">
        {/* Avatar + Identity */}
        <div className="text-center space-y-3">
          <div className="mx-auto w-20 h-20 rounded-full bg-gradient-to-br from-skaus-primary to-skaus-secondary flex items-center justify-center text-3xl font-bold text-white">
            {(profile?.displayName || username)[0].toUpperCase()}
          </div>
          <h1 className="text-2xl font-bold text-white">{profile?.displayName || username}</h1>
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
                className="px-4 py-2 glass-card text-sm text-skaus-text hover:text-white hover:border-skaus-primary/50 transition-all flex items-center gap-1.5"
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
            {/* Quick Pay Button */}
            <button
              onClick={() => setShowPayment(true)}
              className="w-full py-3.5 rounded-xl bg-skaus-primary hover:bg-skaus-primary/90 text-white font-semibold transition-all hover:shadow-lg hover:shadow-skaus-primary/25"
            >
              Pay @{username}
            </button>

            {/* Suggested Amounts */}
            {profile?.paymentConfig?.suggestedAmounts && (
              <div className="flex gap-2 justify-center">
                {profile.paymentConfig.suggestedAmounts.map((amt) => (
                  <button
                    key={amt}
                    onClick={() => {
                      setShowPayment(true);
                      setSelectedTier(`${amt}`);
                    }}
                    className="px-4 py-2 bg-skaus-dark rounded-lg text-sm text-skaus-muted hover:text-white hover:bg-skaus-border transition-all"
                  >
                    ${amt}
                  </button>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="glass-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Send Payment</h2>
              <button
                onClick={() => { setShowPayment(false); setTxStatus('idle'); setError(null); }}
                className="text-skaus-muted hover:text-white text-sm"
              >
                Cancel
              </button>
            </div>

            {!connected ? (
              <div className="flex flex-col items-center space-y-4 py-4">
                <p className="text-skaus-muted text-sm">Connect your wallet to pay</p>
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
            <h2 className="text-sm font-semibold text-skaus-muted uppercase tracking-wide text-center">
              Support Tiers
            </h2>
            {profile.tiers.map((tier) => (
              <button
                key={tier.id}
                onClick={() => {
                  setShowPayment(true);
                  setSelectedTier(`${tier.amount}`);
                }}
                className="w-full glass-card p-4 text-left hover:border-skaus-primary/50 transition-all group"
              >
                <div className="flex items-center justify-between">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{tier.gateType === 'recurring-hint' ? '★' : '☆'}</span>
                      <span className="font-semibold text-white group-hover:text-skaus-primary transition-colors">
                        {tier.name}
                      </span>
                    </div>
                    <ul className="text-xs text-skaus-muted space-y-0.5">
                      {tier.benefits.map((b, i) => (
                        <li key={i}>• {b}</li>
                      ))}
                    </ul>
                  </div>
                  <div className="text-right">
                    <span className="text-lg font-bold text-white">${tier.amount}</span>
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
            <h2 className="text-sm font-semibold text-skaus-muted uppercase tracking-wide text-center">
              Exclusive Content
            </h2>
            {profile.gatedContent.map((item) => (
              <div key={item.contentId} className="glass-card p-4 flex items-center gap-3 opacity-75">
                <span className="text-xl">🔒</span>
                <div>
                  <p className="text-sm font-medium text-white">{item.previewText}</p>
                  <p className="text-xs text-skaus-muted">Unlock by supporting this creator</p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Footer */}
        <div className="text-center pt-4 space-y-2">
          <p className="text-xs text-skaus-muted">
            Privacy-preserving payments powered by{' '}
            <a href="/" className="text-skaus-primary hover:underline">SKAUS</a>
          </p>
          <div className="flex justify-center gap-4 text-xs text-skaus-muted">
            <span>0% deposit fee</span>
            <span>•</span>
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
