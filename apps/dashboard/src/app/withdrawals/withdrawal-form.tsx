'use client';

import { useState, useTransition } from 'react';

interface FormState {
  proof: string;
  tokenMint: string;
  merkleRoot: string;
  nullifierHash: string;
  recipient: string;
  amount: string;
  fee: string;
}

const EMPTY: FormState = {
  proof: '',
  tokenMint: '',
  merkleRoot: '',
  nullifierHash: '',
  recipient: '',
  amount: '',
  fee: '',
};

type Result =
  | { kind: 'success'; txSignature: string; status: string }
  | { kind: 'error'; message: string };

const GATEWAY = process.env.NEXT_PUBLIC_GATEWAY_URL || 'http://localhost:3001';

async function postWithdrawal(form: FormState): Promise<Result> {
  const res = await fetch(`${GATEWAY}/relay/withdraw`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      proof: form.proof.trim(),
      tokenMint: form.tokenMint.trim(),
      publicInputs: {
        merkleRoot: form.merkleRoot.trim(),
        nullifierHash: form.nullifierHash.trim(),
        recipient: form.recipient.trim(),
        amount: form.amount.trim(),
        fee: form.fee.trim(),
      },
    }),
  });

  const data = await res.json();
  if (!res.ok) {
    return { kind: 'error', message: data?.error ?? `HTTP ${res.status}` };
  }
  return { kind: 'success', txSignature: data.txSignature, status: data.status };
}

export function WithdrawalForm() {
  const [form, setForm] = useState<FormState>(EMPTY);
  const [result, setResult] = useState<Result | null>(null);
  const [isPending, startTransition] = useTransition();

  function handleChange(field: keyof FormState, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
    setResult(null);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    startTransition(async () => {
      const res = await postWithdrawal(form);
      setResult(res);
      if (res.kind === 'success') {
        setForm(EMPTY);
      }
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <div>
        <label className="label">ZK Proof (base64)</label>
        <textarea
          required
          rows={3}
          placeholder="Aes0x..."
          value={form.proof}
          onChange={(e) => handleChange('proof', e.target.value)}
          className="input font-mono text-xs"
        />
      </div>

      <div>
        <label className="label">Token Mint Address</label>
        <input
          type="text"
          required
          placeholder="EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v"
          value={form.tokenMint}
          onChange={(e) => handleChange('tokenMint', e.target.value)}
          className="input font-mono text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Merkle Root</label>
          <input
            type="text"
            required
            placeholder="0x..."
            value={form.merkleRoot}
            onChange={(e) => handleChange('merkleRoot', e.target.value)}
            className="input font-mono text-xs"
          />
        </div>
        <div>
          <label className="label">Nullifier Hash</label>
          <input
            type="text"
            required
            placeholder="0x..."
            value={form.nullifierHash}
            onChange={(e) => handleChange('nullifierHash', e.target.value)}
            className="input font-mono text-xs"
          />
        </div>
      </div>

      <div>
        <label className="label">Recipient Address</label>
        <input
          type="text"
          required
          placeholder="Solana public key..."
          value={form.recipient}
          onChange={(e) => handleChange('recipient', e.target.value)}
          className="input font-mono text-xs"
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="label">Amount (lamports)</label>
          <input
            type="text"
            required
            placeholder="1000000"
            value={form.amount}
            onChange={(e) => handleChange('amount', e.target.value)}
            className="input"
          />
        </div>
        <div>
          <label className="label">Fee (lamports)</label>
          <input
            type="text"
            required
            placeholder="100000"
            value={form.fee}
            onChange={(e) => handleChange('fee', e.target.value)}
            className="input"
          />
        </div>
      </div>

      {result && (
        <div
          className={[
            'rounded-lg border px-4 py-3 text-sm',
            result.kind === 'success'
              ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-400'
              : 'border-red-500/30 bg-red-500/10 text-red-400',
          ].join(' ')}
        >
          {result.kind === 'success' ? (
            <>
              <p className="font-semibold">Withdrawal submitted!</p>
              <p className="mt-1 font-mono text-xs break-all">
                Tx: {result.txSignature}
              </p>
              <p className="mt-1 text-xs opacity-75">Status: {result.status}</p>
            </>
          ) : (
            <>
              <p className="font-semibold">Submission failed</p>
              <p className="mt-1 text-xs">{result.message}</p>
            </>
          )}
        </div>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="btn-primary w-full justify-center"
      >
        {isPending ? 'Submitting…' : 'Submit Withdrawal'}
      </button>
    </form>
  );
}
