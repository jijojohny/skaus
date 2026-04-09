'use client';

interface TransactionStatusProps {
  status: 'preparing' | 'signing' | 'confirming' | 'done' | 'error';
  signature: string | null;
}

const STEPS = [
  { key: 'preparing', label: 'Preparing deposit', description: 'Computing commitment and encrypting note...' },
  { key: 'signing', label: 'Awaiting signature', description: 'Please approve in your wallet...' },
  { key: 'confirming', label: 'Confirming on-chain', description: 'Waiting for Solana confirmation...' },
  { key: 'done', label: 'Complete', description: 'Payment deposited into the stealth pool.' },
] as const;

export function TransactionStatus({ status, signature }: TransactionStatusProps) {
  const currentIndex = STEPS.findIndex(s => s.key === status);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        {STEPS.map((step, i) => {
          const isActive = step.key === status;
          const isComplete = i < currentIndex;

          return (
            <div key={step.key} className="flex items-start gap-3">
              <div className={`mt-0.5 w-6 h-6 rounded-full flex items-center justify-center shrink-0 ${
                isComplete
                  ? 'bg-skaus-success'
                  : isActive
                    ? 'bg-skaus-primary animate-pulse'
                    : 'bg-skaus-border'
              }`}>
                {isComplete ? (
                  <svg className="w-3.5 h-3.5 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={3} d="M5 13l4 4L19 7" />
                  </svg>
                ) : (
                  <span className={`w-2 h-2 rounded-full ${isActive ? 'bg-white' : 'bg-skaus-muted'}`} />
                )}
              </div>
              <div>
                <p className={`text-sm font-medium ${isActive || isComplete ? 'text-white' : 'text-skaus-muted'}`}>
                  {step.label}
                </p>
                {isActive && (
                  <p className="text-xs text-skaus-muted mt-0.5">{step.description}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {status === 'done' && signature && (
        <div className="space-y-3">
          <div className="p-3 bg-skaus-success/10 border border-skaus-success/30 rounded-lg">
            <p className="text-sm text-skaus-success font-medium">Payment sent successfully</p>
            <p className="text-xs text-skaus-muted mt-1 font-mono break-all">{signature}</p>
          </div>
          <p className="text-xs text-skaus-muted text-center">
            The recipient will detect this deposit via their scan key.
            On-chain, this is indistinguishable from any other pool deposit.
          </p>
        </div>
      )}
    </div>
  );
}
