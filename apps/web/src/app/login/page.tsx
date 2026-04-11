'use client';

import { Suspense, useEffect, useState, useRef, useCallback } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignMessage } from '@privy-io/react-auth/solana';
import { lookupByAuthority } from '@/lib/gateway';
import { deriveKeysFromPinAndSignature, privateKeyToPublicKey } from '@/lib/onboarding';
import bs58 from 'bs58';
import Link from 'next/link';

type LoginStep = 'auth' | 'checking' | 'pin' | 'verifying';

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
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();

  const redirect = searchParams.get('redirect');
  const name = searchParams.get('name');

  const [step, setStep] = useState<LoginStep>('auth');
  const [lookupResult, setLookupResult] = useState<{
    names: Array<{ pda: string; nameHash: string; scanPubkey: string; spendPubkey: string; username: string | null }>;
  } | null>(null);
  const [pin, setPin] = useState<string[]>(['', '', '', '', '', '']);
  const [pinError, setPinError] = useState('');
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);

  const pinString = pin.join('');
  const pinComplete = pinString.length === 6;

  useEffect(() => {
    if (!ready || !authenticated) return;

    const walletAddress = user?.wallet?.address;
    if (!walletAddress) return;

    setStep('checking');
    lookupByAuthority(walletAddress)
      .then((result) => {
        if (result.registered) {
          setLookupResult(result);
          setStep('pin');
          setTimeout(() => pinRefs.current[0]?.focus(), 100);
        } else {
          if (redirect) {
            const fullRedirect = name ? `${redirect}?name=${name}` : redirect;
            router.push(fullRedirect);
          } else {
            router.push('/onboarding');
          }
        }
      })
      .catch(() => {
        router.push('/onboarding');
      });
  }, [ready, authenticated, user, router, redirect, name]);

  const handlePinInput = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pin];
    newPin[index] = value.slice(-1);
    setPin(newPin);
    setPinError('');

    if (value && index < 5) {
      pinRefs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === 'Backspace' && !pin[index] && index > 0) {
      const newPin = [...pin];
      newPin[index - 1] = '';
      setPin(newPin);
      pinRefs.current[index - 1]?.focus();
    }
  };

  const handleVerifyPin = useCallback(async () => {
    if (!pinComplete || !lookupResult) return;

    const wallet = wallets[0];
    if (!wallet) return;

    setStep('verifying');
    setPinError('');

    try {
      const walletAddress = wallet.address;
      const messageText = `SKAUS | Deterministic Meta Keys | Solana\nPIN: ${pinString}\nWallet: ${walletAddress}`;
      const messageBytes = new TextEncoder().encode(messageText);

      let signature: Uint8Array;
      try {
        const result = await signMessage({ message: messageBytes, wallet });
        signature = result.signature;
      } catch (err: any) {
        if (err?.message?.includes('rejected') || err?.message?.includes('cancelled')) {
          setStep('pin');
          setPinError('Signature was rejected. Please approve to continue.');
          return;
        }
        throw err;
      }

      const { scanPrivkey } = deriveKeysFromPinAndSignature(pinString, signature);
      const derivedScanPubkey = bs58.encode(privateKeyToPublicKey(scanPrivkey));
      const onChainScanPubkey = lookupResult.names[0].scanPubkey;

      if (derivedScanPubkey === onChainScanPubkey) {
        const username = lookupResult.names[0]?.username;
        if (username) {
          try {
            localStorage.setItem('skaus_username', username);
            localStorage.setItem('skaus_wallet', walletAddress);
          } catch {}
        }
        const destination = redirect ? (name ? `${redirect}?name=${name}` : redirect) : '/dashboard';
        router.push(destination);
      } else {
        setPin(['', '', '', '', '', '']);
        setStep('pin');
        setPinError('Incorrect PIN. Please try again.');
        setTimeout(() => pinRefs.current[0]?.focus(), 100);
      }
    } catch (err: any) {
      setPin(['', '', '', '', '', '']);
      setStep('pin');
      setPinError(err.message || 'Verification failed. Please try again.');
      setTimeout(() => pinRefs.current[0]?.focus(), 100);
    }
  }, [pinComplete, pinString, lookupResult, wallets, signMessage, router, redirect, name]);

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

        {/* Auth step */}
        {step === 'auth' && (
          <>
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

        {/* Checking registration */}
        {step === 'checking' && (
          <div className="flex flex-col items-center gap-3 py-8">
            <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
            <p className="text-sm text-skaus-muted">Checking your account...</p>
          </div>
        )}

        {/* PIN entry */}
        {(step === 'pin' || step === 'verifying') && (
          <div className="space-y-6">
            <div className="text-center space-y-2">
              <h2 className="text-display-sm">Enter Your PIN</h2>
              <p className="text-sm text-skaus-muted">
                Enter your 6-digit PIN to access your account.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-center gap-2">
                {pin.map((digit, i) => (
                  <div key={i} className="flex items-center">
                    <input
                      ref={(el) => { pinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      disabled={step === 'verifying'}
                      onChange={(e) => handlePinInput(i, e.target.value)}
                      onKeyDown={(e) => handlePinKeyDown(i, e)}
                      className={`w-12 h-14 text-center text-xl font-bold rounded-lg border transition-all duration-200 bg-skaus-darker focus:outline-none disabled:opacity-50 ${
                        digit
                          ? 'border-skaus-primary text-white'
                          : 'border-skaus-border text-skaus-muted'
                      } focus:border-skaus-primary focus:ring-1 focus:ring-skaus-primary/30`}
                    />
                    {i === 2 && <span className="mx-1.5 text-skaus-muted font-bold">-</span>}
                  </div>
                ))}
              </div>

              {pinError && (
                <p className="text-xs text-skaus-error text-center">{pinError}</p>
              )}

              <button
                onClick={handleVerifyPin}
                disabled={!pinComplete || step === 'verifying'}
                className="w-full btn-primary py-3.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {step === 'verifying' ? (
                  <>
                    <span className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    Verifying...
                  </>
                ) : (
                  'UNLOCK'
                )}
              </button>
            </div>
          </div>
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
