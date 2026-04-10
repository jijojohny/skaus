'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { lookupByAuthority } from '@/lib/gateway';
import Link from 'next/link';

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-skaus-dark">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}

function LoginContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated, user, login } = usePrivy();
  const [checking, setChecking] = useState(false);

  const redirect = searchParams.get('redirect');
  const name = searchParams.get('name');

  useEffect(() => {
    if (!ready || !authenticated) return;

    const walletAddress = user?.wallet?.address;
    if (!walletAddress) return;

    if (redirect) {
      const fullRedirect = name ? `${redirect}?name=${name}` : redirect;
      router.push(fullRedirect);
      return;
    }

    setChecking(true);
    lookupByAuthority(walletAddress)
      .then((result) => {
        if (result.registered) {
          router.push('/dashboard');
        } else {
          router.push('/onboarding');
        }
      })
      .catch(() => {
        router.push('/onboarding');
      })
      .finally(() => setChecking(false));
  }, [ready, authenticated, user, router, redirect, name]);

  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center px-6">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-1/4 left-1/2 -translate-x-1/2 w-[600px] h-[400px] bg-skaus-primary/5 blur-[150px] rounded-full" />

      <Link
        href="/"
        className="absolute top-6 left-6 z-10 flex items-center gap-2 text-sm text-skaus-muted hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      <div className="relative z-10 w-full max-w-sm space-y-8 animate-slide-up">
        {/* Logo */}
        <div className="text-center space-y-3">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-2xl bg-skaus-surface border border-skaus-border">
            <span className="text-2xl font-black text-skaus-primary">S</span>
          </div>
          <h1 className="text-display-sm">Welcome to SKAUS</h1>
          <p className="text-sm text-skaus-muted leading-relaxed">
            Get paid while staying private with<br />
            stealth addresses on Solana.
          </p>
        </div>

        {checking ? (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-skaus-muted">Checking your account...</p>
          </div>
        ) : (
          <>
            {/* Auth Buttons */}
            <div className="space-y-3">
              <button
                onClick={() => login({ loginMethods: ['google'] })}
                disabled={!ready}
                className="w-full flex items-center gap-3 px-5 py-3.5 glass-card-hover font-semibold text-sm disabled:opacity-50"
              >
                <GoogleIcon />
                Continue with Google
              </button>

              <button
                onClick={() => login({ loginMethods: ['twitter'] })}
                disabled={!ready}
                className="w-full flex items-center gap-3 px-5 py-3.5 glass-card-hover font-semibold text-sm disabled:opacity-50"
              >
                <XIcon />
                Continue with X
              </button>

              <div className="flex items-center gap-3 py-2">
                <div className="flex-1 h-px bg-skaus-border" />
                <span className="text-xs text-skaus-muted uppercase tracking-wider">or</span>
                <div className="flex-1 h-px bg-skaus-border" />
              </div>

              <button
                onClick={() => login({ loginMethods: ['wallet'] })}
                disabled={!ready}
                className="w-full flex items-center gap-3 px-5 py-3.5 glass-card-hover font-semibold text-sm disabled:opacity-50"
              >
                <WalletIcon />
                <div className="text-left">
                  <span className="block">Connect Wallet</span>
                  <span className="text-xs text-skaus-muted font-normal">Use your existing wallet</span>
                </div>
              </button>
            </div>

            <p className="text-center text-xs text-skaus-muted">
              Protected by <span className="text-skaus-primary font-semibold">Privy</span>
            </p>
          </>
        )}
      </div>
    </div>
  );
}

function GoogleIcon() {
  return (
    <svg className="w-5 h-5" viewBox="0 0 24 24">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
    </svg>
  );
}

function XIcon() {
  return (
    <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z" />
    </svg>
  );
}

function WalletIcon() {
  return (
    <svg className="w-5 h-5 text-skaus-muted" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
      <path strokeLinecap="round" strokeLinejoin="round" d="M21 12a2.25 2.25 0 00-2.25-2.25H15a3 3 0 110-6h.75A2.25 2.25 0 0118 6v0a2.25 2.25 0 012.25 2.25M21 12v6.75A2.25 2.25 0 0118.75 21H5.25A2.25 2.25 0 013 18.75V5.25A2.25 2.25 0 015.25 3h13.5A2.25 2.25 0 0121 5.25v.75" />
    </svg>
  );
}
