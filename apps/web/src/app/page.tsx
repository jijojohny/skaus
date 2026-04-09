'use client';

import Link from 'next/link';

export default function Home() {
  return (
    <main className="flex flex-col items-center justify-center min-h-screen px-6">
      <div className="max-w-2xl text-center space-y-8">
        <div className="space-y-4">
          <h1 className="text-6xl font-bold tracking-tight">
            <span className="gradient-text">SKAUS</span>
          </h1>
          <p className="text-xl text-skaus-muted leading-relaxed">
            Privacy-preserving payments on Solana.
            <br />
            Send and receive funds — cryptographically unlinkable.
          </p>
        </div>

        <div className="flex flex-col sm:flex-row gap-4 justify-center">
          <Link
            href="/pay/demo"
            className="px-8 py-3 rounded-xl bg-skaus-primary hover:bg-skaus-primary/90 text-white font-semibold transition-all hover:shadow-lg hover:shadow-skaus-primary/25"
          >
            Try a Payment
          </Link>
          <Link
            href="/dashboard"
            className="px-8 py-3 rounded-xl glass-card text-skaus-text font-semibold hover:bg-skaus-surface transition-all"
          >
            Recipient Dashboard
          </Link>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 pt-12">
          <FeatureCard
            title="Stealth Pool"
            description="Shared liquidity pool with ZK withdrawals. On-chain observers see pool activity, not your payment graph."
          />
          <FeatureCard
            title="Universal Links"
            description="Share a link or QR. Senders use any Solana wallet — no SKAUS install needed."
          />
          <FeatureCard
            title="Opt-In Compliance"
            description="Viewing keys and disclosure packages. Privacy by default, transparency on your terms."
          />
        </div>
      </div>
    </main>
  );
}

function FeatureCard({ title, description }: { title: string; description: string }) {
  return (
    <div className="glass-card p-6 text-left space-y-2">
      <h3 className="text-lg font-semibold text-white">{title}</h3>
      <p className="text-sm text-skaus-muted leading-relaxed">{description}</p>
    </div>
  );
}
