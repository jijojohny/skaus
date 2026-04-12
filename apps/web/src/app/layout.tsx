import type { Metadata, Viewport } from 'next';
import { PrivyAuthProvider } from '@/components/PrivyAuthProvider';
import './globals.css';

export const metadata: Metadata = {
  title: 'SKAUS — Private Payments on Solana',
  description: 'Get paid. Stay private. Privacy-preserving payment infrastructure on Solana with stealth addresses and ZK proofs.',
};

/** Lets `env(safe-area-inset-*)` apply so embedded wallet / Privy sheets clear notches & home indicators. */
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&family=JetBrains+Mono:wght@400;500;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body className="min-h-screen min-h-[100dvh] overflow-x-clip">
        <PrivyAuthProvider>
          {children}
        </PrivyAuthProvider>
      </body>
    </html>
  );
}
