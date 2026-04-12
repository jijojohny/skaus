'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import Link from 'next/link';

export default function Home() {
  const router = useRouter();
  const { authenticated } = usePrivy();
  const [username, setUsername] = useState('');

  const handleClaim = () => {
    if (!username.trim()) return;
    const cleaned = username.trim().toLowerCase().replace(/[^a-z0-9_]/g, '');
    if (authenticated) {
      router.push(`/onboarding?name=${cleaned}`);
    } else {
      router.push(`/login?redirect=/onboarding&name=${cleaned}`);
    }
  };

  return (
    <div className="relative min-h-screen min-h-[100dvh] overflow-x-clip">
      {/* Grid background */}
      <div className="absolute inset-0 grid-bg" />

      {/* Red glow effects — capped to viewport width to avoid horizontal scroll */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[min(50rem,100vw)] h-[min(37.5rem,70vh)] max-h-[600px] bg-skaus-primary/5 blur-[150px] rounded-full" />
      <div className="absolute bottom-0 right-0 w-[min(25rem,85vw)] h-[min(25rem,50vh)] bg-skaus-primary/3 blur-[120px] rounded-full" />

      {/* Navigation */}
      <nav className="relative z-10 flex flex-wrap items-center justify-between gap-x-4 gap-y-3 px-4 sm:px-6 lg:px-12 py-4 sm:py-6">
        <Link href="/" className="text-xl sm:text-2xl font-black tracking-tight shrink-0">
          <span className="text-skaus-primary">S</span>KAUS
        </Link>
        <div className="flex items-center gap-3 sm:gap-6 shrink-0">
          <Link
            href="/dashboard"
            className="text-xs sm:text-sm text-skaus-muted hover:text-white transition-colors whitespace-nowrap"
          >
            Dashboard
          </Link>
          {authenticated ? (
            <Link href="/dashboard" className="btn-primary text-xs py-2 px-3 sm:px-4 whitespace-nowrap">
              OPEN APP
            </Link>
          ) : (
            <Link href="/login" className="btn-primary text-xs py-2 px-3 sm:px-4 whitespace-nowrap">
              GET STARTED
            </Link>
          )}
        </div>
      </nav>

      {/* Hero */}
      <main className="relative z-10 flex flex-col items-center justify-center px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-24 lg:pt-24">
        <div className="max-w-4xl w-full text-center space-y-8 sm:space-y-10">
          {/* Badge */}
          <div className="inline-flex items-center gap-2 px-4 py-1.5 border border-skaus-border rounded-full animate-fade-in">
            <span className="w-2 h-2 rounded-full bg-skaus-primary animate-pulse" />
            <span className="text-xs font-semibold uppercase tracking-wider text-skaus-muted">
              Live on Solana Devnet
            </span>
          </div>

          {/* Headline */}
          <div className="space-y-4 animate-slide-up">
            <h1 className="text-display-xl font-black leading-none">
              GET PAID
              <br />
              <span className="gradient-text">STAY PRIVATE</span>
            </h1>
            <p className="text-lg lg:text-xl text-skaus-muted max-w-xl mx-auto text-balance">
              Receive payments without exposing your wallet.
              Stealth addresses, ZK proofs, one link.
            </p>
          </div>

          {/* Username Claim */}
          <div className="max-w-md mx-auto w-full space-y-4 animate-slide-up" style={{ animationDelay: '0.1s' }}>
            <div className="relative">
              <div className="absolute inset-0 bg-skaus-primary/10 blur-xl rounded-2xl" />
              <div className="relative glass-card p-3 sm:p-2 flex flex-col gap-3 sm:flex-row sm:items-stretch sm:gap-2">
                <div className="flex flex-1 min-w-0 items-center gap-2 sm:pl-2">
                  <span className="pl-1 sm:pl-2 text-skaus-muted font-mono text-xs sm:text-sm shrink-0">skaus.me/</span>
                  <input
                    type="text"
                    value={username}
                    onChange={(e) => setUsername(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    onKeyDown={(e) => e.key === 'Enter' && handleClaim()}
                    placeholder="your-name"
                    maxLength={20}
                    className="flex-1 min-w-0 bg-transparent text-white font-mono text-sm py-2.5 sm:py-3 focus:outline-none placeholder:text-skaus-muted/40"
                  />
                </div>
                <button
                  onClick={handleClaim}
                  disabled={!username.trim()}
                  className="btn-primary w-full sm:w-auto shrink-0 py-2.5 px-5 text-xs rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
                >
                  CLAIM
                </button>
              </div>
            </div>
          </div>

          {/* Divider */}
          <div className="red-line max-w-xs mx-auto opacity-40" />

          {/* Feature Grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 animate-fade-in" style={{ animationDelay: '0.2s' }}>
            <FeatureBlock
              label="STEALTH POOL"
              title="ZK Withdrawals"
              description="Shared liquidity pool. On-chain observers see pool activity, never your payment graph."
            />
            <FeatureBlock
              label="IDENTITY"
              title="Pay Links"
              description="Register your name. Share one link. Receive private payments from any Solana wallet."
            />
            <FeatureBlock
              label="COMPLIANCE"
              title="Your Terms"
              description="Viewing keys and disclosure packages. Privacy by default, transparency when you choose."
            />
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="relative z-10 border-t border-skaus-border py-6 px-4 sm:px-6 lg:px-12 pb-safe-modal">
        <div className="flex flex-col sm:flex-row items-center justify-center sm:justify-between gap-3 sm:gap-4 text-xs text-skaus-muted text-center sm:text-left">
          <span className="shrink-0">SKAUS Protocol — Solana Devnet</span>
          <div className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1 sm:gap-6">
            <span>Stealth Addresses</span>
            <span className="hidden sm:inline text-skaus-border">|</span>
            <span>Groth16 Proofs</span>
            <span className="hidden sm:inline text-skaus-border">|</span>
            <span>On-Chain Privacy</span>
          </div>
        </div>
      </footer>
    </div>
  );
}

function FeatureBlock({ label, title, description }: { label: string; title: string; description: string }) {
  return (
    <div className="glass-card-hover p-6 text-left space-y-3 group">
      <span className="section-label text-skaus-primary">{label}</span>
      <h3 className="text-lg font-bold text-white">{title}</h3>
      <p className="text-sm text-skaus-muted leading-relaxed">{description}</p>
    </div>
  );
}
