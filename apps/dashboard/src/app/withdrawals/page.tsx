import { WithdrawalForm } from './withdrawal-form';

export default function WithdrawalsPage() {
  return (
    <div className="px-8 py-8">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-neutral-100">Withdrawals</h1>
        <p className="mt-1 text-sm text-neutral-500">
          Submit a zero-knowledge proof to withdraw funds from the stealth pool
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        {/* How it works */}
        <div className="card">
          <h2 className="mb-3 text-base font-semibold text-neutral-200">How it works</h2>
          <ol className="space-y-3 text-sm text-neutral-400">
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">
                1
              </span>
              <span>Generate a withdrawal proof off-chain using your deposit note and the current merkle tree.</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">
                2
              </span>
              <span>Paste the base64-encoded proof and the public inputs (merkle root, nullifier hash, recipient, amount, fee).</span>
            </li>
            <li className="flex gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-brand-500/20 text-xs font-bold text-brand-400">
                3
              </span>
              <span>The relay service verifies the proof on-chain and transfers funds to your recipient address.</span>
            </li>
          </ol>
        </div>

        {/* Withdrawal form */}
        <div className="card">
          <h2 className="mb-4 text-base font-semibold text-neutral-200">Submit Withdrawal</h2>
          <WithdrawalForm />
        </div>
      </div>
    </div>
  );
}
