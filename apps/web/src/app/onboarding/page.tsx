'use client';

import { Suspense, useState, useEffect, useCallback, useRef } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { usePrivy } from '@privy-io/react-auth';
import { useWallets, useSignMessage } from '@privy-io/react-auth/solana';
import Link from 'next/link';
import {
  checkUsernameAvailability,
  buildRegisterTransaction,
  deriveKeysFromPinAndSignature,
  privateKeyToPublicKey,
  isValidUsername,
} from '@/lib/onboarding';
import { useSignTransaction } from '@privy-io/react-auth/solana';
import { Connection, Transaction } from '@solana/web3.js';
import bs58 from 'bs58';
import { getPublicLinkHost } from '@/lib/config';

type Step = 'username' | 'pin' | 'confirm' | 'registering' | 'done';

export default function OnboardingPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center bg-skaus-dark">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <OnboardingContent />
    </Suspense>
  );
}

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { ready, authenticated, user, logout } = usePrivy();
  const { wallets } = useWallets();
  const { signMessage } = useSignMessage();
  const { signTransaction } = useSignTransaction();

  const wallet = wallets[0];
  const prefillName = searchParams.get('name') || '';

  const [step, setStep] = useState<Step>('username');
  const [username, setUsername] = useState(prefillName);
  const [usernameStatus, setUsernameStatus] = useState<'idle' | 'checking' | 'available' | 'taken' | 'invalid'>('idle');
  const [usernameError, setUsernameError] = useState('');
  const [pin, setPin] = useState<string[]>(['', '', '', '', '', '']);
  const [confirmPin, setConfirmPin] = useState<string[]>(['', '', '', '', '', '']);
  const [pinError, setPinError] = useState('');
  const [regError, setRegError] = useState('');
  const [txSignature, setTxSignature] = useState('');
  const pinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const confirmPinRefs = useRef<(HTMLInputElement | null)[]>([]);
  const checkTimeout = useRef<NodeJS.Timeout>();

  useEffect(() => {
    if (ready && !authenticated) {
      router.push('/login?redirect=/onboarding');
    }
  }, [ready, authenticated, router]);

  const checkAvailability = useCallback(async (name: string) => {
    const validation = isValidUsername(name);
    if (!validation.valid) {
      setUsernameStatus('invalid');
      setUsernameError(validation.reason || 'Invalid username');
      return;
    }

    setUsernameStatus('checking');
    setUsernameError('');

    try {
      const result = await checkUsernameAvailability(name);
      setUsernameStatus(result.available ? 'available' : 'taken');
      if (!result.available) setUsernameError('This name is already taken');
    } catch {
      setUsernameStatus('available');
    }
  }, []);

  const handleUsernameChange = (value: string) => {
    const cleaned = value.toLowerCase().replace(/[^a-z0-9_]/g, '');
    setUsername(cleaned);
    setUsernameStatus('idle');
    setUsernameError('');

    if (checkTimeout.current) clearTimeout(checkTimeout.current);
    if (cleaned.length >= 3) {
      checkTimeout.current = setTimeout(() => checkAvailability(cleaned), 400);
    }
  };

  const handlePinInput = (
    index: number,
    value: string,
    pinArray: string[],
    setPinArray: (p: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
  ) => {
    if (!/^\d*$/.test(value)) return;
    const newPin = [...pinArray];
    newPin[index] = value.slice(-1);
    setPinArray(newPin);

    if (value && index < 5) {
      refs.current[index + 1]?.focus();
    }
  };

  const handlePinKeyDown = (
    index: number,
    e: React.KeyboardEvent,
    pinArray: string[],
    setPinArray: (p: string[]) => void,
    refs: React.MutableRefObject<(HTMLInputElement | null)[]>,
  ) => {
    if (e.key === 'Backspace' && !pinArray[index] && index > 0) {
      const newPin = [...pinArray];
      newPin[index - 1] = '';
      setPinArray(newPin);
      refs.current[index - 1]?.focus();
    }
  };

  const pinString = pin.join('');
  const confirmPinString = confirmPin.join('');
  const pinComplete = pinString.length === 6;
  const confirmPinComplete = confirmPinString.length === 6;

  const handlePinSubmit = () => {
    if (!pinComplete) return;
    setPinError('');
    setConfirmPin(['', '', '', '', '', '']);
    setStep('confirm');
    setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
  };

  const handleConfirmAndRegister = async () => {
    if (pinString !== confirmPinString) {
      setPinError('PINs do not match. Please try again.');
      setConfirmPin(['', '', '', '', '', '']);
      setTimeout(() => confirmPinRefs.current[0]?.focus(), 100);
      return;
    }

    setStep('registering');
    setRegError('');

    try {
      if (!wallet) throw new Error('No wallet connected');
      const walletAddress = wallet.address;

      const messageText = `SKAUS | Deterministic Meta Keys | Solana\nPIN: ${pinString}\nWallet: ${walletAddress}`;
      const messageBytes = new TextEncoder().encode(messageText);

      let signature: Uint8Array;
      try {
        const result = await signMessage({ message: messageBytes, wallet });
        signature = result.signature;
      } catch (err: any) {
        if (err?.message?.includes('rejected') || err?.message?.includes('cancelled')) {
          setStep('confirm');
          setRegError('Signature was rejected. Please approve the wallet signature to continue.');
          return;
        }
        throw err;
      }

      const { scanPrivkey, spendPrivkey } = deriveKeysFromPinAndSignature(pinString, signature);
      const scanPubkey = privateKeyToPublicKey(scanPrivkey);
      const spendPubkey = privateKeyToPublicKey(spendPrivkey);

      const buildResult = await buildRegisterTransaction({
        username,
        authority: walletAddress,
        scanPubkey: bs58.encode(scanPubkey),
        spendPubkey: bs58.encode(spendPubkey),
      });

      if (!buildResult.success || !buildResult.transaction) {
        setRegError(buildResult.error || 'Failed to build transaction');
        setStep('confirm');
        return;
      }

      const txBytes = Buffer.from(buildResult.transaction, 'base64');
      const tx = Transaction.from(txBytes);

      const serializedForSigning = tx.serialize({
        requireAllSignatures: false,
        verifySignatures: false,
      });

      const { signedTransaction } = await signTransaction({
        transaction: serializedForSigning,
        wallet,
      });

      const connection = new Connection(
        process.env.NEXT_PUBLIC_SOLANA_RPC_URL || 'https://api.devnet.solana.com',
        'confirmed',
      );

      const txSig = await connection.sendRawTransaction(signedTransaction, {
        skipPreflight: true,
        preflightCommitment: 'confirmed',
      });
      await connection.confirmTransaction(txSig, 'confirmed');

      setTxSignature(txSig);
      setStep('done');

      try {
        localStorage.setItem('skaus_username', username);
        localStorage.setItem('skaus_wallet', walletAddress);
      } catch {}

    } catch (err: any) {
      console.error('Onboarding error:', err);
      let msg = err.message || 'Something went wrong';
      if (msg.includes('debit an account') || msg.includes('insufficient')) {
        msg = 'Transaction failed: relayer has insufficient funds. Please contact support.';
      }
      if (err.logs) {
        console.error('Transaction logs:', err.logs);
      }
      setRegError(msg);
      setStep('confirm');
    }
  };

  if (!ready || !authenticated) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="relative min-h-screen min-h-[100dvh] flex flex-col items-center justify-center px-4 sm:px-6 overflow-x-clip">
      <div className="absolute inset-0 grid-bg" />
      <div className="absolute top-1/3 left-1/2 -translate-x-1/2 w-[min(37.5rem,calc(100vw-1.5rem))] h-[min(25rem,45vh)] bg-skaus-primary/5 blur-[150px] rounded-full" />

      {/* Back */}
      <Link
        href="/"
        className="absolute top-4 left-4 sm:top-6 sm:left-6 z-10 flex items-center gap-2 text-sm text-skaus-muted hover:text-white transition-colors"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Back
      </Link>

      {/* Step Indicator */}
      <div className="relative z-10 mb-6 sm:mb-8 px-1">
        <div className="flex items-center gap-3">
          {['username', 'pin', 'confirm'].map((s, i) => {
            const stepOrder = ['username', 'pin', 'confirm'];
            const currentIdx = stepOrder.indexOf(step === 'registering' || step === 'done' ? 'confirm' : step);
            const isActive = i === currentIdx;
            const isComplete = i < currentIdx || step === 'done';

            return (
              <div key={s} className="flex items-center gap-3">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold transition-all duration-300 ${
                  isComplete
                    ? 'bg-skaus-primary text-white'
                    : isActive
                      ? 'bg-skaus-primary/20 border-2 border-skaus-primary text-skaus-primary'
                      : 'bg-skaus-surface border border-skaus-border text-skaus-muted'
                }`}>
                  {isComplete ? (
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </div>
                {i < 2 && (
                  <div className={`w-12 h-0.5 transition-all duration-300 ${
                    i < currentIdx || step === 'done' ? 'bg-skaus-primary' : 'bg-skaus-border'
                  }`} />
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Step Content */}
      <div className="relative z-10 w-full max-w-md min-w-0">
        {/* STEP 1: Username */}
        {step === 'username' && (
          <div className="space-y-6 animate-slide-up">
            <div className="text-center space-y-2">
              <h1 className="text-display-sm">Claim your username</h1>
              <p className="text-sm text-skaus-muted">Choose the handle that will represent you on SKAUS.</p>
            </div>

            <div className="space-y-4">
              {/* Card preview */}
              <div className="relative">
                <div className={`absolute inset-0 blur-xl rounded-2xl transition-colors duration-300 ${
                  usernameStatus === 'available' ? 'bg-skaus-primary/20' : 'bg-skaus-primary/5'
                }`} />
                <div className={`relative glass-card p-8 text-center space-y-4 transition-all duration-300 ${
                  usernameStatus === 'available' ? 'border-skaus-primary/50' : ''
                }`}>
                  <div className="flex justify-end">
                    <div className="w-10 h-10 rounded-xl bg-skaus-primary/20 flex items-center justify-center">
                      <span className="text-lg font-black text-skaus-primary">S</span>
                    </div>
                  </div>
                  <div className="pt-4">
                    <span className="text-skaus-muted font-mono text-lg">{getPublicLinkHost()}/</span>
                    <span className="text-white font-mono text-lg font-bold">
                      {username || <span className="text-skaus-muted/40">your-name</span>}
                    </span>
                  </div>
                </div>
              </div>

              {/* Input */}
              <input
                type="text"
                value={username}
                onChange={(e) => handleUsernameChange(e.target.value)}
                placeholder="Enter username"
                maxLength={20}
                autoFocus
                className="input-field font-mono text-center text-lg"
              />

              {/* Status */}
              <div className="h-5 flex items-center justify-center">
                {usernameStatus === 'checking' && (
                  <span className="text-xs text-skaus-muted flex items-center gap-2">
                    <span className="w-3 h-3 border border-skaus-muted border-t-transparent rounded-full animate-spin" />
                    Checking availability...
                  </span>
                )}
                {usernameStatus === 'available' && (
                  <span className="text-xs text-skaus-success flex items-center gap-2">
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Username is available!
                  </span>
                )}
                {(usernameStatus === 'taken' || usernameStatus === 'invalid') && (
                  <span className="text-xs text-skaus-error">{usernameError}</span>
                )}
              </div>

              {/* Continue */}
              <button
                onClick={() => {
                  setStep('pin');
                  setTimeout(() => pinRefs.current[0]?.focus(), 100);
                }}
                disabled={usernameStatus !== 'available'}
                className="w-full btn-primary py-3.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
              >
                CONTINUE
              </button>
            </div>
          </div>
        )}

        {/* STEP 2: PIN Setup */}
        {step === 'pin' && (
          <div className="space-y-6 animate-slide-up">
            <div className="text-center space-y-2">
              <h1 className="text-display-sm">Set Your PIN</h1>
              <p className="text-sm text-skaus-muted">
                Create a 6-digit PIN to protect<br />and recover your master keys.
              </p>
            </div>

            <div className="space-y-6">
              {/* PIN Input */}
              <div className="flex items-center justify-center gap-2">
                {pin.map((digit, i) => (
                  <div key={i} className="flex items-center">
                    <input
                      ref={(el) => { pinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinInput(i, e.target.value, pin, setPin, pinRefs)}
                      onKeyDown={(e) => handlePinKeyDown(i, e, pin, setPin, pinRefs)}
                      className={`w-9 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-lg border transition-all duration-200 bg-skaus-darker focus:outline-none ${
                        digit
                          ? 'border-skaus-primary text-white'
                          : 'border-skaus-border text-skaus-muted'
                      } focus:border-skaus-primary focus:ring-1 focus:ring-skaus-primary/30`}
                    />
                    {i === 2 && <span className="mx-1.5 text-skaus-muted font-bold">-</span>}
                  </div>
                ))}
              </div>

              {/* Warning card */}
              <div className="glass-card p-4 space-y-2">
                <div className="flex items-center gap-2">
                  <svg className="w-4 h-4 text-skaus-warning shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-2.5L13.732 4c-.77-.833-1.964-.833-2.732 0L4.082 16.5c-.77.833.192 2.5 1.732 2.5z" />
                  </svg>
                  <span className="text-sm font-semibold text-skaus-warning">What&apos;s this PIN for?</span>
                </div>
                <p className="text-xs text-skaus-muted leading-relaxed">
                  This PIN protects your private <span className="text-white font-semibold">Master Keys</span>, which secure your funds.
                  If you forget it, you will <span className="text-skaus-error font-semibold">permanently lose access</span> to your account.
                </p>
              </div>

              <button
                onClick={handlePinSubmit}
                disabled={!pinComplete}
                className="w-full btn-primary py-3.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
              >
                CONTINUE
              </button>

              <button
                onClick={() => setStep('username')}
                className="w-full btn-ghost py-2 text-xs"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* STEP 3: Confirm PIN */}
        {step === 'confirm' && (
          <div className="space-y-6 animate-slide-up">
            <div className="text-center space-y-2">
              <h1 className="text-display-sm">Confirm Your PIN</h1>
              <p className="text-sm text-skaus-muted">
                Re-enter your 6-digit PIN to confirm.
              </p>
            </div>

            <div className="space-y-6">
              <div className="flex items-center justify-center gap-2">
                {confirmPin.map((digit, i) => (
                  <div key={i} className="flex items-center">
                    <input
                      ref={(el) => { confirmPinRefs.current[i] = el; }}
                      type="password"
                      inputMode="numeric"
                      maxLength={1}
                      value={digit}
                      onChange={(e) => handlePinInput(i, e.target.value, confirmPin, setConfirmPin, confirmPinRefs)}
                      onKeyDown={(e) => handlePinKeyDown(i, e, confirmPin, setConfirmPin, confirmPinRefs)}
                      className={`w-9 h-12 sm:w-12 sm:h-14 text-center text-lg sm:text-xl font-bold rounded-lg border transition-all duration-200 bg-skaus-darker focus:outline-none ${
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

              {regError && (
                <div className="p-3 bg-skaus-error/10 border border-skaus-error/30 rounded-lg text-xs text-skaus-error">
                  {regError}
                </div>
              )}

              <button
                onClick={handleConfirmAndRegister}
                disabled={!confirmPinComplete}
                className="w-full btn-primary py-3.5 rounded-xl disabled:opacity-30 disabled:cursor-not-allowed"
              >
                CONFIRM &amp; REGISTER
              </button>

              <button
                onClick={() => { setStep('pin'); setPin(['', '', '', '', '', '']); setPinError(''); }}
                className="w-full btn-ghost py-2 text-xs"
              >
                Go Back
              </button>
            </div>
          </div>
        )}

        {/* Registering State */}
        {step === 'registering' && (
          <div className="space-y-6 animate-fade-in text-center">
            <div className="w-16 h-16 mx-auto border-2 border-skaus-primary border-t-transparent rounded-full animate-spin" />
            <div className="space-y-2">
              <h2 className="text-display-sm">Registering...</h2>
              <p className="text-sm text-skaus-muted">
                Deriving your stealth keys and registering<br />
                <span className="text-white font-mono">@{username}</span> on Solana.
              </p>
            </div>
            <div className="space-y-1 text-xs text-skaus-muted">
              <p>Approve the wallet signature when prompted.</p>
              <p>This signs your PIN into the key derivation.</p>
            </div>
          </div>
        )}

        {/* Done */}
        {step === 'done' && (
          <div className="space-y-6 animate-scale-in text-center">
            <div className="w-16 h-16 mx-auto rounded-full bg-skaus-primary/20 flex items-center justify-center">
              <svg className="w-8 h-8 text-skaus-primary" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
              </svg>
            </div>

            <div className="space-y-2">
              <h2 className="text-display-sm">You&apos;re all set!</h2>
              <p className="text-sm text-skaus-muted">
                Your private payment link is live.
              </p>
            </div>

            <div className="glass-card p-6 space-y-3">
              <p className="section-label">YOUR LINK</p>
              <p className="text-xl font-mono font-bold text-white">
                {getPublicLinkHost()}/<span className="text-skaus-primary">{username}</span>
              </p>
              {txSignature && (
                <a
                  href={`https://explorer.solana.com/tx/${txSignature}?cluster=devnet`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-skaus-muted hover:text-skaus-primary transition-colors font-mono block"
                >
                  TX: {txSignature.slice(0, 24)}...
                </a>
              )}
            </div>

            <div className="space-y-3">
              <button
                onClick={() => router.push('/dashboard')}
                className="w-full btn-primary py-3.5 rounded-xl"
              >
                GO TO DASHBOARD
              </button>
              <button
                onClick={() => router.push(`/${username}`)}
                className="w-full btn-outline py-3 rounded-xl"
              >
                VIEW YOUR PROFILE
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
