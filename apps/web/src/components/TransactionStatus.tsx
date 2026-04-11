'use client';

interface TransactionStatusProps {
  status: 'preparing' | 'signing' | 'confirming' | 'done' | 'error';
  signature: string | null;
  progressText?: string;
  allSignatures?: string[];
  /** Light card (public pay link) */
  tone?: 'dark' | 'light';
}

const STEPS = [
  { key: 'preparing', label: 'Preparing deposit', description: 'Computing commitment and encrypting note...' },
  { key: 'signing', label: 'Awaiting signature', description: 'Please approve in your wallet...' },
  { key: 'confirming', label: 'Confirming on-chain', description: 'Waiting for Solana confirmation...' },
  { key: 'done', label: 'Complete', description: 'Payment deposited into the stealth pool.' },
] as const;

export function TransactionStatus({
  status,
  signature,
  progressText,
  allSignatures,
  tone = 'dark',
}: TransactionStatusProps) {
  const currentIndex = STEPS.findIndex(s => s.key === status);
  const light = tone === 'light';
  const muted = light ? 'text-neutral-500' : 'text-skaus-muted';
  const titleActive = light ? 'text-neutral-900' : 'text-white';
  const titleIdle = light ? 'text-neutral-400' : 'text-skaus-muted';
  const ringIdle = light ? 'bg-neutral-100 border border-neutral-200' : 'bg-skaus-surface border border-skaus-border';
  const desc = light ? 'text-neutral-500' : 'text-skaus-muted';

  return (
    <div className="space-y-6">
      {progressText && (
        <p className={`text-xs text-center font-mono ${muted}`}>{progressText}</p>
      )}

      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const isActive = step.key === status;
          const isComplete = i < currentIndex;

          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 transition-all duration-300 ${
                isComplete
                  ? 'bg-skaus-primary'
                  : isActive
                    ? 'bg-skaus-primary/20 border-2 border-skaus-primary animate-pulse'
                    : ringIdle
              }`}>
                {isComplete ? (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-skaus-primary' : light ? 'bg-neutral-300' : 'bg-skaus-muted'}`} />
                )}
              </div>
              <div>
                <p className={`text-sm font-semibold ${isActive || isComplete ? titleActive : titleIdle}`}>
                  {step.label}
                </p>
                {isActive && (
                  <p className={`text-xs mt-0.5 ${desc}`}>{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status === 'done' && (allSignatures?.length || signature) && (
        <div className="space-y-3">
          <div className="p-3 bg-skaus-primary/10 border border-skaus-primary/30 rounded-xl">
            <p className="text-sm text-skaus-primary font-bold">
              Payment sent successfully
              {allSignatures && allSignatures.length > 1 && ` (${allSignatures.length} transactions)`}
            </p>
            {(allSignatures || [signature]).filter(Boolean).map((sig, i) => (
              <a
                key={i}
                href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
                target="_blank"
                rel="noopener noreferrer"
                className={`text-xs mt-1 font-mono break-all block hover:text-skaus-primary transition-colors ${light ? 'text-neutral-600' : 'text-skaus-muted'}`}
              >
                {sig}
              </a>
            ))}
          </div>
          <p className={`text-xs text-center ${muted}`}>
            The recipient will detect this deposit via their scan key.
          </p>
        </div>
      )}
    </div>
  );
}
